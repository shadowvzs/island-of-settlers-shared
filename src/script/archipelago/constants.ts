import type { ScenarioBookRules } from "./types.ts";

/** Generated colony/adventure books and the client archipelago executor (trigger design §8, lane TRG10). */

/** Book and script ids of the shipped defaults; an expedition's instance is `colony-<expeditionId>` (§8.2). */
export const COLONY_DEFAULT_BOOK_ID = "colony-default";
export const ADVENTURE_DEFAULT_BOOK_ID = "adventure-default";
export const COLONY_BOOK_ID_PREFIX = "colony-";
export const ADVENTURE_BOOK_ID_PREFIX = "adventure-";

/** Ids of the generated triggers (stable: they are part of the generated script). */
export const COLONY_TRIGGER_IDS = Object.freeze({
  conquered: "trigger-colony-conquered",
  defeated: "trigger-colony-defeated",
  harbourLost: "trigger-colony-harbour-lost"
});

/** The catalog id of the harbour, the colony's home building (`colony.harbourLost`). */
export const HARBOUR_CONTENT_ID = "building:harbour";

/** Faction of the human player and of the first computer player ("player 2"). */
export const HUMAN_PLAYER_FACTION = 0;

/**
 * A generated island without authored scenario rules: every enemy defeated, no hold time, no map expiry and no
 * coin reward (colony conquest and adventure loot are paid by their own routes).
 */
export const DEFAULT_SCENARIO_RULES: ScenarioBookRules = Object.freeze({
  claimSeconds: 0, expirySeconds: 0, objective: "defeat", rewardCoins: 0
});

/** Lingui ids of the generated texts (declared as messages in the client; English is the inline source). */
export const ARCHIPELAGO_TEXT_KEYS = Object.freeze({
  adventureWinText: "quest.adventure.win.text",
  adventureWinTitle: "quest.adventure.win.title",
  colonyCancelled: "notice.colony.cancelled",
  colonyConquerCaptureText: "quest.colony.conquer.captureText",
  colonyConquerDefeatText: "quest.colony.conquer.defeatText",
  colonyConquerTitle: "quest.colony.conquer.title",
  colonyDefeated: "notice.colony.defeated",
  colonyExpired: "notice.colony.expired",
  colonyHarbourLost: "notice.colony.harbourLost",
  colonyHoldText: "quest.colony.hold.text",
  colonyHoldTitle: "quest.colony.hold.title"
});

/** English sources of the generated texts; `{island}` is the island name, `{days}` the colony lifetime. */
export const ARCHIPELAGO_TEXTS_EN = Object.freeze({
  adventureWinText: "Defeat every enemy on the island before your landing party is lost.",
  adventureWinTitle: "Win the adventure",
  colonyCancelled: "{island} was disbanded. Its garrison sailed home.",
  colonyConquerCaptureText: "Capture every enemy camp on the island.",
  colonyConquerDefeatText: "Defeat every enemy on the island.",
  colonyConquerTitle: "Conquer the island",
  colonyDefeated: "{island} is lost: no troops are left to hold it.",
  colonyExpired: "{island} has expired. Its remaining settlers, troops and goods returned home.",
  colonyHarbourLost: "{island} is lost: its harbour was destroyed.",
  colonyHoldText: "The colony stays yours for {days} days after the conquest; then everyone sails home.",
  colonyHoldTitle: "Hold the colony"
} satisfies Record<keyof typeof ARCHIPELAGO_TEXT_KEYS, string>);
