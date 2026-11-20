import assert from "node:assert/strict";
import test from "node:test";

import { BuildingType } from "../src/building-types.ts";
import { DEFAULT_MAX_ENEMY_SOLDIERS } from "../src/campaign/campaign-constants.ts";
import { createCampaign, createCampaignMap } from "../src/campaign/campaign-model.ts";
import {
  createCampaignStatistics, recordCampaignAttempt, snapshotCampaignMap
} from "../src/campaign/campaign-records.ts";
import {
  checkCampaignImageShape, checkCampaignMapShape, checkCampaignShape, checkCampaignStatisticsShape
} from "../src/campaign/campaign-shape.ts";
import { missingTranslations, resolveTranslatableText } from "../src/campaign/campaign-text.ts";
import { quest, readyMap } from "./campaign-fixtures.ts";

const paths = (issues: { path: string }[]) => issues.map(issue => issue.path);

test("new campaigns and maps are valid drafts with the owner defaults", () => {
  const map = createCampaignMap("map-1", "campaign-1", { hash: null, id: "slot" });
  assert.deepEqual(checkCampaignMapShape(map), []);
  assert.deepEqual(checkCampaignShape(createCampaign("campaign-1")), []);
  assert.equal(map.state, "draft");
  assert.equal(map.maxEnemySoldiers, DEFAULT_MAX_ENEMY_SOLDIERS);
  assert.equal(map.upgradesAllowed, false);
  assert.equal(map.commanderAllowed, false);
  assert.equal(map.lodgeAllowed, false);
  assert.deepEqual(checkCampaignStatisticsShape(createCampaignStatistics("campaign-1", "map-1", null)), []);
});

test("shape checks reject unknown keys, unknown union kinds and out-of-range values with their paths", () => {
  const map = readyMap({
    disabledBuildings: [{ buildingType: BuildingType.Sawmill, maxLevel: 0 }],
    quests: [quest("q-1", { trigger: { kind: "teleport" } as never }),
      quest("q-2", { claimEffects: [{ arrival: { mode: "ship", spawnRegionId: "region-1" }, kind: "enemyWave",
        soldiers: [], targetRegionId: "region-1" } as never] })],
    regions: [{ id: "region-1", name: "Bay", shape: { kind: "point", x: 1, z: 1 } as never }]
  });
  assert.deepEqual(paths(checkCampaignMapShape({ ...map, extra: true })), [
    "map.extra", "map.disabledBuildings[0].maxLevel", "map.quests[0].trigger.kind",
    "map.quests[1].claimEffects[0].arrival.spawnRegionId", "map.quests[1].claimEffects[0].arrival.landingRegionId",
    "map.regions[0].shape.facing"
  ]);
  assert.deepEqual(paths(checkCampaignShape({ ...createCampaign("bad id!"), name: { hu: "x" } })),
    ["campaign.id", "campaign.name"]);
  const image = { bytes: new Uint8Array(400 * 1024), campaignId: "c", height: 2048, id: "i", mimeType: "image/png",
    revision: 0, updatedAt: 0, width: 10 };
  assert.deepEqual(paths(checkCampaignImageShape(image)), ["image.bytes", "image.height", "image.mimeType"]);
});

test("map rewards hold ranked soldiers and settlers; old maps without them stay valid", () => {
  const map = readyMap();
  assert.deepEqual(checkCampaignMapShape(map), []);
  const rewards = { ...map.rewards, settlers: 4, soldiers: [{ amount: 3, type: "archer" }, { amount: 1, rank: 2,
    type: "heavy" }] };
  assert.deepEqual(checkCampaignMapShape({ ...map, rewards }), []);
  const recruits = { ...rewards, soldiers: [{ amount: 2, rank: 0, type: "shield" }, { amount: 1, type: "heavy" }] };
  assert.deepEqual(checkCampaignMapShape({ ...map, rewards: recruits }), [], "rank 0 is the recruit");
  assert.deepEqual(paths(checkCampaignMapShape({ ...map, rewards: { ...rewards, soldiers: [{ amount: 1, rank: -1,
    type: "heavy" }, { amount: 1, rank: 0.5, type: "heavy" }] } })),
  ["map.rewards.soldiers[0].rank", "map.rewards.soldiers[1].rank"]);
  const bad = { ...rewards, settlers: -1, soldiers: [{ amount: 1, rank: 3, type: "heavy" }] };
  assert.deepEqual(paths(checkCampaignMapShape({ ...map, rewards: bad })),
    ["map.rewards.settlers", "map.rewards.soldiers[0].rank"]);
  assert.deepEqual(paths(checkCampaignShape({ ...createCampaign("c-1"), rewards })),
    ["campaign.rewards.settlers", "campaign.rewards.soldiers"]);
});

test("translatable text falls back to English and lists missing languages", () => {
  const text = { de: " ", en: "Harbour", hu: "Kikötő" };
  assert.equal(resolveTranslatableText(text, "hu"), "Kikötő");
  assert.equal(resolveTranslatableText(text, "de"), "Harbour");
  assert.equal(resolveTranslatableText(text, "fr"), "Harbour");
  assert.deepEqual(missingTranslations(text, ["en", "hu", "de", "fr"]), ["de", "fr"]);
});

test("statistics count attempts, outcomes, quest results and completion times", () => {
  let statistics = createCampaignStatistics("campaign-1", "map-1", "account-1");
  statistics = recordCampaignAttempt(statistics,
    { completedQuestIds: ["a"], durationSeconds: 300, failedQuestIds: ["b"], outcome: "defeat" });
  statistics = recordCampaignAttempt(statistics,
    { completedQuestIds: ["a", "b"], durationSeconds: 900, failedQuestIds: [], outcome: "victory" });
  statistics = recordCampaignAttempt(statistics,
    { completedQuestIds: [], durationSeconds: 600, failedQuestIds: [], outcome: "victory" });
  statistics = recordCampaignAttempt(statistics,
    { completedQuestIds: [], durationSeconds: 50, failedQuestIds: ["b"], outcome: "givenUp" });
  assert.equal(statistics.id, "account-1:map-1");
  assert.deepEqual([statistics.attempts, statistics.victories, statistics.defeats, statistics.givenUp], [4, 2, 1, 1]);
  assert.equal(statistics.bestCompletionSeconds, 600);
  assert.equal(statistics.totalCompletionSeconds, 1500);
  assert.deepEqual(statistics.questCompletions, { a: 2, b: 1 });
  assert.deepEqual(statistics.questFailures, { b: 2 });
});

test("a run snapshot is a frozen deep clone that later admin edits never reach", () => {
  const map = readyMap();
  const snapshot = snapshotCampaignMap(map, 1234);
  map.quests[0]!.title = { en: "Edited after the start" };
  map.maxEnemySoldiers = 5;
  assert.equal(snapshot.map.quests[0]!.title.en, "Title q-intro");
  assert.equal(snapshot.map.maxEnemySoldiers, 100);
  assert.equal(snapshot.mapRevision, map.revision);
  assert.ok(Object.isFrozen(snapshot.map.quests[0]!.trigger));
  assert.throws(() => snapshotCampaignMap(readyMap({ state: "draft" }), 1), /not Ready/);
  assert.equal(snapshotCampaignMap(readyMap({ state: "draft" }), 1, { allowDraft: true }).clonedAt, 1);
});
