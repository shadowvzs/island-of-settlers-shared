import { secondsToTicks, TICK_HZ } from "../../time/constants.ts";
import type { ScriptEventKind } from "../catalog/events.ts";
import { SCRIPT_LIMITS } from "../constants.ts";
import type { ScriptEmission } from "../types/emission.ts";
import type { ScriptRun, ScriptRunOwner, ScriptRunState } from "../types/run-state.ts";
import type { MapScript, ScriptVariable } from "../types/script.ts";
import type { ActionArg, ActionOutcome, ScriptAction } from "../types/triggers.ts";
import type { ActorHandleValue, ScriptValue } from "../types/values.ts";
import { evaluateCondition, variableDependency } from "./conditions.ts";
import {
  applyCinematicStep, cinematicMembers, completeCinematicWalk, endCinematic, isSequenceDue
} from "./cinematics.ts";
import { buildScriptLookup, type EvalFrame, type ScriptEngineCore, type ScriptLookup } from "./core.ts";
import { matchEmission } from "./event-matching.ts";
import { hashScriptRunState } from "./hash.ts";
import { confirmHomeClaim, grantHomeReward } from "./home-reward-grants.ts";
import { moveDeferredIntoQueue, queueTimeEvents } from "./engine-queue.ts";
import { InstanceIndex } from "./instance-index.ts";
import { MultiboardRuntime } from "./multiboards.ts";
import type { ScriptLogCode, ScriptLogEntry, ScriptWorldPort } from "./ports.ts";
import type { QuestClaimRequest } from "./quest-claims.ts";
import { evaluateQuests, runHiddenQuestSteps } from "./quest-evaluation.ts";
import {
  applyQuestAction, checkDeadlines, claimQuest, failQuest, type QuestList, rearmQuests, retryQuest, succeedQuest
} from "./quest-state.ts";
import { nextRandom } from "./rng.ts";
import { RunScheduler } from "./run-scheduler.ts";
import { createScriptRunState, type ScriptRunStateOptions } from "./run-state.ts";
import {
  buildSubscriptionIndex, SCRIPT_EVENT_KIND_INDEX, type SubscriptionIndex
} from "./subscriptions.ts";
import { expireTimers, timerVariables } from "./timers.ts";
import type { ScriptTraceSink } from "./trace.ts";
import { type ScriptUiEffect, waitingUiHighlights } from "./ui-effects.ts";
import { dropHandleFromVariables } from "./variables.ts";

/**
 * The map script engine (design §6): pure and deterministic, shared by the client simulation, the server bundle
 * and the verifier. The simulation emits events during a tick; `endTick` advances the script clock (live ticks
 * only), wakes waits, delivers the queued events to triggers in list order and runs the runs within the fixed
 * step budgets. In catch-up mode nothing is delivered and the script clock stays frozen (design §7.4, rev B2).
 */

export type ScriptEngineMode = "live" | "catchUp";

export interface QueuedEvent {
  depth: number;
  emission: ScriptEmission;
  triggers: number[];
}

const LOG_CAPACITY = 256;

const scalarOf = (value: ScriptValue) => {
  const raw = value.value;
  return typeof raw === "number" || typeof raw === "string" || typeof raw === "boolean" ? raw : undefined;
};

export class ScriptEngine implements ScriptEngineCore {
  readonly lookup: ScriptLookup;
  readonly port: ScriptWorldPort;
  readonly script: MapScript;
  readonly state: ScriptRunState;
  /** Matched events of the current tick, in emission order. */
  readonly queue: QueuedEvent[] = [];
  /** Test play debug log sink; attaching one changes neither the run state nor its hash. */
  trace: ScriptTraceSink | undefined = undefined;
  readonly uiOutbox: ScriptUiEffect[] = [];
  private readonly boards: MultiboardRuntime;
  private readonly dirty = new Set<string>();
  private readonly disabled: Set<string>;
  private readonly index: SubscriptionIndex;
  private readonly instances = new InstanceIndex();
  private logEntries: ScriptLogEntry[] = [];
  private modeValue: ScriptEngineMode = "live";
  /** Set by `endCatchUp`: hidden quests that succeeded offline claim on the first live tick (design §6.14). */
  private hiddenStepsPending = false;
  /** Set by `endCatchUp`: world-reading waits (region membership included) re-check on the first live tick. */
  private worldRecheckPending = false;
  private readonly scheduler: RunScheduler;
  private readonly timers: readonly ScriptVariable[];

  private constructor(state: ScriptRunState, port: ScriptWorldPort) {
    this.state = state;
    this.port = port;
    this.script = state.snapshot.script;
    this.lookup = buildScriptLookup(this.script);
    this.index = buildSubscriptionIndex(this.script, secondsToTicks);
    this.disabled = new Set(state.disabledTriggers);
    this.timers = timerVariables(this.script);
    this.instances.rebuild(state);
    this.boards = new MultiboardRuntime(this);
    this.scheduler = new RunScheduler(this);
  }

  /** A fresh engine at map start; call `start("mapStarted")` before the first tick. */
  static create(script: MapScript, options: ScriptRunStateOptions & { port: ScriptWorldPort }) {
    return new ScriptEngine(createScriptRunState(script, options), options.port);
  }

  /** An engine over a saved run state (rebuilds every derived index). */
  static load(state: ScriptRunState, port: ScriptWorldPort) {
    return new ScriptEngine(state, port);
  }

  get mode() {
    return this.modeValue;
  }

  setMode(mode: ScriptEngineMode) {
    this.modeValue = mode;
  }

  /** One bit test: emission sites skip building payloads for kinds nobody listens to (and during catch-up). */
  isSubscribed(kind: ScriptEventKind) {
    return this.modeValue === "live" && this.index.subscribed[SCRIPT_EVENT_KIND_INDEX[kind]] === 1;
  }

  /** Queues `mapStarted` (fresh run state) or `scriptUpdated` (migrated revision) for the first tick. */
  start(kind: "mapStarted" | "scriptUpdated") {
    this.emit({ kind });
  }

  emit(emission: ScriptEmission) {
    if (!this.isSubscribed(emission.kind)) return;
    const triggers = matchEmission(this, this.index, emission, this.instances);
    if (triggers.length === 0) return;
    const depth = this.scheduler.emissionDepth();
    if (depth <= SCRIPT_LIMITS.cascadeDepth) {
      this.queue.push({ depth, emission, triggers });
      return;
    }
    this.log("cascadeDeferred", emission.kind);
    this.state.deferred.push({ emission, triggerIds: triggers.map(index => this.script.triggers[index]!.id) });
  }

  /** End of a live simulation tick: advance the script clock, wake waits, deliver events, run runs. */
  endTick() {
    if (this.modeValue === "catchUp") return;
    this.state.scriptTick += 1;
    const secondBoundary = this.state.scriptTick % TICK_HZ === 0;
    if (secondBoundary) this.state.firesThisSecond = {};
    this.scheduler.resetBudgets();
    moveDeferredIntoQueue(this.state, this.lookup, this.queue);
    queueTimeEvents(this.index, this.state.scriptTick, this.queue);
    expireTimers(this, this.timers);
    this.scheduler.wakeDue();
    if (this.hiddenStepsPending) {
      this.hiddenStepsPending = false;
      runHiddenQuestSteps(this, this.startQuestList);
    }
    if (secondBoundary) {
      this.boards.markWorld();
      checkDeadlines(this, this.startQuestList, false);
      rearmQuests(this, this.startQuestList);
      evaluateQuests(this, this.startQuestList, { automatic: true });
    }
    const worldCadence = secondBoundary || this.worldRecheckPending;
    this.worldRecheckPending = false;
    this.scheduler.processAll(worldCadence);
  }

  /** Delivers queued events and continues runnable runs without advancing the clock (CIN hold, island leave). */
  drainPending() {
    if (this.modeValue === "catchUp") return;
    this.scheduler.resetBudgets();
    this.scheduler.processAll(false);
  }

  /**
   * Back to live after catch-up: the single date-bound deadline check and one quest pass over the counters catch-up
   * maintained (design §7.4); hidden quests claim and world-reading waits (`actorInRegion` …) re-check on the
   * first live tick, not here (§6.4).
   */
  endCatchUp() {
    this.modeValue = "live";
    this.worldRecheckPending = true;
    checkDeadlines(this, this.startQuestList, true);
    evaluateQuests(this, this.startQuestList, { automatic: false });
    this.hiddenStepsPending = true;
  }

  completeAction(actionId: number, outcome: ActionOutcome) {
    if (completeCinematicWalk(this, actionId)) return;
    this.scheduler.completeAction(actionId, outcome);
  }

  /** The map ended: every run and queued firing is dropped (trigger design §11); triggers stay subscribed. */
  dropAllRuns() {
    this.scheduler.dropAllRuns();
  }

  /** The playing sequence (CIN4), null when none plays; saved run state. */
  activeCinematic() {
    return this.state.cinematic?.active ?? null;
  }

  /** The recorded `applyCinematicStep` command: the active sequence's next world step; false when refused. */
  applyCinematicStep(sequenceId: string, stepId: string) {
    return applyCinematicStep(this, sequenceId, stepId);
  }

  /** The recorded `endCinematic` command: the remaining world steps apply, the next queued sequence starts. */
  endCinematic(sequenceId: string, skipped: boolean) {
    return endCinematic(this, sequenceId, skipped);
  }

  /** Units the active sequence names: invulnerable and skipped by the AI while it plays (§6.6). */
  cinematicMembers() {
    return cinematicMembers(this);
  }

  /** The recorded `scriptUiAck` command: resumes the run waiting on this highlight; false when none waits. */
  acknowledgeUi(effectId: string) {
    return this.scheduler.acknowledgeUi(effectId);
  }

  /** Presentation effects since the last call (live ticks only; never saved or hashed). */
  takeUiEffects() {
    return this.uiOutbox.splice(0, this.uiOutbox.length);
  }

  /** Highlights whose run waits on `uiAck`, re-derived from the run state (survives a reload). */
  waitingUiHighlights() {
    return waitingUiHighlights(this, run => this.rootList(run.owner));
  }

  /** A fully gone object: dropped from every actor variable holding it (owner 28). */
  releaseHandle(handle: ActorHandleValue) {
    return dropHandleFromVariables(this, handle);
  }

  /** Rebuilds the handle → instance index after binding changes (TRG3a). */
  rebuildInstanceIndex() {
    this.instances.rebuild(this.state);
  }

  activateQuest(questId: string) {
    applyQuestAction(this, "activateQuest", questId, this.startQuestList);
  }

  completeQuest(questId: string) {
    succeedQuest(this, questId, this.startQuestList);
  }

  failQuest(questId: string) {
    failQuest(this, questId, this.startQuestList);
  }

  /** The recorded claim command's engine step (TRG6): the decision says why it was refused or what it pays. */
  claimQuest(questId: string, request?: QuestClaimRequest) {
    return claimQuest(this, questId, this.startQuestList, request);
  }

  /** The player's "try again" on a failed quest with `retryAfterFail`. */
  retryQuest(questId: string) {
    return retryQuest(this, questId, this.startQuestList);
  }

  /** The server ledger confirmed a declared home reward: it leaves the claim queue. */
  confirmHomeClaim(rewardId: string, occurrence: string) {
    return confirmHomeClaim(this, rewardId, occurrence);
  }

  /**
   * The multiboards the viewer faction sees (design §6.9), for the UI snapshot cadence: only dirty cells are
   * evaluated, and the list and its unchanged boards, rows and cells keep their identity.
   */
  multiboardSnapshots(viewer: number) {
    return this.boards.snapshots(viewer);
  }

  /** A JSON copy of the run state (the saved form). */
  saveState(): ScriptRunState {
    return JSON.parse(JSON.stringify(this.state)) as ScriptRunState;
  }

  hash() {
    return hashScriptRunState(this.state);
  }

  /** Debug log lines since the last call (not saved, not hashed). */
  takeLog() {
    const entries = this.logEntries;
    this.logEntries = [];
    return entries;
  }

  // ScriptEngineCore

  applyMultiboardAction(frame: EvalFrame, op: string, args: Record<string, ActionArg>) {
    this.boards.applyAction(frame, op, args);
  }

  applyQuestAction(op: string, questId: string) {
    applyQuestAction(this, op, questId, this.startQuestList);
  }

  grantHomeReward(rewardId: string) {
    grantHomeReward(this, rewardId);
  }

  callTrigger(parent: ScriptRun, triggerId: string, checkConditions: boolean) {
    const trigger = this.lookup.triggerById.get(triggerId);
    if (!trigger) {
      this.log("unknownReference", `trigger ${triggerId}`);
      return null;
    }
    const depth = parent.depth + 1;
    if (depth > SCRIPT_LIMITS.cascadeDepth) {
      this.log("chainDepth", `${triggerId} at depth ${depth}`);
      return null;
    }
    const context = { ...parent.context };
    if (checkConditions && !evaluateCondition(this, { context, id: null, locals: {} }, trigger.conditions)) return null;
    return this.scheduler.createRun({ kind: "trigger", triggerId }, context, depth).id;
  }

  isTriggerEnabled(triggerId: string) {
    return this.lookup.triggerById.has(triggerId) && !this.disabled.has(triggerId);
  }

  setTriggerEnabled(triggerId: string, enabled: boolean) {
    if (!this.lookup.triggerById.has(triggerId) || this.isTriggerEnabled(triggerId) === enabled) return;
    if (enabled) this.disabled.delete(triggerId);
    else this.disabled.add(triggerId);
    this.state.disabledTriggers = this.script.triggers.map(trigger => trigger.id).filter(id => this.disabled.has(id));
  }

  log(code: ScriptLogCode, detail: string) {
    if (this.logEntries.length >= LOG_CAPACITY) this.logEntries.shift();
    this.logEntries.push({ code, detail, scriptTick: this.state.scriptTick });
  }

  markDependency(key: string) {
    this.dirty.add(key);
    this.boards.markDependency(key);
  }

  /** Consumes the changed dependency keys (the scheduler re-checks waiting conditions against them). */
  takeDirty() {
    const keys = new Set(this.dirty);
    this.dirty.clear();
    return keys;
  }

  nextRandomUnit() {
    const draw = nextRandom(this.state.rng);
    this.state.rng = draw.state;
    return draw.unit;
  }

  writeVariable(id: string, value: ScriptValue) {
    const previous = this.state.values[id];
    this.state.values[id] = value;
    this.instances.replaceVariable(id, previous, value);
    this.markDependency(variableDependency(id));
    this.trace?.({ kind: "variable", value, variableId: id });
    if (!this.isSubscribed("variableChanged")) return;
    const equals = scalarOf(value);
    this.emit({
      kind: "variableChanged",
      responses: {
        newValue: value, ...(previous ? { oldValue: previous } : {}), variable: { type: "string", value: id }
      },
      values: equals === undefined ? { variable: id } : { equals, variable: id }
    });
  }

  rootList(owner: ScriptRunOwner): readonly ScriptAction[] | null {
    if (owner.kind === "trigger") return this.lookup.triggerById.get(owner.triggerId)?.actions ?? null;
    if (owner.kind === "quest") return this.lookup.questById.get(owner.questId)?.[owner.list] ?? null;
    return null;
  }

  /** Quest lists as runs; `onSuccess` waits for the quest's completion sequence while it is due (CIN4). */
  readonly startQuestList = (questId: string, list: QuestList) => {
    const quest = this.lookup.questById.get(questId);
    if ((quest?.[list].length ?? 0) === 0) return;
    const run = this.scheduler.createRun({ kind: "quest", list, questId }, {}, 0);
    const sequenceId = list === "onSuccess" ? quest?.completeSequence?.id : undefined;
    if (sequenceId && isSequenceDue(this, sequenceId)) run.waiting = { kind: "sequence", sequenceId };
  };
}
