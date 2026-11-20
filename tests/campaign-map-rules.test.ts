import assert from "node:assert/strict";
import test from "node:test";

import { BuildingType } from "../src/building-types.ts";
import type { CampaignIssue } from "../src/campaign/campaign-issues.ts";
import type { CampaignVictoryRule } from "../src/campaign/campaign-model.ts";
import { validateCampaignMapReady } from "../src/campaign/campaign-ready-validation.ts";
import { campaignScenarioRules } from "../src/campaign/campaign-scenario-rules.ts";
import { quest, readyContext, readyMap } from "./campaign-fixtures.ts";

const codes = (issues: CampaignIssue[]) => issues.map(issue => `${issue.code}@${issue.path}`);
const LODGE = BuildingType.CommandersLodge;

test("scenario rules: lodgeAllowed alone decides the Lodge ban; caps and protected types never ban", () => {
  const disabledBuildings = [{ buildingType: BuildingType.Sawmill, maxLevel: null },
    { buildingType: BuildingType.Harbour, maxLevel: null }, { buildingType: BuildingType.Barracks, maxLevel: 2 },
    { buildingType: BuildingType.Guardhouse, maxLevel: null }, { buildingType: LODGE, maxLevel: null }];
  assert.deepEqual(campaignScenarioRules({ commanderAllowed: false, disabledBuildings, lodgeAllowed: false }), {
    commanderAllowed: false,
    disabledBuildings: [BuildingType.Guardhouse, BuildingType.Sawmill, LODGE].sort((a, b) => a - b)
  });
  assert.deepEqual(campaignScenarioRules({ commanderAllowed: true, disabledBuildings, lodgeAllowed: true }), {
    commanderAllowed: true,
    disabledBuildings: [BuildingType.Guardhouse, BuildingType.Sawmill].sort((a, b) => a - b)
  });
});

test("the Lodge never goes into the building list; a Lodge quest needs lodgeAllowed", () => {
  const listed = readyMap({ disabledBuildings: [{ buildingType: LODGE, maxLevel: null }] });
  assert.deepEqual(codes(validateCampaignMapReady(listed, readyContext()).errors),
    ["lodgeInBuildingList@disabledBuildings[0]"]);
  const lodgeQuest = (lodgeAllowed: boolean) => readyMap({ commanderAllowed: true, lodgeAllowed,
    quests: [quest("q-lodge", { trigger: { buildingType: LODGE, count: 1, kind: "buildingCompleted" } })] });
  assert.deepEqual(codes(validateCampaignMapReady(lodgeQuest(false), readyContext()).errors),
    ["blacklistedTriggerBuilding@quests[0].trigger"]);
  assert.equal(validateCampaignMapReady(lodgeQuest(true), readyContext()).ready, true);
});

test("a fighting victory needs shipped soldiers or a soldier type the map can train (item 38)", () => {
  const map = (victory: CampaignVictoryRule, shipped: number, academyBanned: boolean) =>
    readyMap({
      disabledBuildings: academyBanned ? [{ buildingType: BuildingType.MilitaryAcademy, maxLevel: null },
        { buildingType: BuildingType.Barracks, maxLevel: null }] : [],
      requiredCargo: { goods: [], settlers: 0, soldiers: shipped ? [{ amount: shipped, type: "shield" }] : [] },
      victory
    });
  assert.deepEqual(codes(validateCampaignMapReady(map({ kind: "totalVictory" }, 0, true), readyContext()).errors),
    ["noSoldierSource@victory"]);
  assert.equal(validateCampaignMapReady(map({ kind: "totalVictory" }, 4, true), readyContext()).ready, true);
  assert.equal(validateCampaignMapReady(map({ kind: "totalVictory" }, 0, false), readyContext()).ready, true);
  assert.equal(validateCampaignMapReady(map({ kind: "surviveTime", seconds: 600 }, 0, true), readyContext()).ready,
    true);
});
