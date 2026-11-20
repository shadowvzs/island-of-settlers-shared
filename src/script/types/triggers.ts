import type { ScriptActionKind } from "../catalog/actions.ts";
import type { ScriptEventKind } from "../catalog/events.ts";
import type { EventPhrasingKind } from "../catalog/phrasings.ts";
import type { ScriptPredicateKind } from "../catalog/predicates.ts";
import type { AudioRef } from "../audio.ts";
import type { ActorLook, ActorSelector, ActorTypeRef } from "./actors.ts";
import type { CampaignRewardEntry, ScriptGoodsLine, ScriptSoldierLine } from "./rewards.ts";
import type { PlayerFilter, ScriptRef, StepId, TriggerId } from "./refs.ts";
import type { UiTarget } from "./ui.ts";
import type { Expr } from "./values.ts";

/** Event, condition, action and trigger shapes (trigger design §4.6–§4.9). */

/** A value bound to an event slot; the catalogue entry of the event kind types each slot (§5.1). */
export type EventSlotValue = Expr | ActorSelector | PlayerFilter | null;

export interface ScriptEvent {
  kind: ScriptEventKind;
  /**
   * Editor-only sentence order of a two-actor event (`EVENT_PHRASINGS`): "a hunter kills a deer" (primary) or "a
   * deer is killed by a hunter" (inverse). Same kind and slots either way; validation and the engine ignore it.
   */
  phrasing?: EventPhrasingKind;
  /**
   * Whose subject counts (the owner of the triggering actor or player); neutral subjects match "any"/"neutral".
   * The only owner filter of the subject slot (rev m13).
   */
  player: PlayerFilter;
  slots: Record<string, EventSlotValue>;
}

export type CompareOperator = "==" | "!=" | "<" | "<=" | ">" | ">=";

export type PredicateArg = Expr | ActorSelector | PlayerFilter | ActorTypeRef;

export type Condition =
  | { k: "all"; of: Condition[] }
  | { k: "any"; of: Condition[] }
  | { k: "not"; of: Condition }
  | { a: Expr; b: Expr; k: "compare"; op: CompareOperator }
  | { args: Record<string, PredicateArg>; k: "is"; pred: ScriptPredicateKind }
  | { k: "bool"; of: Expr };

export type ConditionKind = Condition["k"];

export interface StepBase {
  comment?: string;
  /** Disabled steps are kept but skipped (editor toggle). */
  disabled?: boolean;
  id: StepId;
}

/** Long actions only (catalogue column "wait"). */
export interface WaitSpec {
  /** "stop" ends the run when the outcome is not `done` (owner 7: continue by default). */
  onFail: "continue" | "stop";
  /** Game seconds; mandatory, 1..SCRIPT_LIMITS.maxWaitSeconds (the shape lets it be absent to report it). */
  timeoutSeconds: number;
}

export type ActionOutcome =
  | "done" | "actorGone" | "targetGone" | "unreachable" | "interrupted" | "timeout" | "refused" | "blocked" | "full";

/** Structured action arguments beside expressions, selectors and references. */
export type ActionArg =
  | Expr | ActorSelector | PlayerFilter | Condition | ScriptAction[] | ActorTypeRef | ActorLook | UiTarget
  | CampaignRewardEntry[] | ScriptGoodsLine[] | ScriptSoldierLine[] | AudioRef | null;

export type ScriptActionBody =
  | {
    args: Record<string, ActionArg>; k: "do"; op: ScriptActionKind;
    /** Owner 5: the player (and CPU AI) may override the scripted unit unless false. Default true. */
    overridable?: boolean;
    wait?: WaitSpec;
  }
  | { k: "wait"; seconds: Expr }
  | { cond: Condition; k: "waitUntil"; timeoutSeconds: number | null }
  | { cond: Condition; else: ScriptAction[]; k: "if"; then: ScriptAction[] }
  | { as: string; body: ScriptAction[]; k: "forEach"; max: number; over: ActorSelector | ScriptRef<"variable"> }
  | { as: string; body: ScriptAction[]; from: Expr; k: "forRange"; to: Expr }
  | { body: ScriptAction[]; k: "repeat"; times: Expr }
  /**
   * Direct start (design §6.5): ignores the called trigger's enabled state, run limit, fire limit and concurrency;
   * conditions are checked only with `checkConditions`; depth ≤ `cascadeDepth`.
   */
  | { checkConditions: boolean; k: "runTrigger"; trigger: ScriptRef<"trigger">; wait: boolean }
  /** Ends this run. */
  | { k: "stop" }
  | { k: "comment"; text: string };

export type ScriptAction = StepBase & ScriptActionBody;
export type ScriptActionStepKind = ScriptAction["k"];

export interface ScriptTrigger {
  actions: ScriptAction[];
  comment?: string;
  /** A new firing while a run is active: "queue" (default), "parallel" or "ignore" (owner round 5, item 16). */
  concurrency: "queue" | "parallel" | "ignore";
  conditions: Condition;
  /** Initially enabled; actions enable/disable at run time. */
  enabled: boolean;
  /** Any event fires the trigger; an empty list = only callable through runTrigger. */
  events: ScriptEvent[];
  /** Editor tree only (no runtime meaning); the design keeps it a plain folder id. */
  folderId: string | null;
  id: TriggerId;
  name: string;
  /** Fires at most this many times per map run (1 = one-shot); null = unlimited. */
  runLimit: number | null;
}
