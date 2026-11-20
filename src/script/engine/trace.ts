import type { QuestState, ScriptRunOwner } from "../types/run-state.ts";
import type { ScriptActionStepKind } from "../types/triggers.ts";
import type { ScriptValue } from "../types/values.ts";

/**
 * Play-test trace of the engine (test play debug log). Presentation only: the engine calls the sink when one is
 * attached and never reads anything back, so the run state, its hash and saves are the same with and without it.
 * No sink is attached in normal play, on the server or in the verifier.
 */
export type ScriptTraceEntry =
  /** A run started: a trigger fired by `event`, a `runTrigger` call, a queued firing or a quest action list. */
  | { event?: string; kind: "run"; owner: ScriptRunOwner; runId: number }
  /** A step of a run, traced before it executes (its effects follow it); `op` names a `do` step's action. */
  | { kind: "step"; op?: string; runId: number; stepId: string; stepKind: ScriptActionStepKind }
  | { from: QuestState | null; kind: "quest"; questId: string; to: QuestState }
  | { kind: "variable"; value: ScriptValue; variableId: string };

export type ScriptTraceSink = (entry: ScriptTraceEntry) => void;
