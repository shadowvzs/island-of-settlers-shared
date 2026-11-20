import {
  ADVENTURE_WIN_QUEST_ID, COLONY_CONQUER_QUEST_ID, COLONY_HOLD_DEADLINE
} from "../constants.ts";
import type {
  MapScript, QuestBook, QuestDeadline, QuestObjective, QuestRewards, QuestText, ScriptAction, ScriptQuest,
  ScriptTrigger
} from "../types/index.ts";
import { ARCHIPELAGO_TEXT_KEYS, ARCHIPELAGO_TEXTS_EN, HUMAN_PLAYER_FACTION } from "./constants.ts";
import type { ColonyEndReason, ScenarioBookRules } from "./types.ts";

/** Building blocks shared by the generated colony and adventure books (trigger design §8.1). */

type TextKey = keyof typeof ARCHIPELAGO_TEXT_KEYS;

const ISLAND_VALUE = Object.freeze({
  island: { expr: { args: {}, fn: "islandName", k: "fn" }, format: "text", kind: "expr" }
} as const);

/** A generated text: English source plus its Lingui id; hu/de come from the client catalogs. */
export const bookText = (key: TextKey): QuestText =>
  ({ en: ARCHIPELAGO_TEXTS_EN[key], translationKey: ARCHIPELAGO_TEXT_KEYS[key] });

/** A notice naming the island through the `islandName` function (the executor's viewer evaluates it). */
export const islandNotice = (key: TextKey): QuestText => ({ ...bookText(key), values: ISLAND_VALUE });

export const holdText = (): QuestText => ({
  ...bookText("colonyHoldText"), values: { days: { kind: "number", value: COLONY_HOLD_DEADLINE.days } }
});

const questRef = (id: string) => ({ id, k: "ref" as const, kind: "quest" as const });

export const questStep = (id: string, op: "activateQuest" | "completeQuest" | "failQuest", questId: string) =>
  ({ args: { quest: questRef(questId) }, id, k: "do", op }) as ScriptAction;

export const colonyEndStep = (id: string, reason: ColonyEndReason) =>
  ({ args: { reason: { k: "lit", type: "string", value: reason } }, id, k: "do", op: "colonyEnd" }) as ScriptAction;

export const notifyStep = (id: string, text: QuestText) => ({
  args: { important: { k: "lit", type: "boolean", value: true }, text: { k: "text", text } }, id, k: "do",
  op: "notify"
}) as ScriptAction;

export const endMapStep = (id: string, outcome: "defeat" | "victory") =>
  ({ args: { outcome: { k: "lit", type: "string", value: outcome } }, id, k: "do", op: "endMap" }) as ScriptAction;

/** The colony ends for `reason` and the player is told why (the two archipelago executor actions). */
export const endAndNotify = (reason: ColonyEndReason, notice: TextKey): ScriptAction[] =>
  [colonyEndStep("s1", reason), notifyStep("s2", islandNotice(notice))];

export const baseQuest = (id: string, fields: Partial<ScriptQuest>): ScriptQuest => ({
  cost: [], deadline: null, failure: null, id, objective: { kind: "scripted" }, onActivate: [], onFailure: [],
  onSuccess: [], repeat: { kind: "once", retryAfterFail: false }, visibility: "hidden", ...fields
});

/** A hidden quest only actions fail (`activation: "auto"`: active from the map start). */
export const hiddenFailureQuest = (id: string, onFailure: ScriptAction[]) => baseQuest(id, { onFailure });

const withHold = (claimSeconds: number) => (claimSeconds > 0 ? { holdSeconds: claimSeconds } : {});

/** `MapScenario.objective` + `claimSeconds` as the built-in combat objective with its hold time. */
export const scenarioObjective = (rules: ScenarioBookRules): QuestObjective => {
  const hold = withHold(rules.claimSeconds);
  if (rules.objective === "capture") return { all: true, buildingId: null, kind: "enemyBuildingDestroyed", ...hold };
  return { all: true, count: 1, kind: "enemiesDefeated", ...hold };
};

/** Authored `expirySeconds` counts offline too: the `gameTime` deadline (owner round 5, item 11). */
export const scenarioDeadline = (rules: ScenarioBookRules): QuestDeadline | null =>
  rules.expirySeconds > 0 ? { kind: "gameTime", seconds: rules.expirySeconds } : null;

export const coinReward = (coins: number): QuestRewards | null =>
  coins > 0 ? { buildingUnlocks: [], coins, decorations: [], gems: 0, goods: [], xp: 0 } : null;

/** A generated trigger: one event of the human player, one action list. */
export const eventTrigger = (
  id: string, name: string, event: ScriptTrigger["events"][number], actions: ScriptAction[]
): ScriptTrigger => ({
  actions, concurrency: "ignore", conditions: { k: "all", of: [] }, enabled: true, events: [event], folderId: null, id,
  name, runLimit: 1
});

export const HUMAN_PLAYER = Object.freeze({ faction: HUMAN_PLAYER_FACTION, kind: "slot" as const });

export const scenarioScript = (bookId: string, quests: ScriptQuest[], triggers: ScriptTrigger[]): MapScript => {
  const book: QuestBook = {
    daily: "off", dailyResetUtcMinutes: 0, groups: [], id: bookId, quests, revision: 1, version: 1
  };
  return {
    actors: [], cameraShots: [], folders: [], homeRewards: [],
    nextIds: { actor: 0, folder: 0, region: 0, reward: 0, trigger: 0, variable: 0 },
    quests: book, regions: [], revision: 1, scriptUid: bookId, sequences: [], triggers, variables: [], version: 1
  };
};

/** The quest that carries the authored scenario rules in a generated book. */
export const scenarioQuestOf = (book: QuestBook) =>
  book.quests.find(quest => quest.id === COLONY_CONQUER_QUEST_ID || quest.id === ADVENTURE_WIN_QUEST_ID);
