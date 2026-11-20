import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";

import { assertContentCatalog, contentCatalogIssues } from "../server/catalog-check.ts";
import {
  catalogEntries, categoriesOfKind, contentCatalogVersion, CORE_CATEGORIES, CORE_DATA_FILES, createSidecarLoader,
  economyWareKeys, entriesInFamily, entriesOfKind, entriesWithTag, entryByKey, familyMatches, getContentEntry,
  isEconomyWare, qualifierIssues, validateCatalog, wareEntries, wareEntry, weaponToolKeys
} from "../src/catalog/index.ts";
import type { CatalogSource } from "../src/catalog/index.ts";
import snapshot from "./fixtures/catalog-ids.snapshot.json" with { type: "json" };
import removedIds from "./fixtures/catalog-removed-ids.json" with { type: "json" };

const CATALOG = resolve(import.meta.dirname, "../src/catalog");
const DATA = join(CATALOG, "data");
const VALIDATION_KIT = resolve(import.meta.dirname, "../src/validation");
const sidecarExists = (path: string) => existsSync(join(DATA, path));
const listFiles = (folder: string): string[] => readdirSync(folder, { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? listFiles(join(folder, entry.name)) : [join(folder, entry.name)]);
const source = (): CatalogSource => structuredClone({ categories: CORE_CATEGORIES, files: CORE_DATA_FILES });
const nationEntry = (fields: Record<string, unknown> = {}) => ({
  category: "nation", family: "nation", id: "nation:test", key: "test", kind: "nation", nation: { settlers: true },
  tags: [], text: { name: { en: "Test", key: "content.nation.test.name" } }, ...fields
});
const issuesOf = (entry: unknown) => {
  const raw = source();
  return validateCatalog({ ...raw, files: [...raw.files, { entries: [entry], file: "test.json", kind: "nation" }] });
};
const codesOf = (entry: unknown) => issuesOf(entry).map(issue => issue.code);

test("the core catalog validates with zero issues, sidecars included", () => {
  assert.deepEqual(validateCatalog(source(), { sidecarExists }), []);
  assert.deepEqual(contentCatalogIssues(), []);
  assert.doesNotThrow(assertContentCatalog);
});

test("data files are JSON only and round-trip unchanged", () => {
  for (const file of listFiles(DATA).filter(path => !path.endsWith("index.ts"))) {
    assert.ok(file.endsWith(".json"), `${relative(CATALOG, file)} is not JSON data`);
    const text = readFileSync(file, "utf8");
    assert.deepEqual(JSON.parse(JSON.stringify(JSON.parse(text))), JSON.parse(text));
  }
  for (const file of CORE_DATA_FILES) assert.ok(existsSync(join(DATA, file.file)), file.file);
});

/** The catalog imports only itself and the dependency-free shared validation kit, which imports only itself. */
const assertSelfContained = (folder: string, allowed: readonly string[]) => {
  const specifiers = /(?:import|export)[^"';]*?from\s+["']([^"']+)["']/g;
  for (const file of listFiles(folder).filter(path => path.endsWith(".ts"))) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(specifiers)) {
      assert.ok(specifier!.startsWith("."), `${relative(folder, file)} imports package ${specifier}`);
      const target = resolve(dirname(file), specifier!);
      assert.ok(allowed.some(root => target.startsWith(`${root}/`)), `${relative(folder, file)} imports ${specifier}`);
    }
  }
};

test("catalog modules import only catalog modules and the validation kit", () => {
  assertSelfContained(CATALOG, [CATALOG, VALIDATION_KIT]);
  assertSelfContained(VALIDATION_KIT, [VALIDATION_KIT]);
});

test("ids are stable: nothing in the snapshot is removed or renumbered, additions update it", () => {
  for (const { code, id, key } of snapshot as { code?: number; id: string; key: string }[]) {
    const entry = getContentEntry(id);
    assert.ok(entry, `${id} was removed (retire it instead)`);
    assert.equal(entry.key, key);
    assert.equal(entry.code, code);
  }
  const known = new Set(snapshot.map(({ id }) => id));
  const added = catalogEntries().filter(entry => !known.has(entry.id)).map(entry => entry.id);
  assert.deepEqual(added, [], "Add new ids to tests/fixtures/catalog-ids.snapshot.json");
});

test("owner-removed ids stay gone and are never reused", () => {
  for (const { id } of removedIds) {
    assert.equal(getContentEntry(id), undefined, `${id} was removed by the owner; pick a new id`);
    assert.ok(!snapshot.some(entry => entry.id === id), `${id} must not return to the snapshot`);
  }
});

test("the loader builds frozen indexes by kind, key, family and tag", () => {
  const nations = entriesOfKind("nation");
  assert.equal(nations.length, 8);
  assert.ok(Object.isFrozen(nations) && Object.isFrozen(nations[0]) && Object.isFrozen(nations[0]!.text.name));
  assert.equal(entryByKey("nation", "roman")?.text.name.key, "domain.nation.roman");
  assert.equal(getContentEntry("nation:maya")?.text.name.en, "Classic Maya");
  assert.equal(entriesInFamily("nation").length, 8);
  assert.equal(entriesWithTag("settlerNation").length, 4);
  assert.deepEqual(categoriesOfKind("nation").map(category => category.id), ["nation"]);
  assert.match(contentCatalogVersion(), /^[0-9a-f]{8}$/);
  assert.equal(contentCatalogVersion(), contentCatalogVersion());
});

test("family selectors match on dot boundaries", () => {
  assert.ok(familyMatches("animal", "animal.deer"));
  assert.ok(familyMatches("animal.deer", "animal.deer"));
  assert.ok(!familyMatches("animal", "animalia"));
  assert.ok(!familyMatches("animal.deer", "animal"));
  assert.ok(!familyMatches("", "animal"));
});

test("the validator refuses malformed entries", () => {
  assert.deepEqual(codesOf(nationEntry()), []);
  assert.ok(codesOf(nationEntry({ id: "nation:other" })).includes("idFormat"));
  assert.ok(codesOf(nationEntry({ id: "nation:roman", key: "roman" })).includes("duplicateId"));
  assert.ok(codesOf(nationEntry({ category: "ware.food" })).includes("category"));
  assert.ok(codesOf(nationEntry({ family: "Nation.x" })).includes("family"));
  assert.ok(codesOf(nationEntry({ tags: ["a", "a"] })).includes("tag"));
  assert.ok(codesOf(nationEntry({ extra: 1 })).includes("shape"));
  assert.ok(codesOf(nationEntry({ nation: { settlers: "yes" } })).includes("payload"));
  assert.ok(codesOf(nationEntry({ text: { name: { en: "Test", key: "noDots" } } })).includes("translationKey"));
  assert.ok(codesOf(nationEntry({ text: { name: { en: "Test", key: "domain.nation.roman" } } }))
    .includes("duplicateTranslationKey"));
});

const TERRAIN_AFFINITY = {
  cover: ["plant:shortGrass", "plant:clover"],
  ground: ["dirt", "grass"],
  palette: {
    heather: 0.5,
    rock: "grey",
    rockTypical: ["basalt", "grey"],
    sand: "tan",
    sandTypical: ["tan"],
    soil: "brown",
    soilTypical: ["brown"]
  },
  trees: { broadleaf: 1, conifer: 0.2, forest: 0, palms: 0 },
  variants: ["moss"],
  water: { rivers: 1, wetness: 1 }
};
const affinityEntry = (affinity: unknown) =>
  nationEntry({ nation: { settlers: true, terrainAffinity: affinity } });

test("the validator accepts the nation terrain affinity and refuses malformed ones", () => {
  assert.deepEqual(codesOf(affinityEntry(TERRAIN_AFFINITY)), []);
  assert.ok(codesOf(affinityEntry({ ...TERRAIN_AFFINITY, ground: ["lava"] })).includes("payload"));
  assert.ok(codesOf(affinityEntry({ ...TERRAIN_AFFINITY, cover: ["shell:seashell"] })).includes("reference"));
  assert.ok(codesOf(affinityEntry({ ...TERRAIN_AFFINITY, cover: ["plant:missing"] })).includes("reference"));
  assert.ok(codesOf(affinityEntry({ ...TERRAIN_AFFINITY, trees: { ...TERRAIN_AFFINITY.trees, palms: 2 } }))
    .includes("payload"));
  assert.ok(codesOf(affinityEntry({ ...TERRAIN_AFFINITY, water: { rivers: 1 } })).includes("payload"));
  assert.ok(codesOf(affinityEntry({
    ...TERRAIN_AFFINITY,
    palette: { ...TERRAIN_AFFINITY.palette, soilTypical: ["chalk"] }
  })).includes("payload"));
  assert.ok(codesOf(affinityEntry({ ...TERRAIN_AFFINITY, extra: true })).includes("payload"));
});

test("the validator refuses non-JSON values and unsafe or undeclared paths", () => {
  assert.ok(codesOf(nationEntry({ code: Number.NaN })).includes("notJson"));
  assert.ok(codesOf(nationEntry({ text: { name: { en: "Test", key: "a.b" }, plural: () => 1 } })).includes("notJson"));
  assert.ok(codesOf(nationEntry(JSON.parse('{"nation":{"__proto__":{}}}'))).includes("notJson"));
  assert.ok(codesOf(nationEntry({ icon: { path: "../secret.png", root: "clientAssets" } })).includes("assetPath"));
  assert.ok(codesOf(nationEntry({ icon: { path: "a.png", root: "disk" } })).includes("assetPath"));
  assert.ok(codesOf(nationEntry({ icon: { path: "icons/{nation}.png", root: "clientAssets" } })).includes("pathToken"));
  assert.deepEqual(codesOf(nationEntry({
    icon: { path: "icons/{nation}-{key}.png", root: "clientAssets" }, variants: { nation: "all" }
  })), []);
  const missing = nationEntry({ sidecars: { navigation: { path: "buildings/none/roman.nav.json" } } });
  const raw = source();
  const files = [...raw.files, { entries: [missing], file: "t.json", kind: "nation" as const }];
  const issues = validateCatalog({ ...raw, files }, { sidecarExists });
  assert.ok(issues.some(issue => issue.code === "sidecar"));
  assert.ok(codesOf(nationEntry({ sidecars: { navigation: { path: "a/b.txt" } } })).includes("assetPath"));
});

test("qualifiers must be declared axes inside their range or list", () => {
  const variants = { level: { max: 5, min: 1 }, nation: ["roman", "viking"] };
  assert.deepEqual(qualifierIssues(variants, { level: 3, nation: "roman" }), []);
  assert.equal(qualifierIssues(variants, { level: 6 }).length, 1);
  assert.equal(qualifierIssues(variants, { nation: "maya" }).length, 1);
  assert.equal(qualifierIssues(variants, { rank: 1 }).length, 1);
  assert.deepEqual(qualifierIssues({ nation: "all" }, { nation: "maya" }), []);
});

test("sidecars load lazily once and frozen", async () => {
  let calls = 0;
  const load = createSidecarLoader({ "buildings/a/roman.nav.json": async () => { calls++; return { cells: [1] }; } });
  const first = await load<{ cells: number[] }>({ path: "buildings/a/roman.nav.json" });
  await load({ path: "buildings/a/roman.nav.json" });
  assert.equal(calls, 1);
  assert.ok(Object.isFrozen(first.cells));
  await assert.rejects(load({ path: "missing.json" }));
});

const wareKeys = (matches: (entry: ReturnType<typeof wareEntries>[number]) => boolean) =>
  wareEntries().filter(matches).map(entry => entry.key);

test("wares: one category each, with the owner's food, drink and food-chain split (answer 64)", () => {
  const inCategory = (category: string) => wareKeys(entry => entry.category === category);
  assert.deepEqual(inCategory("ware.food"), ["fish", "meat", "bread"]);
  assert.deepEqual(inCategory("ware.drink"),
    ["beer", "wine", "mead", "sake", "toddy", "tea", "pomegranateJuice", "cacaoDrink", "berryDrink"]);
  assert.deepEqual(inCategory("ware.foodChain"), ["grain", "flour", "water", "grapes", "honey", "rice", "coconut",
    "teaLeaves", "pomegranate", "cacaoBeans", "berries", "pig"]);
  const categories = new Set(categoriesOfKind("ware").map(category => category.id));
  assert.deepEqual(wareKeys(entry => !categories.has(entry.category)), []);
});

test("wares: dual use and money are tags beside the single category (answers 65, 66)", () => {
  const tagged = (tag: string) => wareKeys(entry => entry.tags.includes(tag));
  assert.deepEqual(tagged("weapon"), ["axe", "bow", "sword", "shield"]);
  assert.deepEqual(tagged("weapon").filter(key => !tagged("tool").includes(key)), []);
  assert.deepEqual(tagged("money"), ["coins"]);
  assert.equal(wareEntry("coins")?.category, "ware.raw");
  assert.equal(wareEntry("bow")?.category, "ware.tools");
  assert.deepEqual(weaponToolKeys(), ["axe", "bow"]);
});

test("wares: scopes, aliases and plural texts", () => {
  assert.equal(wareEntries().length, 66);
  assert.ok(isEconomyWare("marble", "trade") && isEconomyWare("marble", "ledger") && isEconomyWare("marble", "stock"));
  assert.ok(!isEconomyWare("unobtainium", "ledger") && !isEconomyWare(7, "ledger"));
  assert.ok(isEconomyWare("boat", "ledger") && !isEconomyWare("boat", "stock") && !isEconomyWare("boat", "trade"));
  assert.equal(economyWareKeys("ledger").size, 66);
  assert.equal(wareEntry("logs")?.text.name.key, "domain.ware.logs");
  const aliases = wareEntries().flatMap(entry => entry.ware.aliases ?? []);
  assert.equal(new Set(aliases).size, aliases.length);
  assert.ok(aliases.every(alias => !wareEntry(alias)));
  for (const entry of wareEntries())
    assert.equal(entry.text.plural?.key ?? `domain.wareCount.${entry.key}`, `domain.wareCount.${entry.key}`);
});
