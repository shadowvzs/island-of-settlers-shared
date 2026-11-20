import type { QuestRunState, ScriptRun, ScriptRunState } from "../types/run-state.ts";
import type { MapScript, ScriptVariable } from "../types/script.ts";
import { canonicalJson } from "./hash.ts";
import { initialQuests, initialQuestState } from "./quest-state.ts";
import { initialTimers } from "./timers.ts";
import { copyValue } from "./values.ts";

/**
 * Creating and migrating `ScriptRunState` (design §6.13). A run state carries a copy of the script it executes
 * (snapshot at map start, rev M11); a home island moves to a pushed revision only through `migrateScriptRunState`.
 */

export interface ScriptRunStateOptions {
  /** Canonical hash of the script (TRG1 codec; tests may pass any stable string). */
  scriptHash: string;
  /** Seed of the script's random stream: `deriveSeed(world.seed, "script")` in the sim adapter. */
  seed: number;
}

const initialValues = (variables: readonly ScriptVariable[]) =>
  Object.fromEntries(variables.map(variable => [variable.id, copyValue(variable.initial)]));

const initialMultiboards = (script: MapScript): ScriptRunState["multiboards"] => {
  const boards: ScriptRunState["multiboards"] = {};
  for (const variable of script.variables) {
    if (variable.initial.type !== "multiboard") continue;
    const board = variable.initial.value;
    boards[variable.id] = { collapsed: board.initiallyCollapsed, visible: board.initiallyVisible };
  }
  return boards;
};

const initiallyDisabled = (script: MapScript) =>
  script.triggers.filter(trigger => !trigger.enabled).map(trigger => trigger.id);

/** A fresh run state at script tick 0 (map start or restart). */
export const createScriptRunState = (script: MapScript, options: ScriptRunStateOptions): ScriptRunState => {
  const snapshot = structuredClone(script);
  return {
    actors: {}, deferred: [], disabledTriggers: initiallyDisabled(snapshot), firedCounts: {}, firesThisSecond: {},
    multiboards: initialMultiboards(snapshot), nextRunId: 1, pendingHomeClaims: [], presentationActors: [],
    queued: [], quests: initialQuests(snapshot), rng: options.seed >>> 0, runs: [], scriptTick: 0,
    snapshot: { revision: snapshot.revision, script: snapshot, scriptHash: options.scriptHash },
    timers: initialTimers(snapshot, 0), values: initialValues(snapshot.variables), version: 1
  };
};

const changedIds = <T extends { id: string }>(before: readonly T[], after: readonly T[]) => {
  const old = new Map(before.map(item => [item.id, canonicalJson(item)]));
  return new Set(after.filter(item => old.get(item.id) !== canonicalJson(item)).map(item => item.id)
    .concat(before.filter(item => !after.some(next => next.id === item.id)).map(item => item.id)));
};

const isCancelled = (run: ScriptRun, triggers: ReadonlySet<string>, quests: ReadonlySet<string>) =>
  (run.owner.kind === "trigger" && triggers.has(run.owner.triggerId))
  || (run.owner.kind === "quest" && quests.has(run.owner.questId));

const migrateValues = (state: ScriptRunState, before: MapScript, after: MapScript) => {
  const oldTypes = new Map(before.variables.map(variable => [variable.id, variable.type]));
  return Object.fromEntries(after.variables.map(variable => {
    const kept = oldTypes.get(variable.id) === variable.type ? state.values[variable.id] : undefined;
    return [variable.id, kept ?? copyValue(variable.initial)];
  }));
};

const migrateQuests = (state: ScriptRunState, after: MapScript): QuestRunState => {
  const quests: QuestRunState = {};
  for (const quest of after.quests.quests) quests[quest.id] = state.quests[quest.id] ?? initialQuestState();
  for (const [id, quest] of Object.entries(state.quests)) quests[id] ??= { ...quest, state: "retired" };
  return quests;
};

const keepKnown = <T>(record: Record<string, T>, known: ReadonlySet<string>) =>
  Object.fromEntries(Object.entries(record).filter(([id]) => known.has(id)));

const isDisabledAfterMigration = (state: ScriptRunState, trigger: MapScript["triggers"][number],
  changed: ReadonlySet<string>) => {
  if (changed.has(trigger.id)) return !trigger.enabled;
  return state.disabledTriggers.includes(trigger.id);
};

const migrateDisabled = (state: ScriptRunState, after: MapScript, changed: ReadonlySet<string>) =>
  after.triggers.filter(trigger => isDisabledAfterMigration(state, trigger, changed)).map(trigger => trigger.id);

/** Saved entries of a record whose keys still exist, over fresh defaults for the new ones. */
const mergeKnown = <T>(defaults: Record<string, T>, saved: Record<string, T>) =>
  ({ ...defaults, ...keepKnown(saved, new Set(Object.keys(defaults))) });

/**
 * Moves a saved run state onto a pushed revision (design §6.13): variables kept by id when the type is unchanged,
 * runs and queued firings of changed or removed triggers and quests cancelled, quest states kept by id (removed
 * quests retired, new ones inactive), timers of removed variables dropped. The caller emits `scriptUpdated`.
 */
export const migrateScriptRunState = (state: ScriptRunState, script: MapScript, scriptHash: string) => {
  const before = state.snapshot.script;
  const after = structuredClone(script);
  const triggers = changedIds(before.triggers, after.triggers);
  const quests = changedIds(before.quests.quests, after.quests.quests);
  const cancelled = state.runs.filter(run => isCancelled(run, triggers, quests)).map(run => run.id);
  const runs = state.runs.filter(run => !cancelled.includes(run.id)).map(run =>
    run.waiting?.kind === "run" && cancelled.includes(run.waiting.runId) ? { ...run, waiting: null } : run);
  const triggerIds = new Set(after.triggers.map(trigger => trigger.id));
  const migrated: ScriptRunState = {
    ...state,
    disabledTriggers: migrateDisabled(state, after, triggers),
    firedCounts: keepKnown(state.firedCounts, triggerIds),
    firesThisSecond: keepKnown(state.firesThisSecond, triggerIds),
    deferred: state.deferred.filter(entry => entry.triggerIds.every(id => !triggers.has(id))),
    multiboards: mergeKnown(initialMultiboards(after), state.multiboards),
    queued: state.queued.filter(entry => !triggers.has(entry.triggerId)),
    quests: migrateQuests(state, after),
    runs,
    snapshot: { revision: after.revision, script: after, scriptHash },
    timers: mergeKnown(initialTimers(after, state.scriptTick), state.timers),
    values: migrateValues(state, before, after)
  };
  return { cancelledRuns: cancelled, state: migrated };
};
