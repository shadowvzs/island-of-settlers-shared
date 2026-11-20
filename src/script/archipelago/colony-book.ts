import {
  COLONY_CANCELLED_QUEST_ID, COLONY_CONQUER_QUEST_ID, COLONY_DEFEATED_QUEST_ID, COLONY_HARBOUR_LOST_QUEST_ID,
  COLONY_HOLD_DEADLINE, COLONY_HOLD_QUEST_ID
} from "../constants.ts";
import { freezeMapScript } from "../hash.ts";
import type { MapScript, QuestBook, ScriptQuest, ScriptTrigger } from "../types/index.ts";
import {
  baseQuest, bookText, coinReward, endAndNotify, eventTrigger, hiddenFailureQuest, holdText, HUMAN_PLAYER,
  questStep, scenarioDeadline, scenarioObjective, scenarioScript
} from "./book-parts.ts";
import {
  COLONY_BOOK_ID_PREFIX, COLONY_DEFAULT_BOOK_ID, COLONY_TRIGGER_IDS, DEFAULT_SCENARIO_RULES, HARBOUR_CONTENT_ID
} from "./constants.ts";
import type { ScenarioBookRules } from "./types.ts";

/**
 * The generated colony book (trigger design §8.1): conquest with the authored scenario rules, defeat, the 14-day
 * hold whose expiry the server enforces silently, harbour loss and disbanding. The simulation keeps deciding
 * conquest and defeat (`settlement-colony.ts`, `authored-scenario-progress.ts`); the generated triggers mirror its
 * `colonyConquered`/`colonyDefeated` events into the quests on islands that run this script.
 */

const conquerQuest = (rules: ScenarioBookRules): ScriptQuest => baseQuest(COLONY_CONQUER_QUEST_ID, {
  deadline: scenarioDeadline(rules),
  failure: { args: { quest: { id: COLONY_HARBOUR_LOST_QUEST_ID, k: "ref", kind: "quest" }, state: {
    k: "lit", type: "string", value: "failed" } }, k: "is", pred: "questIs" },
  mapReward: coinReward(rules.rewardCoins),
  objective: scenarioObjective(rules),
  text: bookText(rules.objective === "capture" ? "colonyConquerCaptureText" : "colonyConquerDefeatText"),
  title: bookText("colonyConquerTitle"),
  visibility: "visible"
});

/**
 * Activated by the conquest event itself (not by the claim of `colony.conquer`), so its deadline is the conquest
 * `gameNow` + the catalog colony lifetime = today's `conqueredAt + COLONY_LIFETIME_MS` (locked, §8.2 item 2).
 */
const holdQuest = (): ScriptQuest => baseQuest(COLONY_HOLD_QUEST_ID, {
  activation: "action",
  deadline: { ...COLONY_HOLD_DEADLINE, kind: "dateAfterActivation" },
  onFailure: endAndNotify("expired", "colonyExpired"),
  text: holdText(),
  title: bookText("colonyHoldTitle"),
  visibility: "visible"
});

const colonyQuests = (rules: ScenarioBookRules): ScriptQuest[] => [
  conquerQuest(rules),
  hiddenFailureQuest(COLONY_DEFEATED_QUEST_ID, endAndNotify("lost", "colonyDefeated")),
  holdQuest(),
  hiddenFailureQuest(COLONY_HARBOUR_LOST_QUEST_ID, endAndNotify("lost", "colonyHarbourLost")),
  hiddenFailureQuest(COLONY_CANCELLED_QUEST_ID, endAndNotify("cancelled", "colonyCancelled"))
];

const colonyTriggers = (): ScriptTrigger[] => [
  eventTrigger(COLONY_TRIGGER_IDS.conquered, "Colony conquered",
    { kind: "colonyConquered", player: { kind: "any" }, slots: {} },
    [questStep("s1", "completeQuest", COLONY_CONQUER_QUEST_ID),
      questStep("s2", "activateQuest", COLONY_HOLD_QUEST_ID)]),
  eventTrigger(COLONY_TRIGGER_IDS.defeated, "Colony defeated",
    { kind: "colonyDefeated", player: { kind: "any" }, slots: {} },
    [questStep("s1", "failQuest", COLONY_DEFEATED_QUEST_ID)]),
  eventTrigger(COLONY_TRIGGER_IDS.harbourLost, "Harbour destroyed", {
    kind: "buildingDestroyed", player: HUMAN_PLAYER,
    slots: { building: { kind: "type", type: { type: { id: HARBOUR_CONTENT_ID, k: "ref", kind: "content" } } } }
  }, [questStep("s1", "failQuest", COLONY_HARBOUR_LOST_QUEST_ID)])
];

/** The book id of one expedition's quest instance (never repeated; a new expedition is a new instance). */
export const colonyBookId = (expeditionId: number) => `${COLONY_BOOK_ID_PREFIX}${expeditionId}`;

/** The colony script of a map's scenario rules; `bookId` names the instance (default: the shipped book). */
export const generateColonyScript = (
  rules: ScenarioBookRules = DEFAULT_SCENARIO_RULES, bookId: string = COLONY_DEFAULT_BOOK_ID
): MapScript => scenarioScript(bookId, colonyQuests(rules), colonyTriggers());

let defaultColonyScript: MapScript | undefined;

/** The shipped default colony script (frozen): generated islands without authored rules. */
export const defaultColonyBookScript = (): MapScript =>
  defaultColonyScript ??= freezeMapScript(generateColonyScript());

export const defaultColonyBook = (): QuestBook => defaultColonyBookScript().quests;
