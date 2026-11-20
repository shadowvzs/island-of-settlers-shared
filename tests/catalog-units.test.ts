import assert from "node:assert/strict";
import test from "node:test";

import {
  CORE_CATEGORIES, CORE_DATA_FILES, commanderEntries, commanderEntry, entriesOfKind, settlerByJob, settlerEntries,
  settlerTool, soldierEntries, soldierEntry, validateCatalog
} from "../src/catalog/index.ts";
import type { CatalogSource, ContentKind } from "../src/catalog/index.ts";
import { NATIONS } from "../src/nations.ts";

const codesWith = (kind: ContentKind, entry: unknown) => {
  const raw = structuredClone({ categories: CORE_CATEGORIES, files: CORE_DATA_FILES }) as CatalogSource;
  return validateCatalog({ ...raw, files: [...raw.files, { entries: [entry], file: "t.json", kind }] })
    .map(issue => issue.code);
};

test("settlers keep the persisted English job strings, one entry per job", () => {
  const jobs = settlerEntries().map(entry => entry.settler.job);
  assert.equal(new Set(jobs).size, jobs.length);
  assert.equal(settlerByJob("Iron founder")?.id, "settler:ironFounder");
  assert.equal(settlerByJob("Woodcutter")?.text.name.key, "domain.job.woodcutter");
  assert.equal(settlerByJob("Unknown"), undefined);
  assert.equal(settlerTool("Miner"), "pickaxe");
  assert.equal(settlerTool("Geologist"), "hammer");
  assert.equal(settlerTool("Carrier"), undefined);
  for (const entry of settlerEntries()) assert.ok(entry.family.startsWith("settler."), entry.id);
});

test("soldiers keep their troop keys, rank axis and retired cavalry", () => {
  assert.deepEqual(soldierEntries().map(entry => entry.key), ["shield", "heavy", "archer", "cavalry"]);
  assert.deepEqual(entriesOfKind("soldier").map(entry => entry.key), ["shield", "heavy", "archer"]);
  assert.equal(soldierEntry("cavalry")?.retired, true);
  for (const entry of soldierEntries())
    assert.equal(entry.soldier.profile.armour.length, (entry.variants?.rank?.max ?? -1) + 1, entry.id);
  assert.deepEqual(soldierEntry("shield")?.soldier.recruitCost, { beer: 1, shield: 1, sword: 1 });
});

test("one commander per nation, keyed by the nation", () => {
  assert.deepEqual(commanderEntries().map(entry => entry.key), [...NATIONS]);
  assert.equal(commanderEntry("viking")?.commander.definition, "viking-raider");
  assert.equal(commanderEntry("maya")?.commander.definition, "roman-guardian");
});

test("the validator refuses malformed units", () => {
  const settler = { ...structuredClone(settlerByJob("Miner")), id: "settler:test", key: "test" };
  assert.deepEqual(codesWith("settler", { ...settler, settler: { job: "Tester" } }), []);
  assert.ok(codesWith("settler", { ...settler, settler: { job: "Tester", tool: "unobtainium" } }).includes("reference"));
  assert.ok(codesWith("settler", { ...settler, actor: { capabilities: ["Bad word"] } }).includes("actor"));
  const soldier = { ...structuredClone(soldierEntry("archer")), id: "soldier:test", key: "test" };
  assert.deepEqual(codesWith("soldier", soldier), []);
  const profile = { ...soldier.soldier!.profile, armour: [0.1] };
  assert.ok(codesWith("soldier", { ...soldier, soldier: { ...soldier.soldier, profile } }).includes("payload"));
  assert.ok(codesWith("soldier", { ...soldier, soldier: { ...soldier.soldier, recruitCost: undefined } })
    .includes("payload"));
  const commander = { ...structuredClone(commanderEntry("roman")), id: "commander:atlantis", key: "atlantis" };
  assert.ok(codesWith("commander", commander).includes("reference"));
});
