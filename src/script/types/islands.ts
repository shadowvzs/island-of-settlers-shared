import type { QuestText } from "./quest-text.ts";
import type { MapKind } from "./refs.ts";
import type { QuestState, ScriptRunState } from "./run-state.ts";

/**
 * Island switching (owner 2026-11-11, trigger design §6.14): script and quest state is per map/island. Leaving an
 * island saves its run state with the island save; entering loads the target map's script and its saved state.
 * Only the claim ledger, the generated daily pool and these digests are player-wide.
 */

/** Island-bound: lives in one map's book and run state. Player-wide: the generated daily pool and the ledger. */
export type QuestScope = "island" | "player";

/** The script state stored with one island's save (or its server row) while the player is elsewhere. */
export interface IslandScriptState {
  islandKey: string;
  /** `gameNow` UTC ms and game tick when the player left; date-bound deadlines keep counting from here. */
  leftAtTick: number;
  leftAtUtc: number;
  mapKind: MapKind;
  /** The run state with its script snapshot; its script clock stays frozen while the island is off screen. */
  runState: ScriptRunState;
  version: 1;
}

/** One quest of another island as the quest window lists it (read-only; claimable only on its island). */
export interface IslandQuestDigestEntry {
  /** The quest succeeded and waits for its claim on that island (its repeat window is open). */
  claimable: boolean;
  /** Date-bound deadline (`gameNow` UTC ms), shown as local time; null when none or frozen (play time). */
  deadlineUtc: number | null;
  questId: string;
  state: QuestState;
  title: QuestText;
}

/** Summary of one island's visible quests, written on leave (and by server catch-up), read by the quest window. */
export interface IslandQuestDigest {
  bookId: string;
  islandKey: string;
  mapKind: MapKind;
  quests: IslandQuestDigestEntry[];
  updatedAtUtc: number;
}

/** Player-wide script data (progress save): digests of other islands and announced colony expiries. */
export interface PlayerScriptState {
  /** Expedition ids whose expiry notice was shown (§8.2: once per colony). */
  announcedColonyExpiries: string[];
  digests: Record<string, IslandQuestDigest>;
  version: 1;
}

/**
 * Lifecycle of the island on screen (implemented by the client session in TRG2/TRG6; types only here):
 * `leave` stops the engine at a tick boundary, saves the run state and the digest, then drops every in-memory index;
 * `enter` loads the map script, migrates or creates the run state (§6.13), runs catch-up for the time away (script
 * clock frozen, date-bound deadlines checked once at the end, §7.4) and starts on the first live tick.
 */
export interface ScriptIslandLifecycle {
  enter: (islandKey: string, saved: IslandScriptState | null) => void;
  leave: () => { digest: IslandQuestDigest; state: IslandScriptState };
}
