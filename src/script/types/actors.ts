import type { TranslatableText } from "../../campaign/campaign-text.ts";
import type { ActorId, PlayerFilter, ScriptRef } from "./refs.ts";
import type { ActorResponseKey } from "./values.ts";

/**
 * A content catalog type with optional qualifiers (design §4.3, rev B3); omitted qualifiers match every value. Each
 * qualifier must be a declared `variants` axis of the entry (`qualifierIssues`, CAT0).
 */
export interface ActorTypeRef {
  /** Buildings. */
  level?: { max?: number; min?: number };
  /** Catalog nation key; a look filter; absent = any. */
  nation?: string;
  /** Soldiers 0..2. */
  rank?: { max?: number; min?: number };
  /** Content id, e.g. "soldier:shield", "settler:hunter", "shell:seaStar", "animal:deer". */
  type: ScriptRef<"content">;
  /** Shell colour, tree form, decoration finish. */
  variant?: { axis: "finish" | "form"; value: string };
}

/**
 * Owner filters (rev m13): inside an event's subject slot the owner is the event's `player` filter and the selector
 * carries no `owner`; everywhere else a type or family selector needs one.
 */
export type ActorSelector =
  /** An authored actor. */
  | { actor: ScriptRef<"actor">; kind: "instance"; member?: "all" | "any" }
  /** An actor variable (rev M3). */
  | { kind: "variable"; member?: "all" | "any"; variable: ScriptRef<"variable"> }
  | { kind: "type"; owner?: PlayerFilter; region?: ScriptRef<"region">; type: ActorTypeRef }
  | { family: ScriptRef<"family">; kind: "family"; owner?: PlayerFilter; region?: ScriptRef<"region"> }
  | { key: ActorResponseKey; kind: "response" }
  /** A `forEach` loop variable. */
  | { kind: "local"; name: string }
  /** Turns a type/family/variable into concrete instances (owner 2026-11-11). */
  | { kind: "query"; query: ActorQuery };

/** Run-time states an actor query may require (any of the listed). */
export type ActorStateFilter = "idle" | "moving" | "docked" | "sailing" | "inside" | "aboard" | "working";

/**
 * Which instances a query picks. Ordering is deterministic: members are sorted by handle (space, id, generation);
 * `nearest` breaks distance ties by that order; `random` draws from the script's saved random stream.
 */
export type ActorQueryPick =
  | { kind: "all" }
  | { kind: "first" }
  | { kind: "nearest"; to: ActorSelector | ScriptRef<"region"> }
  | { kind: "random" };

/**
 * An actor query: "all ships of player 2", "the nearest soldier to the gate", "a random deer in the forest".
 * `from` is a type, family or actor variable selector (its owner and region filter the pool); `first`, `nearest`
 * and `random` yield one actor, `all` an actor group of at most `limit` members.
 */
export interface ActorQuery {
  /** Dead or removed members are skipped unless true (counts of the fallen). */
  includeGone?: boolean;
  from: ActorSelector;
  /** At most this many members (≤ SCRIPT_LIMITS.forEachMax); default the cap. */
  limit?: number;
  pick: ActorQueryPick;
  state?: ActorStateFilter[];
}

export type ActorSelectorKind = ActorSelector["kind"];

/** Who owns a spawned or placed actor: a scenario player slot or nobody (scenery, wildlife). */
export type ActorOwner = { faction: number; kind: "slot" } | { kind: "neutral" };

/** The look of a spawned unit, building or ship (owner 19: automatic or an explicit nation). */
export type ActorLook =
  | { kind: "ownerNation" }
  | { kind: "nation"; nation: string }
  | { kind: "pirates" }
  | { kind: "bandits" };

/** Where a spawn happens: a region (spread over free cells); `facing` overrides a point region's facing. */
export interface ActorSpawnPlace {
  facing?: number;
  region: ScriptRef<"region">;
}

/** Spawned buildings: complete at once or build themselves over `seconds` (owner 9). */
export type ActorBuildMode = { kind: "instant" } | { kind: "construct"; seconds: number };

/** What one placed object was when it was bound; checked after a map replace (rev M5). */
export interface PlacedObjectFingerprint {
  cell: number;
  content: ScriptRef<"content">;
  objectId: number;
}

export interface PlacedActorSpec {
  /** The map-file objects are not created at start; the first `appear` creates them from their definition. */
  hiddenAtStart: boolean;
  /** 1..SCRIPT_LIMITS.actorMembers objects of the same content and owner. */
  objects: PlacedObjectFingerprint[];
  owner: ActorOwner;
}

export interface SpawnActorSpec {
  buildMode?: ActorBuildMode;
  /** 1..SCRIPT_LIMITS.actorMembers (buildings and ships: 1). */
  count: number;
  look: ActorLook;
  owner: ActorOwner;
  place: ActorSpawnPlace;
  /** What a second `appear` does while members are alive: refuse (default) or add members. */
  respawn: "refuse" | "add";
  /** Created at map start, as if an `appear` ran at tick 0. */
  spawnAtStart: boolean;
  type: ActorTypeRef;
}

interface ScriptActorBase {
  /** Editor overlay tint. */
  color?: string;
  /**
   * The name players read (speaker panel name plate, portrait initials), per language with English required, each
   * at most `SCRIPT_LIMITS.actorDisplayNameLength` characters. Absent: a pirate or bandit look shows its default
   * name (`actorDisplayName`), any other actor has no name of its own.
   */
  displayName?: TranslatableText;
  id: ActorId;
  /** Members are removed from the binding when gone; "clearOnGone" also unbinds the actor (owner 28). */
  lifetime: "keepIncarnation" | "clearOnGone";
  /** Editor label, never shown to players. */
  name: string;
  speakerId?: ScriptRef<"speaker">;
}

/** The authored binding of an actor (ACT0 generalised, rev M3); run-time handles live in actor variables. */
export type ScriptActor =
  | (ScriptActorBase & { binding: "placed" } & PlacedActorSpec)
  | (ScriptActorBase & { binding: "spawn" } & SpawnActorSpec);
