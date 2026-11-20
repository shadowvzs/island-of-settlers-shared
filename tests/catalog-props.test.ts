import assert from "node:assert/strict";
import test from "node:test";

import {
  CORE_CATEGORIES, CORE_DATA_FILES, editorToolEntries, entriesOfKind, entryByKey, propEntryByCode, validateCatalog
} from "../src/catalog/index.ts";
import type { CatalogSource, ContentKind } from "../src/catalog/index.ts";

const codesWith = (kind: ContentKind, entry: unknown) => {
  const raw = structuredClone({ categories: CORE_CATEGORIES, files: CORE_DATA_FILES }) as CatalogSource;
  return validateCatalog({ ...raw, files: [...raw.files, { entries: [entry], file: "t.json", kind }] })
    .map(issue => issue.code);
};

test("ground props and deposits keep their persisted bytes and editor tool order", () => {
  assert.equal(propEntryByCode(0)?.id, "tree:broadleafTree");
  assert.equal(propEntryByCode(37)?.id, "shell:seaStar");
  assert.equal(propEntryByCode(255), undefined);
  assert.deepEqual(editorToolEntries("ore").map(entry => entry.code), [1, 2, 3, 4]);
  assert.deepEqual(editorToolEntries("doodad").map(entry => entry.key), ["smallRock", "largeRock", "pebbles"]);
  assert.equal(editorToolEntries("tree")[0]?.key, "hardwoodTree");
  assert.deepEqual(entriesOfKind("shell").map(entry => entry.key),
    ["seashell", "snailShell", "seaStar", "seaSnailShell", "openShell"]);
});

test("the validator refuses ground props without a byte and malformed editor choices", () => {
  const rock = { ...structuredClone(entryByKey("stone", "smallRock")), id: "stone:test", key: "test", code: 99 };
  assert.deepEqual(codesWith("stone", rock), []);
  assert.ok(codesWith("stone", { ...rock, code: undefined }).includes("payload"));
  assert.ok(codesWith("stone", { ...rock, prop: { layer: "sky" } }).includes("payload"));
  assert.ok(codesWith("stone", { ...rock, prop: { editor: { order: 0, tool: "brush" }, layer: "worldProp" } })
    .includes("payload"));
  assert.ok(codesWith("stone", { ...rock, code: 4 }).includes("duplicateCode"));
  const ore = { ...structuredClone(entryByKey("deposit", "coalOre")), id: "deposit:test", key: "test", code: 9 };
  assert.ok(codesWith("deposit", { ...ore, code: undefined }).includes("payload"));
});

test("wildlife keeps its persisted species indexes, families and gameplay data", () => {
  assert.deepEqual(entriesOfKind("animal").map(entry => [entry.key, entry.code, entry.family]),
    [["rabbit", 0, "animal.rabbit"], ["deer", 1, "animal.deer"], ["elk", 2, "animal.deer"]]);
  assert.deepEqual(entriesOfKind("animal").map(entry => [entry.life.adultMeat, entry.life.growthMinutes]),
    [[1, 12], [18, 22], [40, 30]]);
  assert.deepEqual(editorToolEntries("animal").map(entry => entry.key), ["deer", "elk", "rabbit"]);
  assert.deepEqual(entriesOfKind("critter").filter(entry => entry.tags.includes("huntable")).map(entry => entry.key),
    ["boar", "chamois"]);
  const deer = { ...structuredClone(entryByKey("animal", "deer")), id: "animal:test", key: "test", code: 9 };
  assert.deepEqual(codesWith("animal", deer), []);
  assert.ok(codesWith("animal", { ...deer, life: { domain: "dream" } }).includes("payload"));
  assert.ok(codesWith("animal", { ...deer, life: { ...deer.life, speed: 3 } }).includes("payload"));
});
