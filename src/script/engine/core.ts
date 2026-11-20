import type { CinematicSequence } from "../../campaign/cinematics/types.ts";
import type { ScriptEmission } from "../types/emission.ts";
import type { MultiboardCellContext } from "../types/multiboards.ts";
import type { ScriptQuest } from "../types/quests.ts";
import type { RunContextValue, ScriptRun, ScriptRunState } from "../types/run-state.ts";
import type { MapScript, ScriptVariable } from "../types/script.ts";
import type { ActionArg, ScriptTrigger } from "../types/triggers.ts";
import type { ScriptValue } from "../types/values.ts";
import type { ScriptLogCode, ScriptWorldPort } from "./ports.ts";
import type { ScriptTraceSink } from "./trace.ts";
import type { ScriptUiEffect } from "./ui-effects.ts";

/**
 * What the engine's helper modules (expressions, conditions, variables, steps, quests) need from the engine. The
 * `ScriptEngine` class implements it; the split keeps every module small and free of circular imports.
 */

/** Id lookups built once per loaded script (derived, never saved). */
export interface ScriptLookup {
  questById: ReadonlyMap<string, ScriptQuest>;
  sequenceById: ReadonlyMap<string, CinematicSequence>;
  triggerById: ReadonlyMap<string, ScriptTrigger>;
  /** Trigger list position (firing order). */
  triggerOrder: ReadonlyMap<string, number>;
  variableById: ReadonlyMap<string, ScriptVariable>;
}

/** The evaluation frame of a run (or a run-less frame for slot filters and quest checks). */
export interface EvalFrame {
  /** Row context of a multiboard cell (`{ k: "cell" }` expressions); absent everywhere else. */
  cell?: MultiboardCellContext;
  context: Record<string, RunContextValue>;
  id: number | null;
  locals: Record<string, RunContextValue>;
}

export interface ScriptEngineCore {
  /** Multiboard actions (show, hide, collapse, expand, set title) on the saved board state. */
  applyMultiboardAction: (frame: EvalFrame, op: string, args: Record<string, ActionArg>) => void;
  /** Quest actions (activate, complete, fail, reset) of the quest state machine. */
  applyQuestAction: (op: string, questId: string) => void;
  /** `runTrigger`: starts a run of the trigger as a child of `parent`; null when refused (depth, conditions). */
  callTrigger: (parent: ScriptRun, triggerId: string, checkConditions: boolean) => number | null;
  emit: (emission: ScriptEmission) => void;
  /** `grantHomeReward`: queues a declared home reward claim with the engine-chosen occurrence (§4.14). */
  grantHomeReward: (rewardId: string) => void;
  isTriggerEnabled: (triggerId: string) => boolean;
  log: (code: ScriptLogCode, detail: string) => void;
  readonly lookup: ScriptLookup;
  /** Marks a `waitUntil` dependency key changed (variables, quests); waiting runs re-check it this tick. */
  markDependency: (key: string) => void;
  /** `live` or `catchUp`: catch-up drops presentation effects. */
  readonly mode: "live" | "catchUp";
  /** Next unit draw of the saved random stream. */
  nextRandomUnit: () => number;
  readonly port: ScriptWorldPort;
  readonly script: MapScript;
  setTriggerEnabled: (triggerId: string, enabled: boolean) => void;
  readonly state: ScriptRunState;
  /** Test play debug log sink (presentation only: never saved, hashed or read back); absent in normal play. */
  trace?: ScriptTraceSink;
  /** Presentation effects of the current ticks (not saved, not hashed; drained by the client, TRG9). */
  readonly uiOutbox: ScriptUiEffect[];
  /** Stores a variable value and notifies waits, the instance index and `variableChanged` subscribers. */
  writeVariable: (id: string, value: ScriptValue) => void;
}

export const EMPTY_FRAME: EvalFrame = Object.freeze({
  context: Object.freeze({}), id: null, locals: Object.freeze({})
});

export const buildScriptLookup = (script: MapScript): ScriptLookup => ({
  questById: new Map(script.quests.quests.map(quest => [quest.id, quest])),
  sequenceById: new Map(script.sequences.map(sequence => [sequence.id, sequence])),
  triggerById: new Map(script.triggers.map(trigger => [trigger.id, trigger])),
  triggerOrder: new Map(script.triggers.map((trigger, index) => [trigger.id, index])),
  variableById: new Map(script.variables.map(variable => [variable.id, variable]))
});
