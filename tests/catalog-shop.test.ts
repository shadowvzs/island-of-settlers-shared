import assert from "node:assert/strict";
import test from "node:test";

import {
  CORE_CATEGORIES, CORE_DATA_FILES, decorationEntries, decorationEntry, itemEntries, offerEntries, validateCatalog
} from "../src/catalog/index.ts";
import type { CatalogSource, ContentKind } from "../src/catalog/index.ts";
import { playerItemDefinition, playerItemForOfferId, validPlayerInventory } from "../src/player-inventory.ts";
import { getRoadDecorationItem, ROAD_DECORATION_ITEM_DEFINITIONS } from "../src/road-decoration-items.ts";

const codesWith = (kind: ContentKind, entry: unknown) => {
  const raw = structuredClone({ categories: CORE_CATEGORIES, files: CORE_DATA_FILES }) as CatalogSource;
  return validateCatalog({ ...raw, files: [...raw.files, { entries: [entry], file: "t.json", kind }] })
    .map(issue => issue.code);
};
const arch = (decoration: Record<string, unknown> = {}, fields: Record<string, unknown> = {}) => ({
  ...structuredClone(decorationEntry("roman-rusticated-arch")), id: "decoration:test-arch", key: "test-arch",
  decoration: { ...decorationEntry("roman-rusticated-arch")!.decoration, ...decoration }, ...fields
});

test("decorations, items and offers keep their persisted ids and counts", () => {
  assert.equal(decorationEntries().length, 266);
  assert.equal(Object.keys(ROAD_DECORATION_ITEM_DEFINITIONS).length, 272);
  assert.deepEqual(itemEntries().map(entry => entry.key), ["chooseNation", "commanderRecovery"]);
  assert.equal(offerEntries().length, 36);
  assert.deepEqual(getRoadDecorationItem("roadDecoration:roman-rusticated-arch:marble"), {
    category: "arches", decoration: "roman-rusticated-arch", finish: "marble", maxHeld: 1_000_000,
    name: "Roman rusticated arch", nation: "roman", offerId: "road-decoration-roman-rusticated-arch-marble",
    price: 5, shopAvailable: true, uses: ["shop", "editor"]
  });
  assert.equal(playerItemDefinition("chooseNation")?.offerId, "choose-nation");
  assert.equal(playerItemForOfferId("commander-recovery")?.id, "commanderRecovery");
  assert.ok(validPlayerInventory({ chooseNation: 1, "roadDecoration:chinese-pailou:native": 3 }));
  assert.ok(!validPlayerInventory({ chooseNation: 2 }));
  assert.ok(!validPlayerInventory({ "roadDecoration:unknown:native": 1 }));
});

test("the validator refuses malformed decoration, item and offer payloads", () => {
  assert.deepEqual(codesWith("decoration", arch()), []);
  assert.ok(codesWith("decoration", arch({ uses: ["garden"] })).includes("payload"));
  assert.ok(codesWith("decoration", arch({ nation: "atlantis" })).includes("reference"));
  assert.ok(codesWith("decoration", arch({ shopAvailable: true, uses: ["editor"] })).includes("payload"));
  assert.ok(codesWith("decoration", arch({}, { variants: {} })).includes("variants"));
  assert.ok(codesWith("decoration", arch({ plant: { species: "x" } })).includes("payload"));
  const offer = { ...structuredClone(offerEntries()[0]!), id: "offer:test-1", key: "test-1" };
  assert.deepEqual(codesWith("offer", offer), []);
  assert.ok(codesWith("offer", { ...offer, offer: { ...offer.offer, ware: "unobtainium" } }).includes("reference"));
  assert.ok(codesWith("offer", { ...offer, offer: { ...offer.offer, price: 79.5 } }).includes("payload"));
  const item = { ...structuredClone(itemEntries()[0]!), id: "item:test", key: "test" };
  assert.ok(codesWith("item", { ...item, item: { ...item.item, offerKey: "Bad Key" } }).includes("payload"));
});
