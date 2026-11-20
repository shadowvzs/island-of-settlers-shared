import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { applyEntryDefaults } from "../src/catalog/defaults.ts";
import { catalogEntries, CORE_DATA_FILES } from "../src/catalog/index.ts";
import type { ContentEntry } from "../src/catalog/index.ts";
import iconSnapshot from "./fixtures/catalog-icons.snapshot.json" with { type: "json" };
import snapshot from "./fixtures/catalog-refs.snapshot.json" with { type: "json" };

/**
 * Model, sidecar and icon references as readers see them (owner answer 62; icons: owner decision 2026-11-11). Each
 * snapshot was written from the data before the per-file defaults (`data/defaults.json`) replaced the repeated
 * per-entry references, so it proves the resolution is unchanged for every entry. Regenerate only for an intended
 * reference change: `UPDATE_REF_SNAPSHOT=1 node --test tests/catalog-ref-defaults.test.ts`.
 */
const modelText = ({ model }: ContentEntry) => {
  if (!model) return "";
  return model.kind === "recipe" ? model.recipe : `${model.asset.root}/${model.asset.path}`;
};
const sidecarText = ({ sidecars = {} }: ContentEntry) => Object.keys(sidecars).sort()
  .map(name => `${name}=${sidecars[name]!.path}`).join(",");
const iconText = ({ icon }: ContentEntry) => icon ? `${icon.root}/${icon.path}` : "";
/** Entries without any reference are left out: gaining one through a default then fails as an unexpected key. */
const resolvedRefs = () => Object.fromEntries(catalogEntries()
  .map(entry => [entry.id, `${modelText(entry)}|${sidecarText(entry)}`] as const)
  .filter(([, refs]) => refs !== "|"));
/** Icon asset references as written on the resolved entry (path tokens stay for the client resolver). */
const resolvedIcons = () => Object.fromEntries(catalogEntries()
  .map(entry => [entry.id, iconText(entry)] as const)
  .filter(([, icon]) => icon !== ""));

test("every entry resolves the same model and sidecar references as before the defaults", async () => {
  if (process.env.UPDATE_REF_SNAPSHOT) {
    const { writeFileSync } = await import("node:fs");
    const file = new URL("./fixtures/catalog-refs.snapshot.json", import.meta.url);
    writeFileSync(file, `${JSON.stringify(resolvedRefs(), null, 1)}\n`);
    return;
  }
  assert.deepEqual(resolvedRefs(), snapshot);
});

test("every entry resolves the same icon reference as before the defaults", async () => {
  if (process.env.UPDATE_REF_SNAPSHOT) {
    const { writeFileSync } = await import("node:fs");
    const file = new URL("./fixtures/catalog-icons.snapshot.json", import.meta.url);
    writeFileSync(file, `${JSON.stringify(resolvedIcons(), null, 1)}\n`);
    return;
  }
  assert.deepEqual(resolvedIcons(), iconSnapshot);
});

const DATA = new URL("../src/catalog/data/", import.meta.url);
const readData = (file: string) => JSON.parse(readFileSync(new URL(file, DATA), "utf8")) as unknown;

test("defaults name core data files, and no entry repeats the default of its file", () => {
  const defaults = readData("defaults.json") as Record<string, Record<string, unknown>>;
  const files = new Set(CORE_DATA_FILES.map(file => file.file));
  assert.deepEqual(Object.keys(defaults).filter(file => !files.has(file)), []);
  for (const [file, fields] of Object.entries(defaults)) {
    const raw = readData(file) as Record<string, unknown>[];
    const repeated = raw.filter(entry => {
      const [expanded] = applyEntryDefaults([{ key: entry.key }], fields) as Record<string, unknown>[];
      return Object.keys(fields).some(field => JSON.stringify(entry[field]) === JSON.stringify(expanded![field]));
    });
    assert.deepEqual(repeated.map(entry => entry.id), [], `${file}: drop references equal to the default`);
  }
});

test("an entry's own reference replaces the default; a recipe default fills the entry key", () => {
  const sidecars = { tuning: { path: "a.json" } };
  const defaults = { model: { kind: "recipe", recipe: "recipe:tree.{key}" }, sidecars } as const;
  const own = { key: "oak", model: { kind: "recipe", recipe: "recipe:tree.special" }, sidecars: {} };
  assert.deepEqual(applyEntryDefaults([{ key: "oak" }, own], defaults), [
    { key: "oak", model: { kind: "recipe", recipe: "recipe:tree.oak" }, sidecars },
    own
  ]);
  assert.equal(applyEntryDefaults("broken", defaults), "broken");
});
