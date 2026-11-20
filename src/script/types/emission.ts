import type { ScriptEventKind } from "../catalog/events.ts";
import type { ActorHandleValue, ScriptValue } from "./values.ts";

/**
 * Emitted events as the engine receives them (trigger design §6.2): plain JSON, so cascade-deferred events can be
 * saved with the run state. Emission sites (TRG3) build them only when `isSubscribed(kind)` is true.
 */

/** Qualifiers of an emitted actor, checked against an `ActorTypeRef` after the type lookup. */
export interface ScriptActorQualifiers {
  level?: number;
  nation?: string;
  rank?: number;
  /** Variant axis → value, e.g. `{ form: "pine" }`. */
  variants?: Record<string, string>;
}

/** An actor as an emission site describes it: handle, catalog type and family path, owner faction. */
export interface ScriptEventActor {
  /** Catalog family path, e.g. `animal.deer` (matched by prefix). */
  family: string;
  handle: ActorHandleValue;
  /** Owning faction; null = ownerless (wildlife, props, neutral actors). */
  owner: number | null;
  qualifiers?: ScriptActorQualifiers;
  /** Catalog content id, e.g. `animal:deer`. */
  type: string;
}

/** One emitted event, delivered at the end of the tick in emission order. */
export interface ScriptEmission {
  /** Actor slots by catalogue slot name (the subject and e.g. a killer). */
  actors?: Record<string, ScriptEventActor>;
  /**
   * Where a place event happened (cell centre, e.g. the mined ore cell): its `region` slot filter matches when the
   * place lies in the region (through the world port), so overlapping regions need no per-region emission.
   */
  at?: { x: number; z: number };
  kind: ScriptEventKind;
  /** The player the event `player` filter tests when the event has no subject actor; null = neutral. */
  player?: number | null;
  /** Responses copied into a fired run's context (immutable after the fire). */
  responses?: Record<string, ScriptValue | ActorHandleValue>;
  /** Plain slot values the trigger slot filters compare against (region id, quest id, ware id, amount …). */
  values?: Record<string, boolean | number | string>;
}

/** A matched event pushed past the cascade depth: delivered at depth 0 on the next live tick (design §6.3). */
export interface ScriptDeferredEvent {
  emission: ScriptEmission;
  triggerIds: string[];
}
