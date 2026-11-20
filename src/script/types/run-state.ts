import type { ScriptDeferredEvent } from "./emission.ts";
import type { MultiboardState } from "./multiboards.ts";
import type { ActorId, RewardId, StepId, TriggerId, VariableId } from "./refs.ts";
import type { MapScript } from "./script.ts";
import type { ActorHandleValue, ScriptValue } from "./values.ts";

/**
 * Saved run state of a map script (trigger design §6.5, §6.13, §4.10). Types only: the engine (TRG2) and the sim
 * adapter (TRG3a) fill them. All tick values are script ticks unless named otherwise.
 */

export type QuestState = "inactive" | "active" | "succeeded" | "failed" | "claimed" | "retired";

export interface QuestInstanceState {
  /** Script tick at activation (for `playTime`). */
  activatedScriptTick: number | null;
  /** Game tick at activation (for `gameTime`). */
  activatedTick: number | null;
  /** `gameNow` UTC ms at activation (dates and grid offsets). */
  activatedUtc: number | null;
  /** Counter value at activation, for objectives counted `since: "activation"` (TRG6, QU §7.3). */
  baseline?: number;
  claimCount: number;
  failures: number;
  /** ≤ SCRIPT_LIMITS.claimHistory dates, newest last, `gameNow` UTC ms. */
  lastClaims: number[];
  /** Grid window index of the newest claim (§7.2). */
  lastWindow: number | null;
  /** The newest claim was a skip (no reward; QU §7.4). */
  skipped?: boolean;
  state: QuestState;
}

export type QuestRunState = Record<string, QuestInstanceState>;

export type ActorMemberState = "alive" | "inside" | "aboard" | "carried" | "dead" | "gone";

/** ACT2 binding of an authored actor, re-scoped into the script run state (rev, TRG3a fills it). */
export interface ActorBinding {
  /** 0 before the first appear; +1 on every appear of a fully gone actor. */
  incarnation: number;
  lastExit?: "died" | "disappeared" | "consumed" | "leftMap" | "felled" | "pickedUp";
  members: { container?: ActorHandleValue; handle: ActorHandleValue; scripted: boolean; state: ActorMemberState }[];
}

/** A script-owned whale, fish school, critter, bird or butterfly (PRES0); its events fire on these ticks. */
export interface PresentationActorRecord {
  actorId: number;
  clip: string | null;
  endTick: number | null;
  region: string;
  startTick: number;
  state: "scheduled" | "visible" | "despawned";
  /** Catalog content id. */
  type: string;
}

export type RunContextValue = ScriptValue | ActorHandleValue;

export type ScriptRunOwner =
  | { kind: "trigger"; triggerId: TriggerId }
  | { kind: "quest"; list: "onActivate" | "onSuccess" | "onFailure"; questId: string }
  | { kind: "sequence"; sequenceId: string };

export type ScriptRunWaiting =
  | null
  | { kind: "ticks"; untilScriptTick: number }
  | { deps: string[]; kind: "condition"; timeoutScriptTick: number | null }
  | { actionId: number; kind: "action"; stepId: StepId; timeoutScriptTick: number }
  | { effectId: string; kind: "uiAck"; timeoutScriptTick: number }
  | { kind: "run"; runId: number }
  | { kind: "sequence"; sequenceId: string };

export interface ScriptRun {
  /** Responses captured at fire time (immutable). */
  context: Record<string, RunContextValue>;
  /** Cascade depth of the event that fired the run (+1 per `runTrigger` call); bounded by `cascadeDepth`. */
  depth: number;
  id: number;
  /** Loop variables. */
  locals: Record<string, RunContextValue>;
  loops: { cursor: number; items?: ActorHandleValue[]; to?: number }[];
  owner: ScriptRunOwner;
  /** Path into the nested action lists. */
  pc: number[];
  waiting: ScriptRunWaiting;
}

/**
 * The sequence playing now (CIN4, cinematics plan §3.4). World steps are recorded commands applied in step order,
 * each once; `actors` names the units a spawn step created for later steps of the same sequence.
 */
export interface ActiveCinematic {
  /** Units each spawn step's `actorRef` names (sorted handles). */
  actors: Record<string, ActorHandleValue[]>;
  /** World step ids applied so far, in step order. */
  applied: string[];
  /** Walk steps whose actor arrived (or finished in guaranteed mode); the player re-anchors on them. */
  arrived: string[];
  /** "Pause the world" (owner Q3): no simulation tick until the sequence ends. */
  hold: boolean;
  /** A victory/defeat sequence: it preempts every story sequence. */
  outcome: boolean;
  sequenceId: string;
  /** Game tick the sequence started on. */
  startTick: number;
  /** Waited walk orders: action id → walk step id. */
  walks: { actionId: number; stepId: string }[];
}

/** Saved cinematic queue; absent until the first sequence is queued (older saves and hashes stay unchanged). */
export interface ScriptCinematicState {
  active: ActiveCinematic | null;
  /** FIFO; outcome sequences only once one is due. */
  pending: { outcome: boolean; sequenceId: string }[];
  /** Sequences that ended (watched or skipped), each once, in order. */
  seen: string[];
}

export interface ScriptRunState {
  actors: Record<ActorId, ActorBinding>;
  /** CIN4 sequence queue and the active sequence; absent while no sequence was ever queued. */
  cinematic?: ScriptCinematicState;
  /** Matched events pushed past the cascade depth, delivered on the next live tick (saved so reloads agree). */
  deferred: ScriptDeferredEvent[];
  disabledTriggers: TriggerId[];
  firedCounts: Record<TriggerId, number>;
  /** Fires in the current game second per trigger (rev M15). */
  firesThisSecond: Record<TriggerId, number>;
  /** Occurrences already granted per declared home reward (TRG6): count and the newest window index. */
  grantedHomeRewards?: Record<RewardId, { count: number; firstUtc: number; lastWindow: number | null }>;
  multiboards: Record<VariableId, MultiboardState>;
  nextRunId: number;
  /** Declared home rewards granted in-sim and not yet confirmed by the server ledger (rev M8). */
  pendingHomeClaims: { occurrence: string; rewardId: RewardId }[];
  presentationActors: PresentationActorRecord[];
  /** Firings waiting for a running run of the same trigger (concurrency "queue", parallel overflow). */
  queued: { context: ScriptRun["context"]; triggerId: TriggerId }[];
  quests: QuestRunState;
  rng: number;
  runs: ScriptRun[];
  /** Script clock: +1 per live tick only; catch-up and CIN hold never advance it (rev B2). */
  scriptTick: number;
  /** The script this run executes: copied at map start, kept until restart (rev M11). */
  snapshot: { revision: number; script: MapScript; scriptHash: string };
  timers: Record<VariableId, { endScriptTick: number | null; paused: number | null }>;
  values: Record<VariableId, ScriptValue>;
  version: 1;
}
