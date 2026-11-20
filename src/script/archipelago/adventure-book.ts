import { ADVENTURE_WIN_QUEST_ID } from "../constants.ts";
import { freezeMapScript } from "../hash.ts";
import type { MapScript, QuestBook, ScriptQuest } from "../types/index.ts";
import {
  baseQuest, bookText, coinReward, endMapStep, HUMAN_PLAYER, scenarioDeadline, scenarioObjective, scenarioScript
} from "./book-parts.ts";
import { ADVENTURE_BOOK_ID_PREFIX, ADVENTURE_DEFAULT_BOOK_ID, DEFAULT_SCENARIO_RULES } from "./constants.ts";
import type { ScenarioBookRules } from "./types.ts";

/**
 * The generated adventure book (trigger design §8.1): one visible quest with the authored scenario rules. The
 * loot keeps its own unchanged route (`/v1/economy/rewards/adventures`, ledger `adventure-reward`), so the book
 * carries only the map's coin reward.
 */

const winQuest = (rules: ScenarioBookRules): ScriptQuest => baseQuest(ADVENTURE_WIN_QUEST_ID, {
  deadline: scenarioDeadline(rules),
  failure: { args: { player: HUMAN_PLAYER }, k: "is", pred: "playerDefeated" },
  mapReward: coinReward(rules.rewardCoins),
  objective: scenarioObjective(rules),
  onFailure: [endMapStep("s1", "defeat")],
  onSuccess: [endMapStep("s1", "victory")],
  text: bookText("adventureWinText"),
  title: bookText("adventureWinTitle"),
  visibility: "visible"
});

export const adventureBookId = (expeditionId: number) => `${ADVENTURE_BOOK_ID_PREFIX}${expeditionId}`;

export const generateAdventureScript = (
  rules: ScenarioBookRules = DEFAULT_SCENARIO_RULES, bookId: string = ADVENTURE_DEFAULT_BOOK_ID
): MapScript => scenarioScript(bookId, [winQuest(rules)], []);

let defaultAdventureScript: MapScript | undefined;

export const defaultAdventureBookScript = (): MapScript =>
  defaultAdventureScript ??= freezeMapScript(generateAdventureScript());

export const defaultAdventureBook = (): QuestBook => defaultAdventureBookScript().quests;
