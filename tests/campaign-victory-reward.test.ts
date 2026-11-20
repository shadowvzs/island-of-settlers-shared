import assert from "node:assert/strict";
import test from "node:test";

import {
  campaignVictoryKind, campaignVictoryPayout, campaignVictoryRef, isEmptyVictoryPayout, victoryDayKey
} from "../src/campaign/campaign-victory-reward.ts";
import type { CampaignMapRewards } from "../src/campaign/campaign-model.ts";

const REWARDS: CampaignMapRewards = {
  coins: 10, decorations: [{ amount: 2, item: "flowerPot" }], gems: 5,
  goods: [{ amount: 7, ware: "planks" }, { amount: 2, ware: "planks" }, { amount: 1, ware: "stone" }],
  settlers: 3, soldiers: [{ amount: 2, rank: 1, type: "archer" }, { amount: 0, type: "heavy" }], xp: 100
};

test("first completion pays the whole table, duplicate ware lines merged, empty lines dropped", () => {
  assert.deepEqual(campaignVictoryPayout(REWARDS, "first"), {
    coins: 10, decorations: { flowerPot: 2 }, gems: 5, goods: { planks: 9, stone: 1 }, settlers: 3,
    soldiers: [{ amount: 2, rank: 1, type: "archer" }], xp: 100
  });
});

test("recruit soldier lines (rank 0 or no rank) are paid like any rank on a first completion", () => {
  const rewards = { ...REWARDS, soldiers: [{ amount: 2, rank: 0, type: "shield" as const },
    { amount: 1, type: "heavy" as const }] };
  assert.deepEqual(campaignVictoryPayout(rewards, "first").soldiers,
    [{ amount: 2, rank: 0, type: "shield" }, { amount: 1, type: "heavy" }]);
  assert.equal(isEmptyVictoryPayout({ ...campaignVictoryPayout(REWARDS, "capped"),
    soldiers: [{ amount: 1, rank: 0, type: "shield" }] }), false);
});

test("a replay pays one third of the numbers and no decorations, soldiers or settlers", () => {
  assert.deepEqual(campaignVictoryPayout(REWARDS, "replay"),
    { coins: 3, decorations: {}, gems: 2, goods: { planks: 3 }, settlers: 0, soldiers: [], xp: 33 });
});

test("a capped replay pays nothing", () => {
  assert.equal(isEmptyVictoryPayout(campaignVictoryPayout(REWARDS, "capped")), true);
  assert.equal(isEmptyVictoryPayout(campaignVictoryPayout(REWARDS, "first")), false);
});

test("kind and refs: one first reward per map, one replay reward per map and UTC day", () => {
  assert.equal(campaignVictoryKind(false, true), "first");
  assert.equal(campaignVictoryKind(true, false), "replay");
  assert.equal(campaignVictoryKind(true, true), "capped");
  const day = victoryDayKey(Date.UTC(2026, 10, 11, 23, 59));
  assert.equal(day, "2026-11-11");
  assert.equal(campaignVictoryRef("map-1", "first", day), "cv:map-1");
  assert.equal(campaignVictoryRef("map-1", "replay", day), "cv:map-1:2026-11-11");
});
