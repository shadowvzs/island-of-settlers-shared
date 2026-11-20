import assert from "node:assert/strict";
import test from "node:test";

import {
  buildingEntries, buildingEntry, type CatalogSource, CORE_CATEGORIES, CORE_DATA_FILES, entryByKey, entryTokenValues,
  modelRecipeId, modelRecipeIds, validateCatalog
} from "../src/catalog/index.ts";

const issuesWith = (entry: unknown) => {
  const raw = structuredClone({ categories: CORE_CATEGORIES, files: CORE_DATA_FILES }) as CatalogSource;
  return validateCatalog({ ...raw, files: [...raw.files, { entries: [entry], file: "t.json", kind: "building" }] })
    .map(issue => issue.code);
};

test("every active building names its model recipe per nation and level; retired stubs have none", () => {
  for (const entry of buildingEntries()) {
    const level = entry.variants?.level ? ".level{level}" : "";
    assert.deepEqual(entry.model, { kind: "recipe", recipe: `recipe:building.${entry.key}.{nation}${level}` });
  }
  assert.equal(buildingEntry(30)?.model, undefined);
  assert.equal(modelRecipeIds(buildingEntry(17)!).length, 8 * 5);
  assert.deepEqual(modelRecipeIds(buildingEntry(7)!).slice(0, 2),
    ["recipe:building.monument.roman", "recipe:building.monument.viking"]);
  assert.equal(modelRecipeId(buildingEntry(31)!, { level: 3, nation: "maya" }), "recipe:building.mill.maya.level3");
});

test("token values cover every declared axis value; templates without a token expand to one id", () => {
  const arch = entryByKey("decoration", "roman-rusticated-arch")!;
  assert.deepEqual(entryTokenValues(arch).map(values => values.finish), ["limestone", "granite", "marble"]);
  assert.deepEqual(modelRecipeIds(arch), ["recipe:decoration.roman-rusticated-arch"]);
  assert.deepEqual(modelRecipeIds(entryByKey("animal", "deer")!), []);
});

test("ships, boats and whales name their code-built hull or body", () => {
  assert.deepEqual(modelRecipeIds(entryByKey("ship", "raider")!), ["recipe:ship.raider"]);
  assert.equal(modelRecipeIds(entryByKey("ship", "sailingShip")!).length, 8);
  assert.equal(modelRecipeId(entryByKey("ship", "sailingShip")!, { nation: "viking" }),
    "recipe:ship.sailingShip.viking");
  assert.equal(modelRecipeId(entryByKey("boat", "fishingSkiff")!, { nation: "maya" }), "recipe:boat.fishingSkiff.maya");
  assert.equal(modelRecipeIds(entryByKey("boat", "lighter")!).length, 8);
  assert.deepEqual(modelRecipeIds(entryByKey("whale", "orca")!), ["recipe:whale.orca"]);
});

test("the validator refuses malformed recipe templates and undeclared tokens", () => {
  const entry = { ...structuredClone(buildingEntry(17)), code: 99, id: "building:test", key: "test" };
  assert.deepEqual(issuesWith(entry), []);
  const withRecipe = (recipe: string) => ({ ...entry, model: { kind: "recipe", recipe } });
  assert.ok(issuesWith(withRecipe("recipe:building.test.{finish}")).includes("pathToken"));
  assert.ok(issuesWith(withRecipe("building.test")).includes("reference"));
  assert.ok(issuesWith(withRecipe("recipe:Building.test")).includes("reference"));
  assert.ok(issuesWith({ ...entry, model: { kind: "mesh" } }).includes("reference"));
});
