import assert from "node:assert/strict";
import test from "node:test";

import { validateCampaignMapReady } from "../src/campaign/campaign-ready-validation.ts";
import {
  addRegion, deleteRegion, regionLibraryRows, regionReferences, regionUsers, renameRegion, reshapeRegion
} from "../src/campaign/campaign-region-library.ts";
import {
  createRegionCellCache, type MapRegion, rasterizeRegion, regionContains, validateRegions
} from "../src/campaign/campaign-regions.ts";
import { checkCampaignMapShape } from "../src/campaign/campaign-shape.ts";
import { quest, readyContext, readyMap } from "./campaign-fixtures.ts";
import { sequence, shot } from "./cinematic-fixtures.ts";

const SIZE = 128;
const region = (id: string, shape: MapRegion["shape"]): MapRegion => ({ id, name: id, shape });
const FIXTURE_REGIONS = [
  region("circle", { centerX: 40.3, centerZ: 77.8, kind: "circle", radius: 9.6 }),
  region("edge-circle", { centerX: 2, centerZ: 125, kind: "circle", radius: 6 }),
  region("rect", { kind: "rect", maxX: 90.5, maxZ: 31, minX: 70.2, minZ: 12 }),
  region("point", { facing: 1.25, kind: "point", x: 64.7, z: 3.2 })
];

test("rasterization matches regionContains for every cell of a 128² map, in ascending cell order", () => {
  for (const entry of FIXTURE_REGIONS) {
    const cells = rasterizeRegion(entry, SIZE, SIZE), expected: number[] = [];
    for (let z = 0; z < SIZE; z++)
      for (let x = 0; x < SIZE; x++) if (regionContains(entry, x + 0.5, z + 0.5)) expected.push(z * SIZE + x);
    assert.deepEqual(cells, expected, entry.id);
    assert.ok(cells.length > 0, entry.id);
  }
  assert.deepEqual(rasterizeRegion(FIXTURE_REGIONS[3]!, SIZE, SIZE), [3 * SIZE + 64]);
});

test("a point region keeps its facing and covers exactly its own cell", () => {
  const point = FIXTURE_REGIONS[3]!;
  assert.equal(point.shape.kind === "point" && point.shape.facing, 1.25);
  assert.equal(regionContains(point, 64.01, 3.99), true);
  assert.equal(regionContains(point, 65, 3.5), false);
});

test("the cell cache rasterizes once per region id and again after a reshape", () => {
  const cache = createRegionCellCache({ cellsX: SIZE, cellsZ: SIZE }), circle = FIXTURE_REGIONS[0]!;
  const first = cache.cells(circle);
  assert.equal(cache.cells({ ...circle }), first);
  const moved = { ...circle, shape: { ...circle.shape, radius: 2 } as MapRegion["shape"] };
  assert.notEqual(cache.cells(moved), first);
  assert.deepEqual(cache.cells(moved), rasterizeRegion(moved, SIZE, SIZE));
});

test("validateRegions: unique ids, finite numbers, radius > 0, min < max and inside the map", () => {
  const bounds = { cellsX: SIZE, cellsZ: SIZE };
  const inside = FIXTURE_REGIONS.filter(entry => entry.id !== "edge-circle");
  assert.deepEqual(validateRegions(inside, bounds), []);
  assert.equal(validateRegions(FIXTURE_REGIONS, bounds)[0]?.code, "regionOutOfBounds");
  const bad = [
    region("a", { centerX: 10, centerZ: 10, kind: "circle", radius: 0 }),
    region("a", { kind: "rect", maxX: 5, maxZ: 9, minX: 5, minZ: 1 }),
    region("b", { facing: Number.NaN, kind: "point", x: 1, z: 1 }),
    region("c", { centerX: 3, centerZ: 50, kind: "circle", radius: 4 }),
    region("d", { facing: 0, kind: "point", x: SIZE, z: 4 })
  ];
  assert.deepEqual(validateRegions(bad, bounds).map(issue => `${issue.code}@${issue.path}`), [
    "invalidRegionShape@regions[0].shape", "duplicateId@regions", "invalidRegionShape@regions[1].shape",
    "invalidRegionShape@regions[2].shape", "regionOutOfBounds@regions[3].shape", "regionOutOfBounds@regions[4].shape"
  ]);
  assert.deepEqual(validateRegions(bad.slice(3)).length, 0, "bounds are only checked when given");
});

const referencingMap = () => readyMap({
  cameraShots: [shot("shot-a"), shot("shot-b")],
  quests: [quest("q-gate", { claimEffects: [{ arrival: { landingRegionId: "region-3", mode: "ship" },
    kind: "enemyWave", soldiers: [{ amount: 3, type: "shield" }], targetRegionId: "region-1" }],
  trigger: { kind: "areaReached", regionId: "region-1", unitFilter: "any" } })],
  regions: [region("region-1", { centerX: 10, centerZ: 12, kind: "circle", radius: 4 }),
    region("region-2", { kind: "rect", maxX: 30, maxZ: 30, minX: 20, minZ: 20 }),
    region("region-3", { facing: 0, kind: "point", x: 5, z: 5 })],
  nextRegionNumber: 4,
  sequences: [sequence("intro")],
  victory: { kind: "holdArea", seconds: 300, target: { kind: "region", regionId: "region-2" } }
});

test("references list every region user in document order", () => {
  assert.deepEqual(regionReferences(referencingMap()).map(reference => `${reference.regionId}@${reference.path}`), [
    "region-2@victory.target.regionId",
    "region-1@quests[0].trigger.regionId",
    "region-3@quests[0].claimEffects[0].arrival.landingRegionId",
    "region-1@quests[0].claimEffects[0].targetRegionId",
    "region-1@sequences[0].steps[2].regionId",
    "region-1@sequences[0].steps[4].regionId"
  ]);
  assert.deepEqual(regionUsers(referencingMap(), "region-3").map(reference => reference.user),
    [{ kind: "quest", questId: "q-gate" }]);
});

test("deleting a referenced region is refused with its users; a free region is deleted", () => {
  const map = referencingMap();
  const refused = deleteRegion(map, "region-2");
  assert.deepEqual(refused, { deleted: false, users: [{ path: "victory.target.regionId", regionId: "region-2",
    user: { kind: "victory" } }] });
  const sequenceUse = deleteRegion(map, "region-1");
  assert.equal(sequenceUse.deleted, false);
  assert.ok(!sequenceUse.deleted && sequenceUse.users.some(reference => reference.user.kind === "sequence"));
  const freed = deleteRegion({ ...map, victory: { kind: "totalVictory" } }, "region-2");
  assert.ok(freed.deleted);
  assert.deepEqual(freed.map.regions.map(entry => entry.id), ["region-1", "region-3"]);
  assert.equal(deleteRegion(map, "region-unknown").deleted, true);
});

test("adding, renaming and reshaping keep ids stable and never reuse a deleted id", () => {
  const start = { ...referencingMap(), victory: { kind: "totalVictory" as const } };
  const { map: withDeleted } = deleteRegion(start, "region-2") as { deleted: true; map: typeof start };
  const added = addRegion(withDeleted, { name: "Ridge", shape: { facing: 2, kind: "point", x: 9, z: 9 } });
  assert.equal(added.region.id, "region-4");
  assert.equal(added.map.nextRegionNumber, 5);
  const imported = addRegion({ ...added.map, nextRegionNumber: 2 }, { name: "Bay",
    shape: { centerX: 50, centerZ: 50, kind: "circle", radius: 3 } });
  assert.equal(imported.region.id, "region-5", "an imported id above the counter is skipped");
  const renamed = renameRegion(added.map, "region-4", "North ridge");
  assert.equal(renamed.regions.at(-1)!.name, "North ridge");
  const reshaped = reshapeRegion(renamed, "region-4", { kind: "rect", maxX: 12, maxZ: 12, minX: 8, minZ: 8 });
  assert.deepEqual(reshaped.regions.at(-1), { id: "region-4", name: "North ridge",
    shape: { kind: "rect", maxX: 12, maxZ: 12, minX: 8, minZ: 8 } });
  assert.equal(renameRegion(reshaped, "region-unknown", "x"), reshaped);
  assert.equal(start.regions.length, 3, "operations never mutate their input");
});

test("the editor list shows each region with its colour, shape and users", () => {
  const rows = regionLibraryRows(referencingMap());
  assert.deepEqual(rows.map(row => [row.id, row.shapeKind, row.color, row.users.length]), [
    ["region-1", "circle", "#2f7cf6", 4], ["region-2", "rect", "#2f7cf6", 1], ["region-3", "point", "#2f7cf6", 1]
  ]);
});

test("regions survive a JSON round trip and Ready validates their references and bounds", () => {
  const map = referencingMap();
  const loaded = JSON.parse(JSON.stringify(map)) as typeof map;
  assert.deepEqual(checkCampaignMapShape(loaded), []);
  assert.deepEqual(loaded.regions, map.regions);
  const context = readyContext({ mapBounds: { cellsX: 64, cellsZ: 64 } });
  assert.deepEqual(validateCampaignMapReady(loaded, context).errors, []);
  const outside = validateCampaignMapReady(readyMap({ regions: [region("region-1",
    { centerX: 62, centerZ: 12, kind: "circle", radius: 4 })] }), context);
  assert.deepEqual(outside.errors.map(issue => issue.code), ["regionOutOfBounds"]);
});
