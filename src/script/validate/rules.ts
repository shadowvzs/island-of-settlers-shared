import { actionDef, isScriptActionKind } from "../catalog/actions.ts";
import { eventDef, isScriptEventKind } from "../catalog/events.ts";
import { SCRIPT_LIMITS } from "../constants.ts";
import { isWildlifeSubject, wildlifePinnedRegionIds } from "../engine/region-watch.ts";
import type { ScriptReference } from "../references.ts";
import type { ScriptAction, ScriptTrigger } from "../types/triggers.ts";
import { flattenSteps } from "./actions.ts";
import type { ValidationRun } from "./context.ts";

/** Whole-script rules (trigger design §11.1): cycles, unused items, runaway triggers, pins and info notes. */

const SPAWNING_OPS = new Set(["spawn", "enemyWave", "spawnAboard"]);
const REWARD_OPS = new Set(["grantHomeReward", "grantMapReward", "completeQuest"]);
const WAIT_STEPS = new Set(["wait", "waitUntil"]);

const doOps = (steps: readonly ScriptAction[]) => flattenSteps(steps)
  .flatMap(step => (step.k === "do" ? [step.op] : []));

const isWaitStep = (step: ScriptAction) => WAIT_STEPS.has(step.k) || (step.k === "do" && step.wait !== undefined) ||
  (step.k === "runTrigger" && step.wait);

/** `runTrigger` targets reached before any wait in document order (a synchronous call chain). */
const immediateCalls = (trigger: ScriptTrigger) => {
  const calls: string[] = [];
  for (const step of flattenSteps(trigger.actions)) {
    if (step.k === "runTrigger") calls.push(step.trigger.id);
    if (isWaitStep(step)) break;
  }
  return calls;
};

const checkRunTriggerCycles = (run: ValidationRun) => {
  const edges = new Map(run.script.triggers.map(trigger => [trigger.id, immediateCalls(trigger)]));
  const reaches = (from: string, target: string, seen: Set<string>): boolean => (edges.get(from) ?? [])
    .some(next => next === target || (!seen.has(next) && (seen.add(next), reaches(next, target, seen))));
  run.script.triggers.forEach((trigger, index) => {
    if (reaches(trigger.id, trigger.id, new Set()))
      run.sink.add("error", "runTriggerCycle", `triggers[${index}].actions`, { trigger: trigger.id });
  });
};

const checkTriggerWarnings = (run: ValidationRun, references: readonly ScriptReference[]) => {
  const called = new Set(references.filter(reference => reference.kind === "trigger").map(reference => reference.id));
  const fireLimited = new Set(run.context.fireLimitedTriggers ?? []);
  run.script.triggers.forEach((trigger, index) => {
    const path = `triggers[${index}]`;
    const ops = doOps(trigger.actions);
    const { name } = trigger;
    if (trigger.events.length === 0 && !called.has(trigger.id)) run.sink.add("warning", "unusedTrigger", path,
      { name });
    if (trigger.concurrency === "parallel" && ops.some(op => SPAWNING_OPS.has(op)))
      run.sink.add("warning", "parallelSpawn", path, { name });
    if (fireLimited.has(trigger.id)) run.sink.add("warning", "fireLimitedTrigger", path, { name });
    if (trigger.runLimit !== null) return;
    const emitted = new Set(ops.flatMap(op => (isScriptActionKind(op) ? actionDef(op).emits ?? [] : [])));
    const event = trigger.events.find(item => emitted.has(item.kind));
    if (event) run.sink.add("warning", "selfFeedingTrigger", path, { event: event.kind, name });
  });
};

const usedVariables = (references: readonly ScriptReference[]) => new Set(references
  .filter(reference => ["variable", "multiboard", "timer"].includes(reference.kind)).map(reference => reference.id));

const checkUnused = (run: ValidationRun, references: readonly ScriptReference[]) => {
  const variables = usedVariables(references);
  const actors = new Set(references.filter(reference => reference.kind === "actor").map(reference => reference.id));
  run.script.variables.forEach((variable, index) => {
    const value = variable.initial.value as { initiallyVisible?: boolean; window?: unknown };
    const shown = value?.initiallyVisible === true || (variable.type === "timer" && Boolean(value?.window));
    if (!variables.has(variable.id) && !shown)
      run.sink.add("warning", "unusedVariable", `variables[${index}]`, { name: variable.name });
  });
  run.script.actors.forEach((actor, index) => {
    if (!actors.has(actor.id)) run.sink.add("warning", "unusedActor", `actors[${index}]`, { name: actor.name });
  });
};

type DoStep = Extract<ScriptAction, { k: "do" }>;

const startedTimerIds = (run: ValidationRun) => {
  const { quests, triggers } = run.script;
  const lists = [
    ...triggers.map(trigger => trigger.actions),
    ...quests.quests.flatMap(quest => [quest.onActivate, quest.onSuccess, quest.onFailure])
  ];
  const starts = lists.flatMap(flattenSteps)
    .filter((step): step is DoStep => step.k === "do" && step.op === "timerStart");
  return new Set(starts.map(step => (step.args.timer as { id?: string } | undefined)?.id ?? ""));
};

/** A timer that neither starts with the map nor is started by an action never counts and never expires. */
const checkTimersStart = (run: ValidationRun) => {
  const started = startedTimerIds(run);
  run.script.variables.forEach((variable, index) => {
    if (variable.initial.type !== "timer" || variable.initial.value.autoStart || started.has(variable.id)) return;
    run.sink.add("warning", "timerNeverStarted", `variables[${index}]`, { name: variable.name });
  });
};

const checkWildlifePins = (run: ValidationRun) => {
  const regions = wildlifePinnedRegionIds(run.script, subject => isWildlifeSubject(subject, run.catalog));
  if (regions.length > SCRIPT_LIMITS.wildlifePinnedRegions)
    run.sink.add("warning", "wildlifePinsAboveLimit", "triggers", { count: regions.length,
      limit: SCRIPT_LIMITS.wildlifePinnedRegions });
};

const uiAckWaits = (steps: readonly ScriptAction[]) =>
  flattenSteps(steps).filter(step => step.k === "do" && step.op === "highlightUi" && step.wait).length;

const checkUiAckWaits = (run: ValidationRun) => {
  const { script } = run;
  const fromTriggers = script.triggers.reduce((sum, trigger) => sum + uiAckWaits(trigger.actions) *
    (trigger.concurrency === "parallel" ? SCRIPT_LIMITS.parallelRuns : 1), 0);
  const fromQuests = script.quests.quests.reduce((sum, quest) =>
    sum + uiAckWaits([...quest.onActivate, ...quest.onSuccess, ...quest.onFailure]), 0);
  const count = fromTriggers + fromQuests;
  if (count > SCRIPT_LIMITS.uiAckWaits)
    run.sink.add("error", "tooManyUiAckWaits", "triggers", { count, limit: SCRIPT_LIMITS.uiAckWaits });
};

/** Rewards granted only by triggers whose every event is a client report (not server-provable, owner R5 14). */
const checkProvability = (run: ValidationRun) => {
  run.script.triggers.forEach((trigger, index) => {
    const reported = trigger.events.length > 0 && trigger.events.every(event =>
      isScriptEventKind(event.kind) && eventDef(event.kind).source === "pres");
    const clicked = flattenSteps(trigger.actions).some(step => step.k === "do" && step.op === "highlightUi" &&
      step.wait !== undefined);
    if ((reported || clicked) && doOps(trigger.actions).some(op => REWARD_OPS.has(op)))
      run.sink.add("info", "notServerProvable", `triggers[${index}]`);
  });
};

export const checkScriptRules = (run: ValidationRun, references: readonly ScriptReference[]) => {
  checkRunTriggerCycles(run);
  checkTriggerWarnings(run, references);
  checkUnused(run, references);
  checkTimersStart(run);
  checkWildlifePins(run);
  checkUiAckWaits(run);
  checkProvability(run);
};
