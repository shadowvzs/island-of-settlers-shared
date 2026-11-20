import type { CampaignWareAmount } from "../../campaign/campaign-model.ts";
import type { ScriptActionKind } from "../catalog/actions.ts";
import type { ScriptPredicateKind } from "../catalog/predicates.ts";
import type { ActorSelector } from "../types/actors.ts";
import type { ActionArg, ActionOutcome, PredicateArg } from "../types/triggers.ts";
import type { ActorHandleValue, Expr, FunctionArg, ScriptFunctionKind } from "../types/values.ts";
import type { CampaignMapStatus } from "./home-rewards.ts";
import type { QuestFacts } from "./quests.ts";

/**
 * Ports of the script engine (trigger design §6.1). The engine is pure: the world reaches it only through
 * `ScriptWorldPort` (read-only queries plus action requests) and emissions. TRG3 implements the port over the
 * settlement context and wires emission sites; TRG5 implements the actions. Nothing here touches the simulation.
 */

/**
 * A raw evaluated value: scalars, arrays, an actor handle or handle list, a tagged reference, a quest text, a
 * definition object (multiboard/timer) or null (unknown / not available).
 */
export type ScriptEvalValue = boolean | number | string | null | object;

/** Evaluation scope handed to the port: evaluates expressions and resolves selectors inside the current run. */
export interface ScriptEvalScope {
  evaluate: (expr: Expr) => ScriptEvalValue;
  /** Live members of a selector, sorted by handle (space, id, generation). */
  resolveActors: (selector: ActorSelector) => ActorHandleValue[];
  /** The current run id, or null outside a run (event slot filters, quest checks). */
  runId: number | null;
}

export interface ScriptActionRequest {
  args: Record<string, ActionArg>;
  /**
   * Script tick at which the engine times a waited step out (null when the step does not wait): guaranteed mode
   * (§6.6) finishes a stuck action just before it.
   */
  deadlineScriptTick: number | null;
  op: ScriptActionKind;
  /** Owner 5: the player (and CPU AI) may override the scripted unit unless false. */
  overridable: boolean;
  runId: number;
  scope: ScriptEvalScope;
  stepId: string;
  /** The step waits for completion (`wait` spec present): the port returns `pending` with an action id. */
  wait: boolean;
}

/** Units a spawn created (`lastSpawned`, the `store` variable); absent for other actions. */
interface SpawnedHandles {
  spawned?: readonly ActorHandleValue[];
}

export type ScriptActionResult =
  | ({ kind: "done" } & SpawnedHandles)
  | { kind: "failed"; outcome: ActionOutcome }
  /** A long action started; the world calls `ScriptEngine.completeAction(actionId, outcome)` when it ends. */
  | ({ actionId: number; kind: "pending" } & SpawnedHandles);

/** The world as the engine sees it. TRG3/TRG5 implement it over the settlement; tests use fakes. */
export interface ScriptWorldPort {
  /**
   * The live object stands in the region's cells (TRG4; region filters on event selectors). Absent: such
   * filters pass, as before the region watch existed.
   */
  actorInRegion?: (handle: ActorHandleValue, regionId: string) => boolean;
  /** Campaign maps: the account's status of this map (replays pay one third, §9.5); absent elsewhere. */
  campaignMapStatus?: () => CampaignMapStatus;
  /**
   * The active cinematic sequence ended (CIN4) inside the recorded `endCinematic`: a held sequence settles what its
   * pause froze (the world environment's hour change). Absent: nothing to settle.
   */
  cinematicEnded?: (ended: { hold: boolean }) => void;
  callFunction: (fn: ScriptFunctionKind, args: Record<string, FunctionArg>, scope: ScriptEvalScope) =>
    ScriptEvalValue;
  /** Game tick (advances live and in catch-up). */
  gameTick: () => number;
  /** Deterministic server-anchored UTC ms (`sim/game-clock.ts`); never the wall clock. */
  gameNow: () => number;
  /** The handle's slot still holds the same object (generation equal, object present). */
  isHandleLive: (handle: ActorHandleValue) => boolean;
  /**
   * Takes a quest's claim cost from the island stock inside the recorded claim command (TRG6, owner 41); false
   * when short. Absent: only quests without a cost can be claimed.
   */
  payQuestCost?: (cost: readonly CampaignWareAmount[]) => boolean;
  performAction: (request: ScriptActionRequest) => ScriptActionResult;
  /** The map's victory or defeat is decided (campaign maps): a sequence queued now is an outcome sequence. */
  mapOutcomeDecided?: () => boolean;
  /** Factions in play, ascending (multiboard `players` rows); without it only the human slots are listed. */
  playerFactions?: () => readonly number[];
  playerIsHuman: (faction: number) => boolean;
  playersAllied: (a: number, b: number) => boolean;
  /** Live members of a type, family or query selector, sorted by handle, at most `limit`. */
  /** What built-in quest objectives read (TRG6); absent: only `scripted`/`condition` objectives progress. */
  questFacts?: QuestFacts;
  queryActors: (selector: ActorSelector, limit: number, scope: ScriptEvalScope) => ActorHandleValue[];
  /** The map point lies in the region's cells (a place event's `region` slot, TRG3b); absent: no place matches. */
  spotInRegion?: (x: number, z: number, regionId: string) => boolean;
  testPredicate: (pred: ScriptPredicateKind, args: Record<string, PredicateArg>, scope: ScriptEvalScope) =>
    boolean;
}

export type ScriptLogCode =
  | "actionFailed" | "arrayIndex" | "budgetExhausted" | "cascadeDeferred" | "chainDepth" | "divisionByZero"
  | "fireLimit" | "notANumber" | "parallelOverflow" | "queueOverflow" | "runCancelled" | "stepPastEnd"
  | "unknownReference";

/** Debug log line (not saved, not hashed; the debugging tools read it, §11.2). */
export interface ScriptLogEntry {
  code: ScriptLogCode;
  detail: string;
  scriptTick: number;
}

/** A world with nothing in it: functions return null, predicates false, actions finish at once. */
export const createNullWorldPort = (clock: { now?: number; tick?: number } = {}): ScriptWorldPort => ({
  callFunction: () => null,
  gameNow: () => clock.now ?? 0,
  gameTick: () => clock.tick ?? 0,
  isHandleLive: () => true,
  performAction: () => ({ kind: "done" }),
  playerIsHuman: faction => faction === 0,
  playersAllied: (a, b) => a === b,
  queryActors: () => [],
  testPredicate: () => false
});
