import { isPlainObject, isPositiveCount } from "../../validation/index.ts";
import type { CatalogDataFile } from "./index.ts";
import { type CatalogIssue, createIssueSink, type Fields, type IssueSink } from "./issues.ts";
import { checkPlainJson } from "./json.ts";

const FILE = "balance.json";
/** Ware lists of the balance data (paths below `balance.json`). */
const WARE_LISTS = ["quests.stoneMaterialWares", "quests.excludedWares", "quests.excludedDonations",
  "quests.tutorialReserveWares", "market.wares"];
/** Ware-keyed records of the balance data. */
const WARE_RECORDS = ["quests.wareBatch", "adventures.waresPerPoint", "trade.wareValues", "trade.protectedFloors",
  "economy.starterStock"];
const MATERIAL_FIELDS = ["logs", "planks", "stone"];

const at = (data: Fields, path: string): unknown => path.split(".")
  .reduce<unknown>((value, key) => isPlainObject(value) ? value[key] : undefined, data);

const activeEntries = (files: readonly CatalogDataFile[], kind: string) => files
  .filter(file => file.kind === kind && Array.isArray(file.entries))
  .flatMap(file => (file.entries as unknown[]).filter(isPlainObject)).filter(entry => entry.retired !== true);

const checkWare = (ware: unknown, path: string, wares: ReadonlySet<string>, sink: IssueSink) => {
  if (!wares.has(String(ware))) sink.add("reference", path, `Unknown ware ${String(ware)}`);
};

const checkWareLists = (data: Fields, wares: ReadonlySet<string>, sink: IssueSink) => {
  for (const path of WARE_LISTS) {
    const list = at(data, path);
    if (!Array.isArray(list)) sink.add("shape", `${FILE}.${path}`, "A list of ware keys");
    else list.forEach((ware, index) => checkWare(ware, `${FILE}.${path}[${index}]`, wares, sink));
  }
  for (const path of WARE_RECORDS) {
    const record = at(data, path);
    if (!isPlainObject(record)) sink.add("shape", `${FILE}.${path}`, "A record keyed by ware");
    else for (const ware of Object.keys(record)) checkWare(ware, `${FILE}.${path}.${ware}`, wares, sink);
  }
};

const checkMaterialTiers = (data: Fields, wares: ReadonlySet<string>, sink: IssueSink) => {
  const tiers = at(data, "materials.tiers");
  if (!Array.isArray(tiers)) return sink.add("shape", `${FILE}.materials.tiers`, "A list of material tiers");
  tiers.forEach((tier: unknown, index) => {
    const path = `${FILE}.materials.tiers[${index}]`;
    if (!isPlainObject(tier) || tier.tier !== index) return sink.add("shape", path, `Tier ${index} in tier order`);
    for (const field of MATERIAL_FIELDS) checkWare(tier[field], `${path}.${field}`, wares, sink);
    if (!isPositiveCount(tier.minimumLevel)) sink.add("payload", `${path}.minimumLevel`, "A positive level");
  });
};

/** Trade values are whole value units, and exactly the wares flagged `ware.economy.trade` have one. */
const checkTradeValues = (data: Fields, files: readonly CatalogDataFile[], sink: IssueSink) => {
  const values = at(data, "trade.wareValues");
  if (!isPlainObject(values)) return;
  for (const [ware, value] of Object.entries(values))
    if (!isPositiveCount(value)) sink.add("payload", `${FILE}.trade.wareValues.${ware}`, "Whole value units");
  for (const entry of activeEntries(files, "ware")) {
    const tradable = isPlainObject(entry.ware) && isPlainObject(entry.ware.economy) && entry.ware.economy.trade === true;
    if (tradable !== Object.hasOwn(values, String(entry.key)))
      sink.add("reference", `${FILE}.trade.wareValues`, `${String(entry.id)}: economy.trade and a trade value differ`);
  }
};

const checkNationStock = (data: Fields, files: readonly CatalogDataFile[], wares: ReadonlySet<string>,
  sink: IssueSink) => {
  const stock = at(data, "economy.nationStarterStock");
  if (!isPlainObject(stock)) return sink.add("shape", `${FILE}.economy.nationStarterStock`, "A record keyed by nation");
  const nations = new Set(activeEntries(files, "nation").map(entry => String(entry.key)));
  for (const [nation, goods] of Object.entries(stock)) {
    const path = `${FILE}.economy.nationStarterStock.${nation}`;
    if (!nations.has(nation)) sink.add("reference", path, `Unknown nation ${nation}`);
    if (isPlainObject(goods)) for (const ware of Object.keys(goods)) checkWare(ware, `${path}.${ware}`, wares, sink);
  }
};

/**
 * Runtime data validation of `data/balance.json` (Node check, tests): plain JSON, every ware and nation reference
 * known, material tiers in order, and trade values whole and equal to the catalog's tradable wares.
 */
export const validateBalance = (files: readonly CatalogDataFile[], balance: unknown): CatalogIssue[] => {
  const sink = createIssueSink();
  checkPlainJson(balance, FILE, sink);
  if (!isPlainObject(balance)) {
    sink.add("shape", FILE, "The balance data is an object");
    return sink.issues;
  }
  const wares = new Set(activeEntries(files, "ware").map(entry => String(entry.key)));
  checkWareLists(balance, wares, sink);
  checkMaterialTiers(balance, wares, sink);
  checkTradeValues(balance, files, sink);
  checkNationStock(balance, files, wares, sink);
  return sink.issues;
};
