import type { COLONY_END_REASONS } from "../constants.ts";
import type { QuestText } from "../types/quest-text.ts";

/** The authored scenario rules a generated book carries (`MapScenario` fields, trigger design §8.1). */
export interface ScenarioBookRules {
  /** Game seconds the objective must hold before the map is won. */
  claimSeconds: number;
  /** Game seconds after which the map expires (counts offline too); 0 = never. */
  expirySeconds: number;
  /** `capture`: every authored enemy site is captured; `defeat`: no enemy soldier is left. */
  objective: "capture" | "defeat";
  /** Coins of the map reward (kept pending while the island has no home building). */
  rewardCoins: number;
}

export type ColonyEndReason = (typeof COLONY_END_REASONS)[number];

/** A local notice of the archipelago executor (never a mail, owner round 6). */
export interface ArchipelagoNotice {
  important: boolean;
  text: QuestText;
}

/** What the client archipelago offers the executor: its two operations (§8.2 item 3). */
export interface ArchipelagoExecutorPort {
  /** Ends the colony; false when it is already gone (the server dropped it silently), so the step is skipped. */
  colonyEnd: (reason: ColonyEndReason) => boolean;
  notify: (notice: ArchipelagoNotice) => void;
}

export interface ArchipelagoRunResult {
  /** The reason of the `colonyEnd` step that ended the colony here; null when none ran or it was skipped. */
  ended: ColonyEndReason | null;
  notices: number;
  /** Step ids the executor does not run (anything but an enabled `colonyEnd`/`notify` action). */
  unsupported: string[];
}
