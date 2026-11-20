import { CAMPAIGN_SOLDIER_TYPES } from "./campaign-constants.ts";
import { campaignIssue } from "./campaign-issues.ts";
import type { CampaignRewards, CampaignSoldierAmount, CampaignSoldierType } from "./campaign-model.ts";
import type { CampaignClaimEffect, CampaignQuest, CampaignQuestTrigger } from "./campaign-quest.ts";
import {
  type CampaignReadyRun, checkBuildingType, checkScenarioBuilding, checkTranslations, checkWares,
  checkWeather, isSoldierTypeTrainable
} from "./campaign-ready-context.ts";

/** Quest ids that sit on a prerequisite cycle (depth-first search; each id reported once). */
export const questsOnPrerequisiteCycles = (quests: readonly CampaignQuest[]) => {
  const prerequisites = new Map(quests.map(quest => [quest.id, quest.prerequisites]));
  const finished = new Set<string>(), cyclic = new Set<string>(), stack: string[] = [];
  const visit = (id: string) => {
    const open = stack.indexOf(id);
    if (open >= 0) { for (const member of stack.slice(open)) cyclic.add(member); return; }
    if (finished.has(id) || !prerequisites.has(id)) return;
    stack.push(id);
    for (const next of prerequisites.get(id) ?? []) visit(next);
    stack.pop();
    finished.add(id);
  };
  for (const quest of quests) visit(quest.id);
  return quests.map(quest => quest.id).filter(id => cyclic.has(id));
};

const soldiersOf = (lines: readonly CampaignSoldierAmount[], type: CampaignSoldierType | "total") =>
  lines.reduce((sum, line) => sum + (type === "total" || line.type === type ? line.amount : 0), 0);

/** Soldiers of `type` the player can have without training: shipped (required + extras) and other quests' rewards. */
const deliverableSoldiers = (run: CampaignReadyRun, questId: string, type: CampaignSoldierType | "total") => {
  const { extraCargo, quests, requiredCargo } = run.map;
  const rewarded = quests.filter(quest => quest.id !== questId)
    .reduce((sum, quest) => sum + soldiersOf(quest.mapReward?.soldiers ?? [], type), 0);
  return soldiersOf(requiredCargo.soldiers, type) + soldiersOf(extraCargo.soldiers, type) + rewarded;
};

const checkSoldierTrigger = (
  run: CampaignReadyRun, quest: CampaignQuest, trigger: Extract<CampaignQuestTrigger, { kind: "soldierCount" }>,
  path: string
) => {
  const types = trigger.soldierType === "total" ? CAMPAIGN_SOLDIER_TYPES : [trigger.soldierType];
  if (types.some(type => isSoldierTypeTrainable(run, type))) return;
  if (deliverableSoldiers(run, quest.id, trigger.soldierType) >= trigger.count) return;
  run.issues.push(campaignIssue("error", "untrainableSoldierType", path,
    { questId: quest.id, soldierType: trigger.soldierType }));
};

const checkBuildingTrigger = (run: CampaignReadyRun, questId: string, buildingType: number, path: string) => {
  if (!checkBuildingType(run, buildingType, `${path}.buildingType`)) return;
  if (run.blockedBuildingTypes.has(buildingType))
    run.issues.push(campaignIssue("error", "blacklistedTriggerBuilding", path, { buildingType, questId }));
};

const checkTrigger = (run: CampaignReadyRun, quest: CampaignQuest, path: string) => {
  const { trigger } = quest;
  if (trigger.kind === "buildingCompleted") checkBuildingTrigger(run, quest.id, trigger.buildingType, path);
  if (trigger.kind === "soldierCount") checkSoldierTrigger(run, quest, trigger, path);
  if (trigger.kind === "stockLevel") checkWares(run, [trigger], path);
  if (trigger.kind === "enemyBuildingDestroyed" && trigger.buildingId !== null)
    checkScenarioBuilding(run, trigger.buildingId, `${path}.buildingId`);
  if (trigger.kind === "prerequisitesDone" && !quest.prerequisites.length)
    run.issues.push(campaignIssue("error", "prerequisitesTriggerWithoutPrerequisites", path, { questId: quest.id }));
};

const checkEffect = (run: CampaignReadyRun, questId: string, effect: CampaignClaimEffect, path: string) => {
  if (effect.kind === "buildingAvailability") checkBuildingType(run, effect.buildingType, `${path}.buildingType`);
  if (effect.kind === "weather") checkWeather(run, effect.weather, run.map.start.season, `${path}.weather`);
  if (effect.kind !== "enemyWave") return;
  const amount = soldiersOf(effect.soldiers, "total"), cap = run.map.maxEnemySoldiers;
  if (amount > cap) run.issues.push(campaignIssue("warning", "waveAboveEnemyCap", path, { amount, cap, questId }));
};

const hasHomeReward = (reward: CampaignRewards | null) => reward !== null && (reward.coins > 0 ||
  reward.gems > 0 || reward.xp > 0 || reward.goods.length > 0 || reward.decorations.length > 0);

const checkReferences = (run: CampaignReadyRun, quest: CampaignQuest, path: string, questIds: ReadonlySet<string>) => {
  for (const reference of quest.prerequisites)
    if (!questIds.has(reference))
      run.issues.push(campaignIssue("error", "missingQuestReference", `${path}.prerequisites`,
        { questId: quest.id, reference }));
  if (quest.imageId !== null && !run.context.imageIds.has(quest.imageId))
    run.issues.push(campaignIssue("error", "missingImage", `${path}.imageId`,
      { imageId: quest.imageId, questId: quest.id }));
};

const checkQuest = (run: CampaignReadyRun, quest: CampaignQuest, index: number, questIds: ReadonlySet<string>) => {
  const path = `quests[${index}]`;
  if (!quest.hidden) {
    checkTranslations(run, quest.title, `${path}.title`);
    checkTranslations(run, quest.text, `${path}.text`);
  }
  checkReferences(run, quest, path, questIds);
  checkTrigger(run, quest, `${path}.trigger`);
  quest.claimEffects.forEach((effect, effectIndex) =>
    checkEffect(run, quest.id, effect, `${path}.claimEffects[${effectIndex}]`));
  checkWares(run, quest.mapReward?.goods ?? [], `${path}.mapReward.goods`);
  checkWares(run, quest.homeReward?.goods ?? [], `${path}.homeReward.goods`);
  if (quest.repeat !== "once" && hasHomeReward(quest.homeReward))
    run.issues.push(campaignIssue("warning", "repeatableHomeReward", `${path}.homeReward`, { questId: quest.id }));
};

/** Every quest check of the Ready validation: references, chains, triggers, rewards and claim effects. */
export const checkQuests = (run: CampaignReadyRun) => {
  const questIds = new Set(run.map.quests.map(quest => quest.id));
  run.map.quests.forEach((quest, index) => checkQuest(run, quest, index, questIds));
  for (const questId of questsOnPrerequisiteCycles(run.map.quests))
    run.issues.push(campaignIssue("error", "questPrerequisiteCycle", "quests", { questId }));
};
