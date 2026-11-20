import { SCRIPT_LIMITS } from "../constants.ts";
import type { ScriptEmission } from "../types/emission.ts";
import type { RunContextValue, ScriptRun, ScriptRunOwner } from "../types/run-state.ts";
import type { ActionOutcome, ScriptAction } from "../types/triggers.ts";
import { evaluateCondition, WORLD_DEPENDENCY } from "./conditions.ts";
import type { ScriptEngineCore } from "./core.ts";
import { advance, finishBlock, listAt, previousStep } from "./run-flow.ts";
import { executeStep, setOutcome } from "./run-steps.ts";
import { WakeQueue } from "./wake-queue.ts";

/**
 * Run scheduling (design §6.3, §6.5): trigger firing with the run limit, the per-second fire limit and the
 * concurrency policy (queue / parallel / ignore), run execution under the separate quest and trigger step budgets,
 * wake-ups on the script clock, waits on conditions, actions, UI acknowledgements and called runs.
 */

/** What the scheduler needs from the engine beyond the helper core. */
export interface SchedulerHost extends ScriptEngineCore {
  readonly queue: { depth: number; emission: ScriptEmission; triggers: number[] }[];
  rootList: (owner: ScriptRunOwner) => readonly ScriptAction[] | null;
  takeDirty: () => ReadonlySet<string>;
}

type BudgetKind = "quest" | "trigger";

/** Bound on scheduling passes per tick (each pass needs new steps, events or wake-ups; this is a safety net). */
const MAX_PASSES = 64;

const budgetKindOf = (run: ScriptRun): BudgetKind => run.owner.kind === "quest" ? "quest" : "trigger";

export class RunScheduler {
  private readonly activeByTrigger = new Map<string, number>();
  private readonly budgets: Record<BudgetKind, number> = { quest: 0, trigger: 0 };
  private executingDepth: number | null = null;
  private readonly host: SchedulerHost;
  private readonly runById = new Map<number, ScriptRun>();
  private readonly wakes = new WakeQueue();

  constructor(host: SchedulerHost) {
    this.host = host;
    for (const run of host.state.runs) this.track(run);
  }

  /** Depth of an event emitted now: one deeper than the executing run, 0 for simulation emissions. */
  emissionDepth() {
    return this.executingDepth === null ? 0 : this.executingDepth + 1;
  }

  resetBudgets() {
    this.budgets.quest = SCRIPT_LIMITS.questStepsPerTick;
    this.budgets.trigger = SCRIPT_LIMITS.triggerStepsPerTick;
  }

  /** `event`: the event kind that fired the run (test play trace only). */
  createRun(owner: ScriptRunOwner, context: Record<string, RunContextValue>, depth: number, event?: string) {
    const { state } = this.host;
    const run: ScriptRun = {
      context, depth, id: state.nextRunId, locals: {}, loops: [], owner, pc: [0], waiting: null
    };
    state.nextRunId += 1;
    state.runs.push(run);
    this.track(run);
    this.host.trace?.({ ...(event === undefined ? {} : { event }), kind: "run", owner, runId: run.id });
    return run;
  }

  /** Delivers events, continues runnable runs and re-checks waiting conditions until nothing moves. */
  processAll(worldCadence: boolean) {
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const fired = this.drainQueue();
      const ran = this.runRunnable();
      const woke = this.recheckConditions(worldCadence && pass === 0);
      if (!fired && !ran && !woke) return;
    }
  }

  wakeDue() {
    const tick = this.host.state.scriptTick;
    for (let entry = this.wakes.popDue(tick); entry; entry = this.wakes.popDue(tick)) {
      const run = this.runById.get(entry.runId);
      if (run?.waiting) this.wakeAt(run, entry.tick);
    }
  }

  completeAction(actionId: number, outcome: ActionOutcome) {
    const run = this.host.state.runs.find(item =>
      item.waiting?.kind === "action" && item.waiting.actionId === actionId);
    if (run) this.resolveAction(run, outcome);
  }

  acknowledgeUi(effectId: string) {
    const run = this.host.state.runs.find(item =>
      item.waiting?.kind === "uiAck" && item.waiting.effectId === effectId);
    if (!run) return false;
    setOutcome(run, "done");
    run.waiting = null;
    return true;
  }

  /**
   * The map ended (campaign `endMap`, trigger design §11 "endMap while runs wait"): every run and queued firing is
   * dropped. Safe inside a running step: the executing run stops at its next step check.
   */
  dropAllRuns() {
    const { state } = this.host;
    state.runs.length = 0;
    state.queued.length = 0;
    this.runById.clear();
    this.activeByTrigger.clear();
  }

  private track(run: ScriptRun) {
    this.runById.set(run.id, run);
    if (run.owner.kind === "trigger") {
      this.activeByTrigger.set(run.owner.triggerId, (this.activeByTrigger.get(run.owner.triggerId) ?? 0) + 1);
    }
    this.registerWait(run);
  }

  private registerWait(run: ScriptRun) {
    const waiting = run.waiting;
    if (!waiting) return;
    if (waiting.kind === "ticks") this.wakes.push(waiting.untilScriptTick, run.id);
    else if ("timeoutScriptTick" in waiting && waiting.timeoutScriptTick !== null) {
      this.wakes.push(waiting.timeoutScriptTick, run.id);
    }
  }

  private wakeAt(run: ScriptRun, tick: number) {
    const waiting = run.waiting!;
    if (waiting.kind === "ticks") {
      if (waiting.untilScriptTick === tick) run.waiting = null;
      return;
    }
    if (!("timeoutScriptTick" in waiting) || waiting.timeoutScriptTick !== tick) return;
    if (waiting.kind === "action" || waiting.kind === "uiAck") {
      this.resolveAction(run, "timeout");
      return;
    }
    setOutcome(run, "timeout");
    run.waiting = null;
  }

  private resolveAction(run: ScriptRun, outcome: ActionOutcome) {
    setOutcome(run, outcome);
    run.waiting = null;
    const root = this.host.rootList(run.owner) ?? [];
    const step = previousStep(root, run);
    if (outcome !== "done" && step?.k === "do" && step.wait?.onFail === "stop") this.endRun(run);
  }

  private drainQueue() {
    const { queue } = this.host;
    if (queue.length === 0) return false;
    for (let position = 0; position < queue.length; position++) {
      const entry = queue[position]!;
      for (const triggerIndex of entry.triggers) this.fire(triggerIndex, entry.emission, entry.depth);
    }
    queue.length = 0;
    return true;
  }

  private contextOf(emission: ScriptEmission): Record<string, RunContextValue> {
    const context: Record<string, RunContextValue> = { ...emission.responses };
    if (typeof emission.player === "number") context.triggeringPlayer = { type: "number", value: emission.player };
    return context;
  }

  private underFireLimit(triggerId: string) {
    const { state } = this.host;
    const fires = (state.firesThisSecond[triggerId] ?? 0) + 1;
    state.firesThisSecond[triggerId] = fires;
    if (fires <= SCRIPT_LIMITS.firesPerSecond) return true;
    this.host.setTriggerEnabled(triggerId, false);
    this.host.log("fireLimit", `${triggerId} disabled after ${SCRIPT_LIMITS.firesPerSecond} fires in one second`);
    return false;
  }

  /** One firing of a trigger by an event (design §6.3 step 3). */
  private fire(triggerIndex: number, emission: ScriptEmission, depth: number) {
    const trigger = this.host.script.triggers[triggerIndex];
    if (!trigger || !this.host.isTriggerEnabled(trigger.id)) return;
    const { state } = this.host;
    const fired = state.firedCounts[trigger.id] ?? 0;
    if (trigger.runLimit !== null && fired >= trigger.runLimit) return;
    const context = this.contextOf(emission);
    if (!evaluateCondition(this.host, { context, id: null, locals: {} }, trigger.conditions)) return;
    if (!this.underFireLimit(trigger.id)) return;
    const active = this.activeByTrigger.get(trigger.id) ?? 0;
    if (active > 0 && trigger.concurrency === "ignore") return;
    if (active === 0 || (trigger.concurrency === "parallel" && active < SCRIPT_LIMITS.parallelRuns)) {
      state.firedCounts[trigger.id] = fired + 1;
      this.executeRun(this.createRun({ kind: "trigger", triggerId: trigger.id }, context, depth, emission.kind));
      return;
    }
    this.enqueue(trigger.id, trigger.concurrency, context, fired);
  }

  private enqueue(triggerId: string, concurrency: string, context: Record<string, RunContextValue>, fired: number) {
    const { state } = this.host;
    if (concurrency === "parallel") this.host.log("parallelOverflow", triggerId);
    const waiting = state.queued.reduce((count, entry) => count + (entry.triggerId === triggerId ? 1 : 0), 0);
    if (waiting >= SCRIPT_LIMITS.queuedRuns) {
      this.host.log("queueOverflow", `${triggerId}: newest firing dropped`);
      return;
    }
    state.firedCounts[triggerId] = fired + 1;
    state.queued.push({ context, triggerId });
  }

  private runRunnable() {
    let progressed = false;
    for (const kind of ["quest", "trigger"] as const) {
      for (const run of [...this.host.state.runs]) {
        if (this.budgets[kind] <= 0) break;
        if (run.waiting !== null || budgetKindOf(run) !== kind || !this.runById.has(run.id)) continue;
        const before = this.budgets[kind];
        this.executeRun(run);
        progressed ||= this.budgets[kind] < before;
      }
    }
    return progressed;
  }

  private recheckConditions(worldCadence: boolean) {
    const dirty = this.host.takeDirty();
    if (dirty.size === 0 && !worldCadence) return false;
    let woke = false;
    for (const run of this.host.state.runs) {
      const waiting = run.waiting;
      if (waiting?.kind !== "condition") continue;
      const due = (worldCadence && waiting.deps.includes(WORLD_DEPENDENCY)) || waiting.deps.some(key => dirty.has(key));
      if (!due) continue;
      const step = previousStep(this.host.rootList(run.owner) ?? [], run);
      if (step?.k === "waitUntil" && !evaluateCondition(this.host, run, step.cond)) continue;
      run.waiting = null;
      woke = true;
    }
    return woke;
  }

  /** Executes a run until it waits, ends or its owner's step budget is exhausted. */
  private executeRun(run: ScriptRun) {
    const root = this.host.rootList(run.owner);
    if (!root) {
      this.endRun(run);
      return;
    }
    const kind = budgetKindOf(run);
    this.executingDepth = run.depth;
    try {
      this.stepUntilBlocked(run, root, kind);
    } finally {
      this.executingDepth = null;
    }
  }

  private stepUntilBlocked(run: ScriptRun, root: readonly ScriptAction[], kind: BudgetKind) {
    while (run.waiting === null) {
      if (!this.runById.has(run.id)) return;
      if (this.budgets[kind] <= 0) {
        this.host.log("budgetExhausted", `${kind} budget; run ${run.id} continues next tick`);
        return;
      }
      this.budgets[kind] -= 1;
      const list = listAt(root, run.pc);
      const index = run.pc[run.pc.length - 1]!;
      if (index >= list.length) {
        if (finishBlock(this.host, run, root)) continue;
        this.endRun(run);
        return;
      }
      const step = list[index]!;
      this.host.trace?.({
        kind: "step", ...(step.k === "do" ? { op: step.op } : {}), runId: run.id, stepId: step.id, stepKind: step.k
      });
      const result = executeStep(this.host, run, step);
      if (result === "next") advance(run);
      else if (result === "wait") this.registerWait(run);
      else if (result === "end") {
        this.endRun(run);
        return;
      }
    }
  }

  private endRun(run: ScriptRun) {
    const { state } = this.host;
    if (!this.runById.delete(run.id)) return;
    state.runs.splice(state.runs.indexOf(run), 1);
    for (const parent of state.runs) {
      if (parent.waiting?.kind === "run" && parent.waiting.runId === run.id) parent.waiting = null;
    }
    if (run.owner.kind !== "trigger") return;
    const { triggerId } = run.owner;
    this.activeByTrigger.set(triggerId, (this.activeByTrigger.get(triggerId) ?? 1) - 1);
    const next = state.queued.findIndex(entry => entry.triggerId === triggerId);
    if (next < 0) return;
    const [entry] = state.queued.splice(next, 1);
    this.createRun({ kind: "trigger", triggerId }, entry!.context, 0);
  }
}
