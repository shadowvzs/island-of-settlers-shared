import {
  CAMPAIGN_LODGE_BUILDING_TYPE, CAMPAIGN_PROTECTED_BUILDING_TYPES, CAMPAIGN_SOLDIER_TYPES
} from "./campaign-constants.ts";
import { validateCampaignGraph } from "./campaign-graph-validation.ts";
import { campaignIssue, type CampaignIssue, campaignValidationResult } from "./campaign-issues.ts";
import type { Campaign, CampaignMap, CampaignUnlockCondition, CampaignVictoryRule } from "./campaign-model.ts";
import { checkQuests } from "./campaign-quest-ready.ts";
import {
  type CampaignReadyContext, type CampaignReadyRun, checkBuildingType, checkDuplicates, checkRegionReferences,
  checkScenarioBuilding, checkTranslations, checkWares, checkWeather, createReadyRun, isSoldierTypeTrainable
} from "./campaign-ready-context.ts";
import { regionReferences } from "./campaign-region-library.ts";
import { validateRegions } from "./campaign-regions.ts";
import { checkCinematics, checkSpeakers } from "./cinematics/validate.ts";

export type { CampaignReadyContext } from "./campaign-ready-context.ts";

const checkLevel = (run: CampaignReadyRun, buildingType: number, level: number, path: string) => {
  const maxLevel = run.context.buildingMaxLevels.get(buildingType);
  if (maxLevel !== undefined && level > maxLevel)
    run.issues.push(campaignIssue("error", "buildingLevelOutOfRange", path, { buildingType, level, maxLevel }));
};

const checkDisabledBuildings = (run: CampaignReadyRun) => {
  const { disabledBuildings, lodgeAllowed } = run.map;
  checkDuplicates(run, disabledBuildings.map(entry => String(entry.buildingType)), "disabledBuildings");
  disabledBuildings.forEach(({ buildingType, maxLevel }, index) => {
    const path = `disabledBuildings[${index}]`;
    if (!checkBuildingType(run, buildingType, `${path}.buildingType`)) return;
    if (CAMPAIGN_PROTECTED_BUILDING_TYPES.includes(buildingType))
      run.issues.push(campaignIssue("error", "protectedBuildingDisabled", path, { buildingType }));
    // Single source of truth (C7a): the Lodge is switched by `lodgeAllowed` only.
    if (buildingType === CAMPAIGN_LODGE_BUILDING_TYPE)
      run.issues.push(campaignIssue("error", "lodgeInBuildingList", path, { buildingType }));
    if (maxLevel !== null) checkLevel(run, buildingType, maxLevel, `${path}.maxLevel`);
  });
  if (lodgeAllowed && !run.map.commanderAllowed)
    run.issues.push(campaignIssue("warning", "lodgeWithoutCommander", "lodgeAllowed"));
};

const checkPresetLevels = (run: CampaignReadyRun) => {
  run.map.presetBuildingLevels.forEach(({ buildingId, level }, index) => {
    const path = `presetBuildingLevels[${index}]`;
    const buildingType = run.context.scenarioBuildings.get(buildingId);
    if (buildingType === undefined) { checkScenarioBuilding(run, buildingId, `${path}.buildingId`); return; }
    checkLevel(run, buildingType, level, `${path}.level`);
  });
};

const checkUnlock = (run: CampaignReadyRun, condition: CampaignUnlockCondition, path: string) => {
  if (condition.kind === "homeGoods") checkWares(run, condition.goods, `${path}.goods`);
  if (condition.kind !== "homeBuilding") return;
  if (checkBuildingType(run, condition.buildingType, `${path}.buildingType`))
    checkLevel(run, condition.buildingType, condition.minLevel, `${path}.minLevel`);
};

const checkSupply = (run: CampaignReadyRun) => {
  const capacity = run.context.shipCapacity, { soldiers, wares } = run.map.supplyRequests;
  checkWares(run, wares.map(({ maxAmount, ware }) => ({ amount: maxAmount, ware })), "supplyRequests.wares");
  const lines = [...wares.map(line => ({ line: line.ware, maxAmount: line.maxAmount, path: "wares" })),
    ...soldiers.map(line => ({ line: line.type, maxAmount: line.maxAmount, path: "soldiers" }))];
  lines.forEach(({ line, maxAmount, path }) => {
    if (maxAmount > capacity) run.issues.push(campaignIssue("error", "supplyAmountAboveShip",
      `supplyRequests.${path}`, { amount: maxAmount, capacity, line }));
  });
};

/** Victory rules the player can only win by fighting (the survive and hold rules can be won by defending). */
const COMBAT_VICTORY_KINDS: ReadonlySet<CampaignVictoryRule["kind"]> =
  new Set(["destroyHeadquarters", "destroyTarget", "eliminateArmy", "totalVictory"]);

/** Item 38: a fighting victory with no shipped soldiers needs a soldier type the map can train. */
const checkSoldierSource = (run: CampaignReadyRun) => {
  if (!COMBAT_VICTORY_KINDS.has(run.map.victory.kind)) return;
  if (run.map.requiredCargo.soldiers.some(line => line.amount > 0)) return;
  if (CAMPAIGN_SOLDIER_TYPES.some(type => isSoldierTypeTrainable(run, type))) return;
  run.issues.push(campaignIssue("error", "noSoldierSource", "victory", { rule: run.map.victory.kind }));
};

const checkVictory = (run: CampaignReadyRun) => {
  const { victory } = run.map;
  if (victory.kind === "destroyTarget") checkScenarioBuilding(run, victory.buildingId, "victory.buildingId");
  checkSoldierSource(run);
};

/**
 * The region library (CIN0): well-formed shapes on the map, reachable when the world check is given, and every
 * reference resolving to a library region.
 */
const checkRegions = (run: CampaignReadyRun) => {
  const { regions } = run.map;
  run.issues.push(...validateRegions(regions, run.context.mapBounds));
  const reachable = run.context.isRegionReachable;
  if (reachable) for (const region of regions)
    if (!reachable(region)) run.issues.push(campaignIssue("error", "unreachableRegion", "regions",
      { regionId: region.id }));
  checkRegionReferences(run, regionReferences(run.map));
};

/** Named exits (BR0): unique ids and translated names; their epilogue sequences are checked with the hooks. */
const checkExits = (run: CampaignReadyRun) => {
  const exits = run.map.exits ?? [];
  checkDuplicates(run, exits.map(exit => exit.id), "exits");
  exits.forEach((exit, index) => checkTranslations(run, exit.name, `exits[${index}].name`));
};

const checkCargoAndRewards = (run: CampaignReadyRun) => {
  const { extraCargo, requiredCargo, rewards } = run.map;
  checkWares(run, requiredCargo.goods, "requiredCargo.goods");
  checkWares(run, extraCargo.goods, "extraCargo.goods");
  checkWares(run, rewards.goods, "rewards.goods");
  run.map.unlock.forEach((condition, index) => checkUnlock(run, condition, `unlock[${index}]`));
};

/**
 * The checks of saving a campaign map as Ready (owner "Editor feature additions" 2 and edge case 9): circular
 * prerequisites, deleted references (regions included), a soldier source for a fighting victory, blacklist conflicts, untrainable soldier types, missing translations and
 * images, repeatable quests with a home reward, weather vs season, supply lines above one ship. Draft saves skip
 * it. Pure: no I/O, no clock; the same input always gives the same ordered result.
 */
export const validateCampaignMapReady = (map: CampaignMap, context: CampaignReadyContext) => {
  const run = createReadyRun(map, context);
  checkTranslations(run, map.name, "name");
  checkExits(run);
  checkRegions(run);
  checkDuplicates(run, map.quests.map(quest => quest.id), "quests");
  checkDisabledBuildings(run);
  checkPresetLevels(run);
  checkCargoAndRewards(run);
  checkSupply(run);
  checkVictory(run);
  checkWeather(run, map.start.weather, map.start.season, "start.weather");
  checkQuests(run);
  checkCinematics(run);
  return campaignValidationResult(run.issues);
};

const checkCampaignMaps = (
  run: Pick<CampaignReadyRun, "issues">, campaign: Campaign, maps: ReadonlyMap<string, CampaignMap>
) => {
  if (!campaign.mapIds.length) run.issues.push(campaignIssue("error", "campaignHasNoMaps", "mapIds"));
  checkDuplicates(run, campaign.mapIds, "mapIds");
  campaign.mapIds.forEach((mapId, index) => {
    const path = `mapIds[${index}]`, map = maps.get(mapId);
    if (!map) { run.issues.push(campaignIssue("error", "campaignMapMissing", path, { mapId })); return; }
    if (map.campaignId !== campaign.id) run.issues.push(campaignIssue("error", "campaignMapNotOwned", path, { mapId }));
    if (map.state !== "ready") run.issues.push(campaignIssue("error", "campaignMapNotReady", path, { mapId }));
  });
};

/** The campaign map view (C6): an image that still exists and a node for every listed map. */
const checkCampaignMapView = (
  run: { context: Partial<Pick<CampaignReadyContext, "imageIds">>; issues: CampaignIssue[] }, campaign: Campaign
) => {
  const { imageId } = campaign;
  if (imageId === undefined) run.issues.push(campaignIssue("warning", "campaignImageMissing", "imageId"));
  if (imageId !== undefined && run.context.imageIds && !run.context.imageIds.has(imageId))
    run.issues.push(campaignIssue("error", "campaignImageDeleted", "imageId", { imageId }));
  const placed = new Set((campaign.mapNodes ?? []).map(node => node.mapId));
  campaign.mapIds.forEach((mapId, index) => {
    if (!placed.has(mapId)) run.issues.push(campaignIssue("warning", "campaignMapNodeMissing", `mapNodes[${index}]`,
      { mapId }));
  });
};

/**
 * Ready checks of the campaign document itself: translations, listed maps that exist, belong to this campaign
 * (one campaign per map) and are Ready, the campaign graph (BR0: start maps, edges, exits), the map view image and
 * nodes (C6), a sane availability window and the cinematics speakers (images are checked when `imageIds` is given).
 * Map contents use validateCampaignMapReady.
 */
export const validateCampaignReady = (
  campaign: Campaign, maps: readonly CampaignMap[],
  context: Partial<Pick<CampaignReadyContext, "imageIds" | "languages">> = {}
) => {
  const run = { context, issues: [] as CampaignIssue[] };
  checkTranslations(run, campaign.name, "name");
  if (campaign.description.en.trim()) checkTranslations(run, campaign.description, "description");
  checkSpeakers(run, campaign.speakers ?? []);
  const mapsById = new Map(maps.map(map => [map.id, map]));
  checkCampaignMaps(run, campaign, mapsById);
  run.issues.push(...validateCampaignGraph(campaign, mapsById));
  checkCampaignMapView(run, campaign);
  const { from, until } = campaign.availability;
  if (from !== null && until !== null && until <= from)
    run.issues.push(campaignIssue("error", "availabilityWindowInvalid", "availability"));
  return campaignValidationResult(run.issues);
};
