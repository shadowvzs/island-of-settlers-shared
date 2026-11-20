import { splitContentId } from "../../catalog/family.ts";
import type { QuestBook, QuestGroup, QuestObjective, QuestResource, ScriptQuest } from "../types/quests.ts";
import type { QuestInstanceState, QuestRunState } from "../types/run-state.ts";

/**
 * Quest objectives, activation and skip rules over a quest book (TRG6, QU §7.2–§7.4, trigger design §4.10). Pure
 * functions shared by the script engine (1 s cadence on script islands) and the home quest runtime (the default
 * home book in the player progress). The world is read through `QuestFacts` only; counters are the QU §7.7 keys
 * that offline catch-up already maintains (`ship`, `tools`, `produce:<ware>`, `plant`, …).
 */

/** What objectives read from the island. Content ids are catalog ids (`building:…`, `soldier:…`). */
export interface QuestFacts {
  /** Completed buildings of the player (faction 0) of a catalog building. */
  buildingCount: (building: string) => number;
  /** An action or production counter (never decreases). */
  counter: (key: string) => number;
  /** The island has none of a natural resource (makes a required quest skippable). */
  missingResource: (resource: QuestResource) => boolean;
  playerLevel: () => number;
  /** The nation drink rule (every map kind): the Roman grape/wine chain read as the player's own ware key. */
  questWare: (ware: string) => string;
  /** Player soldiers of a catalog troop type (`null` = every type), only the stationed ones when asked. */
  soldierCount: (soldierType: string | null, stationed: boolean) => number;
  /** A ware key in the player's completed buildings of a catalog building, or the whole island stock. */
  stock: (ware: string, building: string | null) => number;
  /** Deposits already surveyed on the island (a previous survey keeps a survey objective done). */
  surveyedDeposits: () => number;
  /** The world environment's clock hour (ENV0, `clockTime`); absent or null where the island has none. */
  worldHour?: () => number | null;
}

export interface QuestProgress {
  current: number;
  target: number;
}

/** Evaluates a `condition` objective (the engine supplies it; the home runtime has none). */
export type QuestConditionCheck = (objective: Extract<QuestObjective, { kind: "condition" }>) =>
  QuestProgress | null;

const SURVEY_ACTION = "survey";

const wareKey = (contentId: string) => splitContentId(contentId)?.key ?? contentId;

/** The counter an objective counts from its activation baseline, or null for live-state objectives. */
export const objectiveCounterKey = (objective: QuestObjective, facts: QuestFacts): string | null => {
  if (objective.kind === "wareProduced") return `produce:${facts.questWare(wareKey(objective.ware.id))}`;
  if (objective.kind === "actionPerformed") return objective.since === "activation" ? objective.action : null;
  if (objective.kind === "counterReached") return objective.since === "activation" ? objective.counter : null;
  return null;
};

/** The counter value stored at activation, or undefined when the objective needs no baseline. */
export const activationBaseline = (objective: QuestObjective, facts: QuestFacts) => {
  const key = objectiveCounterKey(objective, facts);
  return key === null ? undefined : facts.counter(key);
};

const sinceBaseline = (facts: QuestFacts, key: string, quest: QuestInstanceState) =>
  Math.max(0, facts.counter(key) - (quest.baseline ?? 0));

const actionProgress = (
  objective: Extract<QuestObjective, { kind: "actionPerformed" }>, quest: QuestInstanceState, facts: QuestFacts
) => {
  if (objective.action === SURVEY_ACTION && facts.surveyedDeposits() > 0) return 1;
  if (objective.since === "ever") return facts.counter(objective.action);
  return sinceBaseline(facts, objective.action, quest);
};

const counterProgress = (
  objective: Extract<QuestObjective, { kind: "counterReached" }>, quest: QuestInstanceState, facts: QuestFacts
) => objective.since === "mapStart" ? facts.counter(objective.counter) : sinceBaseline(facts, objective.counter, quest);

const progress = (current: number, target: number): QuestProgress => ({ current: Math.min(current, target), target });

/**
 * Progress of an objective (clamped to the target), or null when the objective is completed by events, actions or
 * the engine only (`scripted`, regions, actors, combat, time).
 */
/** `clockTime`: met while the world clock shows the objective's hour (ENV0); null without a world clock. */
const clockTimeProgress = (hour: number, facts: QuestFacts) => {
  const current = facts.worldHour?.() ?? null;
  if (current === null) return null;
  return progress(Math.floor(current) === Math.floor(hour) ? 1 : 0, 1);
};

export const objectiveProgress = (
  objective: QuestObjective, quest: QuestInstanceState, facts: QuestFacts, condition?: QuestConditionCheck
): QuestProgress | null => {
  switch (objective.kind) {
    case "buildingCompleted":
      return progress(facts.buildingCount(objective.building.id), objective.count);
    case "stockLevel": {
      const ware = facts.questWare(wareKey(objective.ware.id));
      return progress(facts.stock(ware, objective.building?.id ?? null), objective.amount);
    }
    case "soldierCount":
      return progress(facts.soldierCount(objective.soldierType?.id ?? null, objective.stationed ?? false),
        objective.count);
    case "wareProduced":
      return progress(sinceBaseline(facts, objectiveCounterKey(objective, facts)!, quest), objective.amount);
    case "actionPerformed":
      return progress(actionProgress(objective, quest, facts), objective.count);
    case "counterReached":
      return progress(counterProgress(objective, quest, facts), objective.target);
    case "mapStart":
    case "prerequisitesDone":
      return progress(1, 1);
    case "condition":
      return condition?.(objective) ?? null;
    case "clockTime":
      return clockTimeProgress(objective.hour, facts);
    default:
      return null;
  }
};

export const isProgressComplete = (value: QuestProgress | null) => value !== null && value.current >= value.target;

/** Optional quests may always be skipped; a required one when the island lacks its natural resource. */
export const isQuestSkippable = (quest: ScriptQuest, facts: QuestFacts) => {
  if (quest.optional) return true;
  const rule = quest.skippableWhen;
  return rule?.kind === "missingResource" && facts.missingResource(rule.resource);
};

/** A quest is finished for its group once it was claimed (or skipped) at least once, or retired. */
export const isQuestFinished = (state: QuestInstanceState | undefined) =>
  Boolean(state && (state.claimCount > 0 || state.state === "retired"));

const groupQuests = (book: QuestBook, groupId: string) => book.quests.filter(quest => quest.groupId === groupId);

const isGroupFinished = (book: QuestBook, states: QuestRunState, groupId: string) =>
  groupQuests(book, groupId).every(quest => isQuestFinished(states[quest.id]));

const isGroupUnlocked = (book: QuestBook, states: QuestRunState, group: QuestGroup, level: number) =>
  (!group.unlock || level >= group.unlock.level) &&
  group.requiresGroups.every(id => isGroupFinished(book, states, id));

const firstOpenOfGroup = (book: QuestBook, states: QuestRunState, groupId: string) =>
  groupQuests(book, groupId).find(quest => !isQuestFinished(states[quest.id]));

/** Index of groups by id (built once per book by callers that evaluate often). */
export const questGroupsById = (book: QuestBook) => new Map(book.groups.map(group => [group.id, group]));

/**
 * The quest may become active now (QU §7.3): it is inactive and auto-activated, its group is unlocked (level and
 * required groups), a sequential group has it as the first unfinished quest, its own unlock holds and every
 * prerequisite is finished. A quest without a state entry is inactive (books whose state keeps touched quests only).
 */
export const isQuestEligible = (
  book: QuestBook, groups: ReadonlyMap<string, QuestGroup>, states: QuestRunState, quest: ScriptQuest, level: number
) => {
  const state = states[quest.id]?.state ?? "inactive";
  if (state !== "inactive" || quest.activation === "action") return false;
  if (quest.unlock && level < quest.unlock.level) return false;
  if (!(quest.prerequisites ?? []).every(ref => isQuestFinished(states[ref.id]))) return false;
  const group = quest.groupId ? groups.get(quest.groupId) : undefined;
  if (!group) return true;
  if (!isGroupUnlocked(book, states, group, level)) return false;
  return group.activation === "parallel" || firstOpenOfGroup(book, states, group.id)?.id === quest.id;
};

/** Ids of the quests that may activate now, in book order. */
export const eligibleQuestIds = (book: QuestBook, states: QuestRunState, level: number) => {
  const groups = questGroupsById(book);
  return book.quests.filter(quest => isQuestEligible(book, groups, states, quest, level)).map(quest => quest.id);
};

/** No other quest of the quest's group is still open (the group's last claim tops XP up, QU §7.4). */
export const isLastOpenOfGroup = (book: QuestBook, states: QuestRunState, quest: ScriptQuest) =>
  !quest.groupId ||
  groupQuests(book, quest.groupId).every(other => other.id === quest.id || isQuestFinished(states[other.id]));

/** An island without readable facts: built-in objectives make no progress, nothing is missing, level 0. */
export const NO_QUEST_FACTS: QuestFacts = Object.freeze({
  buildingCount: () => 0,
  counter: () => 0,
  missingResource: () => false,
  playerLevel: () => 0,
  questWare: (ware: string) => ware,
  soldierCount: () => 0,
  stock: () => 0,
  surveyedDeposits: () => 0
});
