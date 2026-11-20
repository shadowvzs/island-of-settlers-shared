import assert from "node:assert/strict";
import test from "node:test";

import { BuildingType } from "../src/building-types.ts";
import { type CampaignIssue, formatCampaignIssue } from "../src/campaign/campaign-issues.ts";
import { questsOnPrerequisiteCycles } from "../src/campaign/campaign-quest-ready.ts";
import { validateCampaignMapReady, validateCampaignReady } from "../src/campaign/campaign-ready-validation.ts";
import { checkCampaignShape } from "../src/campaign/campaign-shape.ts";
import { quest, readyCampaign, readyContext, readyMap } from "./campaign-fixtures.ts";

const summary = (issues: CampaignIssue[]) => issues.map(issue => `${issue.code}@${issue.path}`);

test("the fixture map is Ready without errors or warnings", () => {
  assert.deepEqual(validateCampaignMapReady(readyMap(), readyContext()),
    { errors: [], ready: true, warnings: [] });
});

test("circular prerequisites are reported for every quest on the cycle only", () => {
  const quests = [quest("a", { prerequisites: ["b"] }), quest("b", { prerequisites: ["c"] }),
    quest("c", { prerequisites: ["a"] }), quest("d", { prerequisites: ["a"] }), quest("e", { prerequisites: ["e"] })];
  assert.deepEqual(questsOnPrerequisiteCycles(quests), ["a", "b", "c", "e"]);
  const result = validateCampaignMapReady(readyMap({ quests }), readyContext());
  assert.equal(result.ready, false);
  assert.deepEqual(result.errors.map(issue => issue.params.questId), ["a", "b", "c", "e"]);
});

test("references to deleted quests, regions, images, map buildings, wares and building types are errors", () => {
  const map = readyMap({
    presetBuildingLevels: [{ buildingId: 99, level: 1 }],
    quests: [
      quest("q-1", { imageId: "image-gone", prerequisites: ["q-gone"],
        trigger: { kind: "areaReached", regionId: "region-gone", unitFilter: "any" } }),
      quest("q-2", { claimEffects: [{ kind: "revealFog", regionId: "region-gone" },
        { available: true, buildingType: 999, kind: "buildingAvailability" }],
      mapReward: { goods: [{ amount: 1, ware: "unobtainium" }], soldiers: [] },
      trigger: { buildingId: 98, kind: "enemyBuildingDestroyed" } })
    ],
    victory: { kind: "holdArea", seconds: 600, target: { kind: "region", regionId: "region-gone" } }
  });
  assert.deepEqual(summary(validateCampaignMapReady(map, readyContext()).errors), [
    "missingRegionReference@victory.target.regionId",
    "missingRegionReference@quests[0].trigger.regionId",
    "missingRegionReference@quests[1].claimEffects[0].regionId",
    "missingScenarioBuilding@presetBuildingLevels[0].buildingId",
    "missingQuestReference@quests[0].prerequisites",
    "missingImage@quests[0].imageId",
    "missingScenarioBuilding@quests[1].trigger.buildingId",
    "unknownBuildingType@quests[1].claimEffects[1].buildingType",
    "unknownWare@quests[1].mapReward.goods[0].ware"
  ]);
});

test("blacklist conflicts: protected types, banned trigger buildings, Lodge in the list and level ranges", () => {
  const build = (unlock: boolean) => readyMap({
    disabledBuildings: [{ buildingType: BuildingType.Harbour, maxLevel: null },
      { buildingType: BuildingType.Sawmill, maxLevel: null },
      { buildingType: BuildingType.CommandersLodge, maxLevel: null },
      { buildingType: BuildingType.Barracks, maxLevel: 9 }],
    lodgeAllowed: true,
    quests: [quest("q-saw", { trigger: { buildingType: BuildingType.Sawmill, count: 1, kind: "buildingCompleted" } }),
      quest("q-unlock", { claimEffects: unlock
        ? [{ available: true, buildingType: BuildingType.Sawmill, kind: "buildingAvailability" }] : [] })]
  });
  const blocked = validateCampaignMapReady(build(false), readyContext());
  assert.deepEqual(summary(blocked.errors), [
    "protectedBuildingDisabled@disabledBuildings[0]",
    "lodgeInBuildingList@disabledBuildings[2]",
    "buildingLevelOutOfRange@disabledBuildings[3].maxLevel",
    "blacklistedTriggerBuilding@quests[0].trigger"
  ]);
  assert.deepEqual(summary(blocked.warnings), ["lodgeWithoutCommander@lodgeAllowed"]);
  assert.ok(!summary(validateCampaignMapReady(build(true), readyContext()).errors)
    .includes("blacklistedTriggerBuilding@quests[0].trigger"));
});

test("a soldier-count quest needs a trainable type or enough shipped and rewarded soldiers", () => {
  const archers = (shipped: number, rewarded: number) => readyMap({
    disabledBuildings: [{ buildingType: BuildingType.MilitaryAcademy, maxLevel: null }],
    extraCargo: { goods: [], settlers: 0, soldiers: shipped ? [{ amount: shipped, type: "archer" }] : [] },
    quests: [quest("q-archers", { trigger: { count: 10, kind: "soldierCount", soldierType: "archer" } }),
      quest("q-gift", { mapReward: { goods: [], soldiers: [{ amount: rewarded, type: "archer" }] } })]
  });
  assert.deepEqual(summary(validateCampaignMapReady(archers(0, 4), readyContext()).errors),
    ["untrainableSoldierType@quests[0].trigger"]);
  assert.equal(validateCampaignMapReady(archers(6, 4), readyContext()).ready, true);
  const total = readyMap({ quests: [quest("q-total", { trigger: { count: 50, kind: "soldierCount",
    soldierType: "total" } })], disabledBuildings: [{ buildingType: BuildingType.MilitaryAcademy, maxLevel: null }] });
  assert.equal(validateCampaignMapReady(total, readyContext()).ready, true);
});

test("translations, repeatable home rewards, weather vs season, supply, waves and reachability", () => {
  const map = readyMap({
    regions: [{ id: "region-sea", name: "Sea", shape: { kind: "rect", maxX: 5, maxZ: 5, minX: 0, minZ: 0 } },
      { id: "region-spawn", name: "Spawn", shape: { facing: 0, kind: "point", x: 1, z: 1 } }],
    name: { en: "", hu: "Név" },
    quests: [quest("q-repeat", {
      claimEffects: [{ kind: "weather", weather: "snow" }, { arrival: { mode: "instant", spawnRegionId: "region-spawn" },
        kind: "enemyWave", soldiers: [{ amount: 120, type: "heavy" }], targetRegionId: "region-sea" }],
      homeReward: { coins: 50, decorations: [], gems: 0, goods: [], xp: 0 }, repeat: "always",
      text: { en: "Again" }, trigger: { kind: "prerequisitesDone" } })],
    start: { hour: 6, season: "summer", weather: "snow" },
    supplyRequests: { maxRequests: 1, soldiers: [{ maxAmount: 600, type: "shield" }], wares: [] },
    victory: { kind: "totalVictory" }
  });
  const result = validateCampaignMapReady(map, readyContext({ isRegionReachable: region => region.id !== "region-sea" }));
  assert.deepEqual(summary(result.errors), [
    "missingFallbackText@name", "unreachableRegion@regions", "supplyAmountAboveShip@supplyRequests.soldiers",
    "prerequisitesTriggerWithoutPrerequisites@quests[0].trigger"
  ]);
  assert.deepEqual(summary(result.warnings), [
    "weatherSeasonMismatch@start.weather", "missingTranslation@quests[0].text",
    "weatherSeasonMismatch@quests[0].claimEffects[0].weather", "waveAboveEnemyCap@quests[0].claimEffects[1]",
    "repeatableHomeReward@quests[0].homeReward"
  ]);
});

test("issues format in English, Hungarian and German with their parameters", () => {
  const [issue] = validateCampaignMapReady(readyMap({ quests: [quest("q-a", { prerequisites: ["q-a"] })] }),
    readyContext()).errors;
  assert.ok(issue);
  assert.equal(formatCampaignIssue(issue, "en"), "Quest q-a is part of a circular prerequisite chain.");
  assert.equal(formatCampaignIssue(issue, "hu"), "A(z) q-a küldetés körkörös előfeltétel-láncban szerepel.");
  assert.equal(formatCampaignIssue(issue, "de"), "Quest q-a ist Teil einer zirkulären Voraussetzungskette.");
});

test("a Ready campaign lists existing Ready maps it owns once, with a sane availability window", () => {
  assert.equal(validateCampaignReady(readyCampaign(), [readyMap()]).ready, true);
  const campaign = readyCampaign({ availability: { from: 2000, until: 1000 },
    mapIds: ["map-1", "map-1", "map-gone", "map-foreign", "map-draft"] });
  const maps = [readyMap(), readyMap({ campaignId: "campaign-2", id: "map-foreign" }),
    readyMap({ id: "map-draft", state: "draft" })];
  assert.deepEqual(summary(validateCampaignReady(campaign, maps).errors), [
    "duplicateId@mapIds", "campaignMapMissing@mapIds[2]", "campaignMapNotOwned@mapIds[3]",
    "campaignMapNotReady@mapIds[4]", "availabilityWindowInvalid@availability"
  ]);
  assert.deepEqual(summary(validateCampaignReady(readyCampaign({ mapIds: [] }), []).errors),
    ["campaignHasNoMaps@mapIds"]);
});

test("the campaign map view needs an existing image and a node per listed map; u,v stay within 0–1", () => {
  assert.deepEqual(validateCampaignReady(readyCampaign(), [readyMap()], { imageIds: new Set(["image-1"]) }),
    { errors: [], ready: true, warnings: [] });
  const bare = validateCampaignReady(readyCampaign({ imageId: undefined, mapNodes: [] }), [readyMap()]);
  assert.equal(bare.ready, true);
  assert.deepEqual(summary(bare.warnings), ["campaignImageMissing@imageId", "campaignMapNodeMissing@mapNodes[0]"]);
  const deleted = validateCampaignReady(readyCampaign(), [readyMap()], { imageIds: new Set() });
  assert.deepEqual(summary(deleted.errors), ["campaignImageDeleted@imageId"]);
  const outside = checkCampaignShape(readyCampaign({ mapNodes: [{ mapId: "map-1", u: 1.2, v: -0.1 }] }));
  assert.deepEqual(outside.map(issue => issue.path), ["campaign.mapNodes[0].u", "campaign.mapNodes[0].v"]);
});
