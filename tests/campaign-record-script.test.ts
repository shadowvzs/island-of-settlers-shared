import assert from "node:assert/strict";
import { test } from "node:test";

import { BuildingType } from "../src/building-types.ts";
import { campaignRecordScript, hasRecordScript } from "../src/campaign/campaign-record-script.ts";
import { mapScriptHash } from "../src/script/hash.ts";
import { validateMapScript } from "../src/script/validate.ts";
import { quest, readyMap } from "./campaign-fixtures.ts";
import { sequence } from "./cinematic-fixtures.ts";
import { TEST_CATALOG } from "./script-fixtures.ts";

/** TRG1 campaign storage move: C1 record quests, regions, sequences and shots → the map file's script. */

const richMap = () => readyMap({
  quests: [
    ...readyMap().quests,
    quest("q-build", {
      claimEffects: [
        { available: true, buildingType: BuildingType.Barracks, kind: "buildingAvailability" },
        { kind: "weather", weather: "rain" },
        { arrival: { landingRegionId: "region-1", mode: "ship" }, kind: "enemyWave",
          soldiers: [{ amount: 4, type: "archer" }], targetRegionId: "region-1" }
      ],
      completeSequenceId: "seq-1",
      hidden: true,
      homeReward: { coins: 50, decorations: [], gems: 1, goods: [{ amount: 3, ware: "planks" }], xp: 10 },
      mapReward: { goods: [{ amount: 5, ware: "stone" }], soldiers: [{ amount: 2, type: "shield" }] },
      repeat: "afterFail",
      timeLimitSeconds: 600,
      trigger: { buildingType: BuildingType.Barracks, count: 2, kind: "buildingCompleted" }
    }),
    quest("q-army", { trigger: { count: 10, kind: "soldierCount", soldierType: "total" } }),
    quest("q-stock", { repeat: "always", trigger: { amount: 30, kind: "stockLevel", ware: "planks" } })
  ],
  sequences: [sequence("seq-1", { steps: [] })]
});

test("a campaign record converts into a Ready map script with catalog refs and actions", () => {
  const script = campaignRecordScript(richMap());
  const result = validateMapScript(script, { catalog: TEST_CATALOG, mapKind: "campaign" });
  assert.deepEqual(result.errors, []);
  const built = script.quests.quests.find(item => item.id === "q-build")!;
  assert.deepEqual(built.objective, { building: { id: "building:barracks", k: "ref", kind: "content" }, count: 2,
    kind: "buildingCompleted" });
  assert.deepEqual(built.onSuccess.map(step => step.k === "do" && step.op),
    ["buildingAvailability", "setWeather", "enemyWave"]);
  assert.equal(built.visibility, "hidden");
  assert.deepEqual(built.deadline, { kind: "playTime", seconds: 600 });
  assert.deepEqual(built.repeat, { kind: "once", retryAfterFail: true });
  assert.equal(script.quests.quests.find(item => item.id === "q-army")!.objective.kind, "soldierCount");
  assert.deepEqual(script.regions, richMap().regions);
  assert.equal(script.nextIds.region, 2);
});

test("the conversion is deterministic and independent of the record object", () => {
  const map = richMap();
  const script = campaignRecordScript(map);
  assert.equal(mapScriptHash(campaignRecordScript(richMap())), mapScriptHash(script));
  script.regions[0]!.name = "changed";
  assert.equal(map.regions[0]!.name, "Gate");
});

test("records without quests, regions or cinematics have no script content", () => {
  assert.equal(hasRecordScript(readyMap({ quests: [], regions: [] })), false);
  assert.equal(hasRecordScript(readyMap()), true);
});
