import { CAMPAIGN_SOLDIER_TYPES } from "../../campaign/campaign-constants.ts";
import { validateRewardEntries } from "../../catalog/validate/rewards.ts";
import {
  CATCH_UP_COUNTER_PREFIXES, CATCH_UP_COUNTERS, COLONY_CANCELLED_QUEST_ID, COLONY_HOLD_DEADLINE,
  COLONY_HOLD_QUEST_ID, QUEST_ACTION_KEYS, QUEST_ACTION_PROMOTE_PATTERN, QUEST_LIST_RESPONSES
} from "../constants.ts";
import { questRewardEntries } from "../quest-rewards.ts";
import { isObjectiveAllowed } from "../scopes.ts";
import type { QuestObjective, QuestRewards, ScriptQuest } from "../types/quests.ts";
import type { ScriptGoodsLine } from "../types/rewards.ts";
import { checkActionList } from "./actions.ts";
import { checkCondition } from "./conditions.ts";
import { checkContentKind } from "./content.ts";
import type { ValidationRun } from "./context.ts";
import { checkText, expectType } from "./expr.ts";
import { createScope, type ExprScope } from "./scope.ts";

/** Quests of the map script (trigger design §4.10, §8): objectives, failure, deadlines, lists, rewards, costs. */

const isKnownCounter = (run: ValidationRun, counter: string) => {
  if (CATCH_UP_COUNTERS.includes(counter)) return true;
  if (counter.startsWith(CATCH_UP_COUNTER_PREFIXES.produce))
    return run.catalog.entry(`ware:${counter.slice(CATCH_UP_COUNTER_PREFIXES.produce.length)}`) !== undefined;
  if (!counter.startsWith(CATCH_UP_COUNTER_PREFIXES.plant)) return false;
  const family = counter.slice(CATCH_UP_COUNTER_PREFIXES.plant.length);
  return run.catalog.family(family).some(entry => entry.kind === "tree");
};

const isQuestAction = (action: string) =>
  QUEST_ACTION_KEYS.includes(action) || QUEST_ACTION_PROMOTE_PATTERN.test(action);

const checkBuiltInContent = (run: ValidationRun, objective: QuestObjective, path: string) => {
  if (objective.kind === "buildingCompleted") checkContentKind(run, objective.building, ["building"],
    `${path}.building`);
  if (objective.kind === "soldierCount" && objective.soldierType)
    checkContentKind(run, objective.soldierType, ["soldier"], `${path}.soldierType`);
  if (objective.kind === "stockLevel" || objective.kind === "wareProduced")
    checkContentKind(run, objective.ware, ["ware"], `${path}.ware`);
  if (objective.kind === "stockLevel" && objective.building)
    checkContentKind(run, objective.building, ["building"], `${path}.building`);
};

const checkObjective = (run: ValidationRun, objective: QuestObjective, scope: ExprScope, path: string) => {
  const { kind } = objective;
  if (kind === "condition") {
    checkCondition(run, objective.condition, scope, `${path}.condition`);
    if (!objective.progress) return;
    expectType(run, objective.progress.current, "number", scope, `${path}.progress.current`);
    expectType(run, objective.progress.target, "number", scope, `${path}.progress.target`);
    return;
  }
  if (kind === "counterReached") {
    if (!isKnownCounter(run, objective.counter))
      run.sink.add("error", "unknownCounter", `${path}.counter`, { counter: objective.counter });
    return;
  }
  if (kind === "scripted") return;
  if (!isObjectiveAllowed(run.context.mapKind, kind))
    run.sink.add("error", "notOnMapKind", `${path}.kind`, { kind, mapKind: run.context.mapKind });
  if (kind === "clockTime") run.environment.reads = true;
  if (kind === "actionPerformed" && !isQuestAction(objective.action))
    run.sink.add("error", "unknownQuestAction", `${path}.action`, { action: objective.action });
  checkBuiltInContent(run, objective, path);
};

const checkRewards = (run: ValidationRun, rewards: QuestRewards | null | undefined, path: string) => {
  if (!rewards) return;
  const soldierTypes = run.context.soldierTypes ?? CAMPAIGN_SOLDIER_TYPES;
  const options = { buildingTypes: run.context.buildingTypes, soldierTypes };
  for (const issue of validateRewardEntries(questRewardEntries(rewards), options, path))
    run.sink.add("error", "invalidReward", path, { detail: issue.message });
};

export const checkGoodsWares = (run: ValidationRun, goods: readonly ScriptGoodsLine[], path: string) =>
  goods.forEach((line, index) => {
    const id = `ware:${line.ware}`;
    if (!run.catalog.entry(id)) run.sink.add("error", "unknownContent", `${path}[${index}].ware`, { id });
  });

const hasRewards = (rewards: QuestRewards | null | undefined) => rewards !== null && rewards !== undefined &&
  questRewardEntries(rewards).length > 0;

const checkQuestTexts = (run: ValidationRun, quest: ScriptQuest, scope: ExprScope, path: string) => {
  if (quest.visibility === "visible" && !quest.title) run.sink.add("error", "missingEnglishText", `${path}.title`);
  if (quest.title) checkText(run, quest.title, scope, `${path}.title`);
  if (quest.text) checkText(run, quest.text, scope, `${path}.text`);
  if (quest.details?.benefit) checkText(run, quest.details.benefit, scope, `${path}.details.benefit`);
  if (quest.details?.tips) checkText(run, quest.details.tips, scope, `${path}.details.tips`);
};

const isColonyHoldDeadline = (quest: ScriptQuest) => {
  const { deadline } = quest;
  return deadline?.kind === "dateAfterActivation" && deadline.days === COLONY_HOLD_DEADLINE.days &&
    deadline.hours === COLONY_HOLD_DEADLINE.hours && deadline.minutes === COLONY_HOLD_DEADLINE.minutes;
};

const checkLists = (run: ValidationRun, quest: ScriptQuest, scope: ExprScope, path: string) => {
  const archipelago = quest.id === COLONY_HOLD_QUEST_ID || quest.id === COLONY_CANCELLED_QUEST_ID;
  checkActionList(run, quest.onActivate, scope, `${path}.onActivate`, { stepIds: new Set() });
  checkActionList(run, quest.onSuccess, scope, `${path}.onSuccess`, { stepIds: new Set() });
  checkActionList(run, quest.onFailure, scope, `${path}.onFailure`,
    { archipelagoQuest: archipelago ? quest.id : undefined, stepIds: new Set() });
};

const checkQuest = (run: ValidationRun, quest: ScriptQuest, path: string) => {
  const scope = createScope(QUEST_LIST_RESPONSES);
  const groupId = quest.groupId;
  if (groupId && !run.index.groups.has(groupId)) run.sink.add("error", "unknownGroup", `${path}.groupId`, { groupId });
  checkQuestTexts(run, quest, scope, path);
  checkObjective(run, quest.objective, scope, `${path}.objective`);
  if (quest.failure) checkCondition(run, quest.failure, scope, `${path}.failure`);
  if (quest.deadline?.kind === "date") expectType(run, quest.deadline.at, "number", scope, `${path}.deadline.at`);
  if (quest.id === COLONY_HOLD_QUEST_ID && run.context.mapKind === "colony" && !isColonyHoldDeadline(quest))
    run.sink.add("error", "colonyHoldDeadlineLocked", `${path}.deadline`);
  checkLists(run, quest, scope, path);
  checkRewards(run, quest.homeReward, `${path}.homeReward`);
  checkRewards(run, quest.mapReward, `${path}.mapReward`);
  checkGoodsWares(run, quest.cost, `${path}.cost`);
  if (quest.repeat.kind === "onCompletion" && hasRewards(quest.homeReward))
    run.sink.add("warning", "homeRewardBeforeCompletionProof", `${path}.repeat`, { item: quest.id });
};

/** Quest ids that lie on a prerequisite cycle (they can never activate). */
const cyclicQuests = (quests: readonly ScriptQuest[]) => {
  const edges = new Map(quests.map(quest => [quest.id, (quest.prerequisites ?? []).map(ref => ref.id)]));
  const cyclic = new Set<string>();
  const reaches = (from: string, target: string, seen: Set<string>): boolean =>
    (edges.get(from) ?? []).some(next => next === target || (!seen.has(next) && reaches(next, target, seen.add(next))));
  for (const quest of quests) if (reaches(quest.id, quest.id, new Set())) cyclic.add(quest.id);
  return cyclic;
};

export const checkQuests = (run: ValidationRun) => {
  const { groups, quests } = run.script.quests;
  groups.forEach((group, index) => {
    const path = `quests.groups[${index}]`;
    checkText(run, group.title, createScope(), `${path}.title`);
    group.requiresGroups.forEach((groupId, item) => {
      if (!run.index.groups.has(groupId))
        run.sink.add("error", "unknownGroup", `${path}.requiresGroups[${item}]`, { groupId });
    });
  });
  quests.forEach((quest, index) => checkQuest(run, quest, `quests.quests[${index}]`));
  const cyclic = cyclicQuests(quests);
  quests.forEach((quest, index) => {
    if (cyclic.has(quest.id))
      run.sink.add("warning", "questPrerequisiteCycle", `quests.quests[${index}].prerequisites`, { questId: quest.id });
  });
};
