import { secondsToTicks } from "../../time/constants.ts";
import type { ScriptRun } from "../types/run-state.ts";
import type { ActionOutcome, ScriptAction } from "../types/triggers.ts";
import type { ActorHandleValue } from "../types/values.ts";
import { queueSequence } from "./cinematics.ts";
import { conditionDependencies, evaluateCondition } from "./conditions.ts";
import type { ScriptEngineCore } from "./core.ts";
import { createEvalScope, evaluateExpr, evaluateTicks } from "./expressions.ts";
import { MULTIBOARD_OPS } from "./multiboards.ts";
import { advance, enterBranch, enterLoop } from "./run-flow.ts";
import { applyTimerAction, TIMER_OPS } from "./timers.ts";
import { runUiAction, UI_EFFECT_OPS } from "./ui-effects.ts";
import { applyVariableAction, storeHandles, VARIABLE_OPS } from "./variables.ts";

/**
 * Executes one step of a run (design §4.8, §6.5). Flow steps move the program counter; `do` steps run engine
 * actions (variables, timers, triggers, quests) here and every other action through the world port. A step that
 * starts a wait advances the counter first, so the run resumes after it.
 */

export type StepResult = "next" | "entered" | "wait" | "end";

const QUEST_OPS: ReadonlySet<string> = new Set(["activateQuest", "completeQuest", "failQuest", "resetQuest"]);
/** Declared home rewards never pay in the simulation: the grant joins the claim queue (§4.14). */
const HOME_REWARD_OP = "grantHomeReward";
const PLAY_SEQUENCE_OP = "playSequence";
const TRIGGER_OPS: ReadonlySet<string> = new Set(["disableTrigger", "enableTrigger"]);

type DoStep = Extract<ScriptAction, { k: "do" }>;

const refIdOf = (arg: unknown) => (arg as { id?: string } | undefined)?.id ?? "";

export const setOutcome = (run: ScriptRun, outcome: ActionOutcome) => {
  run.context.outcome = { type: "string", value: outcome };
};

const timerSeconds = (core: ScriptEngineCore, run: ScriptRun, step: DoStep) => {
  const seconds = step.args.seconds;
  if (!seconds || !("k" in seconds)) return null;
  const value = evaluateExpr(core, run, seconds as Parameters<typeof evaluateExpr>[2]);
  return typeof value === "number" ? value : null;
};

/** Engine-owned actions; false when the op belongs to the world port. */
const applyEngineAction = (core: ScriptEngineCore, run: ScriptRun, step: DoStep) => {
  if (VARIABLE_OPS.has(step.op)) {
    applyVariableAction(core, run, step.op, step.args);
    return true;
  }
  if (TIMER_OPS.has(step.op)) {
    applyTimerAction(core, step.op, refIdOf(step.args.timer), timerSeconds(core, run, step));
    return true;
  }
  if (MULTIBOARD_OPS.has(step.op)) {
    core.applyMultiboardAction(run, step.op, step.args);
    return true;
  }
  if (TRIGGER_OPS.has(step.op)) {
    core.setTriggerEnabled(refIdOf(step.args.trigger), step.op === "enableTrigger");
    return true;
  }
  if (QUEST_OPS.has(step.op)) {
    core.applyQuestAction(step.op, refIdOf(step.args.quest));
    return true;
  }
  if (step.op === HOME_REWARD_OP) {
    core.grantHomeReward(refIdOf(step.args.reward));
    return true;
  }
  return false;
};

const timeoutTickOf = (core: ScriptEngineCore, step: DoStep) =>
  step.wait ? core.state.scriptTick + Math.max(1, secondsToTicks(step.wait.timeoutSeconds)) : null;

/** A spawn's new units: the `lastSpawned` response of the run and the optional `store` actor variable. */
const recordSpawned = (core: ScriptEngineCore, run: ScriptRun, step: DoStep, spawned: readonly ActorHandleValue[]) => {
  run.context.lastSpawned = spawned.length === 1 ? spawned[0]! : { type: "actorGroup", value: [...spawned] };
  const store = refIdOf(step.args.store);
  if (store) storeHandles(core, store, spawned);
};

const runWorldAction = (core: ScriptEngineCore, run: ScriptRun, step: DoStep): StepResult => {
  const deadline = timeoutTickOf(core, step);
  const result = core.port.performAction({
    args: step.args, deadlineScriptTick: deadline, op: step.op, overridable: step.overridable ?? true,
    runId: run.id, scope: createEvalScope(core, run), stepId: step.id, wait: step.wait !== undefined
  });
  if (result.kind !== "failed" && result.spawned) recordSpawned(core, run, step, result.spawned);
  if (result.kind === "pending" && step.wait) {
    advance(run);
    run.waiting = { actionId: result.actionId, kind: "action", stepId: step.id, timeoutScriptTick: deadline! };
    return "wait";
  }
  if (result.kind === "failed") core.log("actionFailed", `${step.op} ${step.id}: ${result.outcome}`);
  if (!step.wait) return "next";
  const outcome = result.kind === "failed" ? result.outcome : "done";
  setOutcome(run, outcome);
  return outcome !== "done" && step.wait.onFail === "stop" ? "end" : "next";
};

/** `playSequence` (§5.2.5, CIN4): queues the sequence; with a wait spec the run resumes when it ends or is skipped. */
const runPlaySequence = (core: ScriptEngineCore, run: ScriptRun, step: DoStep): StepResult => {
  const sequenceId = refIdOf(step.args.sequence);
  const queued = queueSequence(core, sequenceId);
  if (!step.wait) return "next";
  if (!queued) {
    setOutcome(run, "refused");
    return step.wait.onFail === "stop" ? "end" : "next";
  }
  advance(run);
  run.waiting = { kind: "sequence", sequenceId };
  return "wait";
};

const runDo = (core: ScriptEngineCore, run: ScriptRun, step: DoStep): StepResult => {
  if (step.op === PLAY_SEQUENCE_OP) return runPlaySequence(core, run, step);
  if (applyEngineAction(core, run, step)) return "next";
  if (UI_EFFECT_OPS.has(step.op)) return runUiAction(core, run, step);
  return runWorldAction(core, run, step);
};

const runWait = (core: ScriptEngineCore, run: ScriptRun, step: Extract<ScriptAction, { k: "wait" }>) => {
  const ticks = evaluateTicks(core, run, step.seconds);
  if (ticks <= 0) return "next";
  advance(run);
  run.waiting = { kind: "ticks", untilScriptTick: core.state.scriptTick + ticks };
  return "wait";
};

const runWaitUntil = (core: ScriptEngineCore, run: ScriptRun, step: Extract<ScriptAction, { k: "waitUntil" }>) => {
  if (evaluateCondition(core, run, step.cond)) return "next";
  advance(run);
  const timeout = step.timeoutSeconds === null ? null : core.state.scriptTick + secondsToTicks(step.timeoutSeconds);
  run.waiting = { deps: conditionDependencies(step.cond), kind: "condition", timeoutScriptTick: timeout };
  return "wait";
};

const runCall = (core: ScriptEngineCore, run: ScriptRun, step: Extract<ScriptAction, { k: "runTrigger" }>) => {
  const childId = core.callTrigger(run, step.trigger.id, step.checkConditions);
  if (childId === null || !step.wait) return "next";
  advance(run);
  run.waiting = { kind: "run", runId: childId };
  return "wait";
};

/** Executes the step the run's counter points at; "next" means the caller advances the counter. */
export const executeStep = (core: ScriptEngineCore, run: ScriptRun, step: ScriptAction): StepResult => {
  if (step.disabled) return "next";
  switch (step.k) {
    case "comment": return "next";
    case "stop": return "end";
    case "do": return runDo(core, run, step);
    case "wait": return runWait(core, run, step);
    case "waitUntil": return runWaitUntil(core, run, step);
    case "runTrigger": return runCall(core, run, step);
    case "if":
      enterBranch(run, evaluateCondition(core, run, step.cond) ? 0 : 1);
      return "entered";
    case "forEach":
    case "forRange":
    case "repeat": return enterLoop(core, run, step) ? "entered" : "next";
  }
};
