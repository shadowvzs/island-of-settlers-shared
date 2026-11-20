import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { CATALOG_DATA_FOLDER } from "../server/catalog-check.ts";
import { CORE_DATA_FILES, TUNING_SIDECAR_RULES, validateTuningSidecars } from "../src/catalog/index.ts";
import type { CatalogDataFile } from "../src/catalog/validate/index.ts";
import { BIRD_TUNING } from "../src/catalog/tuning/birds.ts";
import { BUTTERFLY_TUNING } from "../src/catalog/tuning/butterflies.ts";
import { FISH_TUNING } from "../src/catalog/tuning/fish.ts";
import { ROAD_PLANT_TUNING } from "../src/catalog/tuning/plants.ts";
import { WHALE_TUNING } from "../src/catalog/tuning/whales.ts";
import { WILDLIFE_PROFILE_TUNING } from "../src/catalog/tuning/wildlife.ts";

const readSidecar = (path: string): unknown => JSON.parse(readFileSync(join(CATALOG_DATA_FOLDER, path), "utf8"));
const issueCodes = (files: readonly CatalogDataFile[], read: (path: string) => unknown = readSidecar) =>
  validateTuningSidecars(files, read).map(issue => `${issue.code} ${issue.path}`);
const withSidecar = (path: string, edit: (data: Record<string, any>) => void) => (requested: string) => {
  const data = readSidecar(requested) as Record<string, any>;
  if (requested === path) edit(data);
  return data;
};

test("every tuning sidecar is valid and its accessor module serves the same data", () => {
  assert.deepEqual(issueCodes(CORE_DATA_FILES), []);
  const accessors: Record<string, unknown> = {
    "tuning/models/birds.json": BIRD_TUNING,
    "tuning/models/butterflies.json": BUTTERFLY_TUNING,
    "tuning/models/fish.json": FISH_TUNING,
    "tuning/models/plants.json": ROAD_PLANT_TUNING,
    "tuning/models/whales.json": WHALE_TUNING,
    "tuning/wildlife-profiles.json": WILDLIFE_PROFILE_TUNING
  };
  assert.deepEqual(TUNING_SIDECAR_RULES.map(rule => rule.path).sort(), Object.keys(accessors).sort());
  for (const [path, accessor] of Object.entries(accessors)) {
    assert.deepEqual(accessor, readSidecar(path), path);
    assert.ok(Object.isFrozen(accessor), path);
  }
});

test("the tuning validator refuses missing, orphan and malformed records", () => {
  const birds = "tuning/models/birds.json";
  assert.ok(issueCodes(CORE_DATA_FILES, withSidecar(birds, data => { delete data.ashRook; }))
    .includes(`sidecar ${birds}.ashRook`));
  assert.ok(issueCodes(CORE_DATA_FILES, withSidecar(birds, data => { data.dodo = data.ashRook; }))
    .includes(`sidecar ${birds}.dodo`));
  assert.ok(issueCodes(CORE_DATA_FILES, withSidecar(birds, data => { data.ashRook.shape.colors.cap = [2, 0, 0]; }))
    .includes(`payload ${birds}.ashRook.shape`));
  assert.ok(issueCodes(CORE_DATA_FILES, withSidecar(birds, data => { data.ashRook.wingspan = 1; }))
    .includes(`payload ${birds}.ashRook.wingspan`));
  const wildlife = "tuning/wildlife-profiles.json";
  assert.ok(issueCodes(CORE_DATA_FILES, withSidecar(wildlife, data => { data.elk.maxSlopeDegrees = 90; }))
    .includes(`payload ${wildlife}.elk.maxSlopeDegrees`));
  const plants = "tuning/models/plants.json";
  assert.ok(issueCodes(CORE_DATA_FILES, withSidecar(plants, data => { data.azalea.form = "vine"; }))
    .includes(`payload ${plants}.azalea.form`));
});

test("an owning entry must reference its tuning sidecar", () => {
  const files = structuredClone(CORE_DATA_FILES) as CatalogDataFile[];
  const fish = files.find(file => file.kind === "fish")!.entries as { sidecars?: unknown }[];
  delete fish[0]!.sidecars;
  assert.ok(issueCodes(files).includes("sidecar fish.json[0].sidecars.tuning"));
});
