import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { BuildingType } from "../src/building-types.ts";
import { buildingConstruction } from "../src/catalog/building-data/construction.ts";
import { unifiedConstructionCost } from "../src/catalog/building-data/construction-formula.ts";
import { buildingRoleText, buildingRules, buildingsWithRules } from "../src/catalog/building-data/rules.ts";
import {
  banditByMilitaryBuilding, banditEntries, banditEntry, banditMilitaryBuildingCode, buildingByKey,
  buildingEntries, buildingEntry, catalogEntries, categoriesOfKind, CORE_CATEGORIES, CORE_DATA_FILES, entryByKey,
  isBanditSiteRef, validateBuildingSidecars, validateCatalog
} from "../src/catalog/index.ts";
import type { CatalogSource } from "../src/catalog/index.ts";

const codesWith = (entry: unknown) => {
  const raw = structuredClone({ categories: CORE_CATEGORIES, files: CORE_DATA_FILES }) as CatalogSource;
  return validateCatalog({ ...raw, files: [...raw.files, { entries: [entry], file: "t.json", kind: "building" }] })
    .map(issue => issue.code);
};

test("BuildingType equals the active building codes; retired codes stay reserved", () => {
  const active = Object.fromEntries(buildingEntries().map(entry => [entry.code, entry.key]));
  assert.deepEqual(Object.values(BuildingType).sort((first, second) => first - second),
    Object.keys(active).map(Number));
  for (const [name, code] of Object.entries(BuildingType))
    assert.equal(active[code]?.toLowerCase(), name.toLowerCase(), name);
  const retired = catalogEntries().filter(entry => entry.kind === "building" && entry.retired).map(entry => entry.code);
  assert.deepEqual(retired.sort((first, second) => (first ?? 0) - (second ?? 0)), [30, 38, 44, 48, 52, 56, 63]);
});

test("buildings sit in the building panel tabs; only the headquarters is not placeable", () => {
  assert.deepEqual(categoriesOfKind("building").map(category => category.id), ["building.materials",
    "building.settlement", "building.foodDrink", "building.industry", "building.mines", "building.military"]);
  assert.deepEqual(buildingEntries().filter(entry => !entry.building.placeable).map(entry => entry.key),
    ["headquarters"]);
  assert.equal(buildingEntry(5)?.text.variants?.viking?.en, "Apiary");
  assert.equal(buildingByKey("stable"), undefined);
  assert.equal(buildingEntry(38)?.key, "retired38");
  assert.equal(buildingEntry(42)?.family, "building.production.woodcutter");
});

test("the validator refuses buildings without a code or with a placeable retired stub", () => {
  const entry = { ...structuredClone(buildingEntry(17)), code: 99, id: "building:test", key: "test" };
  assert.deepEqual(codesWith(entry), []);
  assert.ok(codesWith({ ...entry, code: undefined }).includes("payload"));
  assert.ok(codesWith({ ...entry, retired: true }).includes("payload"));
  assert.ok(codesWith({ ...entry, code: 17 }).includes("duplicateCode"));
  assert.ok(codesWith({ ...entry, text: { ...entry.text, variants: { atlantis: entry.text!.name } } })
    .includes("reference"));
});

const SIDECAR_FOLDER = new URL("../src/catalog/data/", import.meta.url);
const readSidecar = (path: string): unknown => JSON.parse(readFileSync(new URL(path, SIDECAR_FOLDER), "utf8"));
const sidecarIssues = (override: (path: string, data: unknown) => unknown) =>
  validateBuildingSidecars(CORE_DATA_FILES, path => override(path, structuredClone(readSidecar(path))));

test("every active building has valid rules and construction sidecars; retired stubs have none", () => {
  assert.deepEqual(validateBuildingSidecars(CORE_DATA_FILES, readSidecar), []);
  for (const entry of buildingEntries()) {
    assert.equal(buildingRules(entry.code)?.unlockLevel !== undefined, true, entry.key);
    assert.ok(buildingConstruction(entry.code)?.cost, entry.key);
  }
  for (const code of [30, 38, 63]) assert.equal(buildingRules(code), undefined);
  assert.equal(buildingRules(17)?.production?.job, "settler:woodcutter");
  assert.equal(buildingRules(36)?.production?.modes?.ships?.builds, "ship:sailingShip");
});

test("the building sidecar validator refuses unknown references and default costs that break the unified rule", () => {
  const codes = (target: string, edit: (data: Record<string, unknown>) => void) => sidecarIssues((path, data) => {
    if (path === target) edit(data as Record<string, unknown>);
    return data;
  }).map(issue => issue.code);
  assert.ok(codes("buildings/woodcutter/rules.json", data => {
    (data.production as { job: string }).job = "settler:nobody";
  }).includes("reference"));
  // A default entry (no authored nation receipts) must follow the unified rule and keep its measured inputs.
  assert.ok(codes("buildings/woodcutter/construction.json", data => {
    delete data.nations;
    (data.cost as { planks: number }).planks += 1;
  }).includes("payload"));
  assert.ok(codes("buildings/woodcutter/construction.json", data => {
    delete data.nations;
    delete data.inputs;
  }).includes("payload"));
  assert.ok(codes("buildings/woodcutter/construction.json", data => {
    (data.nations as Record<string, Record<string, number>>).roman!.unknownWare = 1;
  }).includes("reference"));
  assert.ok(codes("buildings/woodcutter/rules.json", data => { data.unknownField = 1; }).includes("payload"));
});

test("building role texts are translatable { key, en } texts, nation overrides included", () => {
  const issues = (target: string, edit: (data: Record<string, unknown>) => void) => sidecarIssues((path, data) => {
    if (path === target) edit(data as Record<string, unknown>);
    return data;
  });
  assert.equal(issues("buildings/sawmill/rules.json", data => { data.role = "Saws logs into boards"; }).length, 1);
  assert.equal(issues("buildings/sawmill/rules.json", data => {
    data.role = { en: "Saws logs into boards", key: "not a lingui id" };
  }).length, 1);
  assert.equal(issues("buildings/winery/rules.json", data => {
    (data.nations as Record<string, Record<string, unknown>>).viking!.role = "Brews honey into mead";
  }).length, 1);
  for (const { entry, rules } of buildingsWithRules()) {
    assert.match(rules.role.key, /^content\.building\.[A-Za-z]+\.role$/, entry.key);
    assert.equal(buildingRoleText(entry.code), rules.role);
    for (const [nation, variant] of Object.entries(rules.nations ?? {}))
      assert.equal(buildingRoleText(entry.code, nation), variant.role ?? rules.role, `${entry.key}.${nation}`);
  }
  assert.equal(buildingRoleText(30), undefined);
});

test("the unified construction rule scales with footprint, height and triangles", () => {
  const small = unifiedConstructionCost({ cells: [2, 2], height: 1, triangles: 1000 });
  const large = unifiedConstructionCost({ cells: [6, 6], height: 6, triangles: 12000 });
  assert.deepEqual(small, { planks: 1, stone: 1 });
  assert.ok(large.planks + large.stone > small.planks + small.stone);
  assert.ok(large.stone >= 1 && large.planks >= large.stone);
});

test("bandit sites are their own kind with own codes; saves store the bandit code and layout index", () => {
  assert.deepEqual(banditEntries().map(entry => [entry.code, entry.key, entry.bandit.militaryBuilding]), [
    [0, "raiderHideout", "building:guardhouse"], [1, "banditEncampment", "building:watchtower"],
    [2, "outlawStronghold", "building:fortress"]]);
  assert.deepEqual([0, 1, 2, 3].map(banditMilitaryBuildingCode), [2, 4, 9, undefined]);
  assert.equal(banditEntry(1)?.bandit.models[0]?.kind, "tower");
  assert.equal(banditEntry(1)?.text.variants?.tower?.key, "domain.bandit.archerScaffold");
  assert.equal(banditEntry(17), undefined);
  assert.equal(banditByMilitaryBuilding(4)?.id, "bandit:banditEncampment");
  assert.equal(banditByMilitaryBuilding(17), undefined);
  assert.ok(isBanditSiteRef({ code: 2, layout: 2 }));
  for (const invalid of [{ code: 3, layout: 0 }, { code: 0, layout: 3 }, { code: 0 }, { code: 0, layout: 0, type: 2 }])
    assert.equal(isBanditSiteRef(invalid), false);
  const site = structuredClone(banditEntry(0)!) as unknown as Record<string, unknown>;
  const raw = structuredClone({ categories: CORE_CATEGORIES, files: CORE_DATA_FILES }) as CatalogSource;
  const issues = (entry: unknown) => validateCatalog({ ...raw, files: [...raw.files,
    { entries: [entry], file: "t.json", kind: "bandit" }] }).map(issue => issue.code);
  const candidate = { ...site, code: 9, id: "bandit:test", key: "test" };
  assert.ok(issues({ ...candidate, text: { name: (site.text as { name: unknown }).name } }).includes("payload"));
  assert.ok(issues({ ...candidate, bandit: { ...site.bandit as object, tier: "Easy" } }).includes("payload"));
  assert.ok(issues({ ...candidate, bandit: { ...site.bandit as object, militaryBuilding: "building:none" } }).length > 0);
  assert.deepEqual(issues(candidate), []);
});

test("the shipyard builds the sailing ship and the lighter boats", () => {
  assert.equal(entryByKey("ship", "sailingShip")?.ship.builtBy, "building:shipyard");
  assert.equal(entryByKey("boat", "lighter")?.ship.builtBy, "building:shipyard");
});
