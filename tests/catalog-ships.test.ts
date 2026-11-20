import assert from "node:assert/strict";
import test from "node:test";

import {
  CORE_CATEGORIES, CORE_DATA_FILES, entriesOfKind, shipEntry, shipHull, validateCatalog
} from "../src/catalog/index.ts";
import type { CatalogSource, ContentKind } from "../src/catalog/index.ts";
import { NATIONS } from "../src/nations.ts";

const codesWith = (kind: ContentKind, entry: unknown) => {
  const raw = structuredClone({ categories: CORE_CATEGORIES, files: CORE_DATA_FILES }) as CatalogSource;
  return validateCatalog({ ...raw, files: [...raw.files, { entries: [entry], file: "t.json", kind }] })
    .map(issue => issue.code);
};

test("ships and boats keep their hull contracts; raiders sail the sailing ship's hull", () => {
  assert.deepEqual(entriesOfKind("ship").map(entry => entry.key), ["sailingShip", "raider"]);
  assert.deepEqual(entriesOfKind("boat").map(entry => entry.key), ["fishingSkiff", "lighter"]);
  assert.equal(shipHull("ship", "raider"), shipHull("ship", "sailingShip"));
  assert.equal(shipHull("boat", "lighter")?.oar?.length, 1.45);
  assert.deepEqual(Object.keys(shipEntry("ship", "sailingShip")!.ship.nationIcons!), [...NATIONS]);
});

test("the validator refuses a ship without exactly one hull source", () => {
  const ship = { ...structuredClone(shipEntry("ship", "raider")), id: "ship:test", key: "test" };
  assert.deepEqual(codesWith("ship", ship), []);
  assert.ok(codesWith("ship", { ...ship, ship: { liveries: ["enemy"] } }).includes("payload"));
  assert.ok(codesWith("ship", { ...ship, ship: { ...ship.ship, hullOf: "ship:ghost" } }).includes("reference"));
  assert.ok(codesWith("ship", { ...ship, ship: { ...ship.ship, liveries: ["pink"] } }).includes("payload"));
});
