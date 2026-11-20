import { isFiniteNumber, isPlainObject, isPositiveCount, isSafeCount, isStringList } from "../../validation/index.ts";
import { unifiedConstructionCost } from "../building-data/construction-formula.ts";
import type { ConstructionInputs } from "../types/building-data.ts";
import { checkContentText } from "./entry.ts";
import { checkFields, type FieldRules, isOneOf, optional, rule } from "./fields.ts";
import type { CatalogDataFile } from "./index.ts";
import { type CatalogIssue, createIssueSink, type Fields, type IssueSink } from "./issues.ts";
import { checkPlainJson } from "./json.ts";

/** The building sidecars every active building references (README, "Building sidecars"). */
export const BUILDING_SIDECARS = ["construction", "geometry", "rules"] as const;
export type BuildingSidecarName = (typeof BUILDING_SIDECARS)[number];

const sidecarPath = (key: string, name: BuildingSidecarName) => `buildings/${key}/${name}.json`;

const isRecordOf = (rules: FieldRules) => (value: unknown) => {
  const sink = createIssueSink();
  checkFields(value, "", sink, rules, "an object");
  return isPlainObject(value) && sink.issues.length === 0;
};
const isWareAmounts = (value: unknown) =>
  isPlainObject(value) && Object.values(value).every(amount => isSafeCount(amount));
const isBoolean = (value: unknown) => typeof value === "boolean";
/** A translatable text: `{ key, en }` with a Lingui id (README, "Text and translation"). */
const isContentText = (value: unknown) => {
  const sink = createIssueSink();
  checkContentText(value, "", sink);
  return sink.issues.length === 0;
};
const ROLE_TEXT = "A role text { key, en }";
const isPositive = (value: unknown) => isFiniteNumber(value) && value > 0;

const PRODUCTION_FIELDS = {
  alternativeFood: optional(isBoolean, "A boolean"),
  inputs: rule(isStringList, "Ware keys"),
  job: rule(value => typeof value === "string" && value.startsWith("settler:"), "A settler:* id"),
  logic: optional(value => typeof value === "string" && value.startsWith("rule:production."), "A rule:production.* id"),
  modes: optional(value => isPlainObject(value) && Object.values(value).every(isRecordOf({
    builds: rule(value => typeof value === "string" && value.includes(":"), "A content id"),
    inputs: rule(isWareAmounts, "Ware amounts")
  })), "Modes are { <mode>: { builds, inputs } }"),
  outdoor: optional(value => typeof value === "string", "An outdoor work kind"),
  outputs: rule(isStringList, "Ware keys"),
  plantation: optional(value => typeof value === "string", "A plantation kind"),
  seconds: rule(isPositive, "Positive seconds"),
  service: optional(isBoolean, "A boolean")
} satisfies FieldRules;

const NATION_PRODUCTION_FIELDS: FieldRules = {
  inputs: PRODUCTION_FIELDS.inputs, job: PRODUCTION_FIELDS.job, outputs: PRODUCTION_FIELDS.outputs,
  plantation: PRODUCTION_FIELDS.plantation
};

const RULES_FIELDS: FieldRules = {
  art: rule(isRecordOf({
    extension: rule(isBoolean, "A boolean"),
    footprint: rule(isOneOf([1, 2, 3]), "1, 2 or 3"),
    mechanism: rule(isOneOf(["crane", "hammer", "none", "press", "pump", "saw", "wheel"]), "A mechanism"),
    props: rule(value => Array.isArray(value) && value.every(item => typeof item === "string"), "Prop names"),
    roof: rule(value => typeof value === "string", "A roof"),
    style: rule(isOneOf(["castle", "cottage", "hall", "mill", "mine", "tower", "well"]), "A style")
  }), "Art is { extension, footprint, mechanism, props, roof, style }"),
  levels: optional(isRecordOf({
    costs: rule(value => Array.isArray(value) && value.length === 4 && value.every(isWareAmounts),
      "Four upgrade costs (saved levels 0-3)"),
    effects: rule(isStringList, "Effect names"),
    family: rule(value => typeof value === "string", "A family")
  }), "Levels are { costs, effects, family }"),
  limits: optional(isRecordOf({
    colony: optional(isOneOf(["always", "conquered"]), "always or conquered"),
    commanderCampaign: optional(isBoolean, "A boolean"),
    homeOnly: optional(isBoolean, "A boolean"),
    max: optional(isPositiveCount, "A positive count")
  }), "Limits are { colony?, commanderCampaign?, homeOnly?, max? }"),
  military: optional(isRecordOf({
    archerPosts: optional(isSafeCount, "A count"),
    assault: optional(isOneOf(["fort", "support"]), "fort or support"),
    coinCapacity: optional(isSafeCount, "A count"),
    garrison: optional(isPositiveCount, "A positive count")
  }), "Military is { archerPosts?, assault?, coinCapacity?, garrison? }"),
  nations: optional(value => isPlainObject(value) && Object.values(value).every(isRecordOf({
    production: optional(isRecordOf(NATION_PRODUCTION_FIELDS), "A nation production override"),
    role: optional(isContentText, ROLE_TEXT)
  })), "Nations are { <nation>: { production?, role? } }"),
  output: optional(isRecordOf({ capacity: rule(isPositiveCount, "A positive count") }), "Output is { capacity }"),
  production: optional(isRecordOf(PRODUCTION_FIELDS), "A production block"),
  progressionTier: rule(isOneOf(["big", "medium", "mines", "small"]), "A progression tier"),
  residence: optional(isRecordOf({ growthSeconds: rule(isPositive, "Positive seconds"),
    limit: rule(isPositiveCount, "A positive count") }), "Residence is { growthSeconds, limit }"),
  role: rule(isContentText, ROLE_TEXT),
  storage: optional(isRecordOf({ capacity: rule(isPositiveCount, "A positive count") }), "Storage is { capacity }"),
  structureHp: rule(isPositiveCount, "Positive hit points"),
  task: rule(value => typeof value === "string", "A work animation id"),
  territoryRadius: optional(isSafeCount, "Tiles"),
  unlockLevel: rule(isPositiveCount, "A player level"),
  worker: optional(value => typeof value === "string" && value.startsWith("settler:"), "A settler:* id")
};

const CONSTRUCTION_FIELDS: FieldRules = {
  cost: rule(value => isWareAmounts(value) && Object.keys(value as object).length > 0, "Ware amounts"),
  fixed: optional(value => value === true, "true for an authored exception"),
  nations: optional(value => isPlainObject(value) && Object.values(value).every(isWareAmounts),
    "Nations are { <nation>: ware amounts }"),
  inputs: optional(isRecordOf({
    cells: rule(value => Array.isArray(value) && value.length === 2 && value.every(isPositiveCount), "[width, depth]"),
    height: rule(isPositive, "Positive tiles"),
    triangles: rule(isPositiveCount, "A positive count")
  }), "Inputs are { cells, height, triangles }")
};

/** A measured building pays exactly the unified rule's cost; only fixed entries have no inputs. */
const constructionIssues = (construction: Fields, path: string, ids: ReadonlySet<string>, sink: IssueSink) => {
  if (isPlainObject(construction.cost)) for (const ware of Object.keys(construction.cost))
    if (!ids.has(`ware:${ware}`)) sink.add("reference", `${path}.cost.${ware}`, `Unknown content id ware:${ware}`);
  if (isPlainObject(construction.nations)) for (const [nation, cost] of Object.entries(construction.nations)) {
    const at = `${path}.nations.${nation}`;
    if (!ids.has(`nation:${nation}`)) sink.add("reference", at, `Unknown content id nation:${nation}`);
    if (isPlainObject(cost)) for (const ware of Object.keys(cost))
      if (!ids.has(`ware:${ware}`)) sink.add("reference", `${at}.${ware}`, `Unknown content id ware:${ware}`);
  }
  // Authored receipts (fixed or per nation) are the owner's numbers; only the default follows the unified rule.
  if (construction.fixed === true || construction.nations !== undefined) return;
  if (!isPlainObject(construction.inputs)) {
    sink.add("payload", `${path}.inputs`, "A unified cost needs its measured inputs (or fixed: true)");
    return;
  }
  const expected = unifiedConstructionCost(construction.inputs as unknown as ConstructionInputs);
  if (JSON.stringify(construction.cost) !== JSON.stringify(expected))
    sink.add("payload", `${path}.cost`, `The unified rule gives ${JSON.stringify(expected)}`);
};

/** Every id of the core files: references in the sidecars must exist. */
const knownIds = (files: readonly CatalogDataFile[]) => new Set(files.flatMap(file =>
  Array.isArray(file.entries) ? file.entries.filter(isPlainObject).map(entry => String(entry.id)) : []));

const refIssues = (rules: Fields, path: string, ids: ReadonlySet<string>, sink: IssueSink) => {
  const need = (id: unknown, at: string) => {
    if (!ids.has(String(id))) sink.add("reference", at, `Unknown content id ${String(id)}`);
  };
  const wares = (list: unknown, at: string) => {
    if (Array.isArray(list)) list.forEach((ware, index) => need(`ware:${String(ware)}`, `${at}[${index}]`));
    else if (isPlainObject(list)) for (const ware of Object.keys(list)) need(`ware:${ware}`, `${at}.${ware}`);
  };
  const production = (block: unknown, at: string) => {
    if (!isPlainObject(block)) return;
    need(block.job, `${at}.job`);
    wares(block.inputs, `${at}.inputs`);
    wares(block.outputs, `${at}.outputs`);
    if (isPlainObject(block.modes)) for (const [mode, order] of Object.entries(block.modes)) {
      if (!isPlainObject(order)) continue;
      need(order.builds, `${at}.modes.${mode}.builds`);
      wares(order.inputs, `${at}.modes.${mode}.inputs`);
    }
  };
  if (rules.worker !== undefined) need(rules.worker, `${path}.worker`);
  production(rules.production, `${path}.production`);
  if (isPlainObject(rules.levels) && Array.isArray(rules.levels.costs))
    rules.levels.costs.forEach((cost, index) => wares(cost, `${path}.levels.costs[${index}]`));
  if (isPlainObject(rules.nations)) for (const [nation, override] of Object.entries(rules.nations)) {
    need(`nation:${nation}`, `${path}.nations.${nation}`);
    if (isPlainObject(override)) production(override.production, `${path}.nations.${nation}.production`);
  }
};

const isPoint = (value: unknown) => Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
const isPoints = (value: unknown) => Array.isArray(value) && value.every(isPoint);
const isBox = isRecordOf({ max: rule(isPoint, "A point"), min: rule(isPoint, "A point") });

const GEOMETRY_FIELDS: FieldRules = {
  door: rule(isRecordOf({
    height: rule(isPositive, "Positive recipe units"), hinge: rule(isPoint, "A point"),
    profile: rule(isOneOf(["arched", "flat"]), "arched or flat"), spring: rule(isPositive, "Positive recipe units"),
    width: rule(isPositive, "Positive recipe units")
  }), "Door is { height, hinge, profile, spring, width }"),
  entrance: rule(value => Array.isArray(value) && value.every(isBox), "Boxes { max, min }"),
  ground: rule(isOneOf(["building", "mine"]), "building or mine"),
  logistics: rule(isRecordOf({
    carrierApproach: rule(isPoint, "A point"), carrierHandoff: rule(isPoint, "A point"),
    carrierQueue: rule(isPoints, "Points"), doorThreshold: rule(isPoint, "A point"),
    roadConnection: rule(isPoint, "A point"), workerApproach: rule(isPoint, "A point"),
    workerExit: rule(isPoint, "A point")
  }), "Logistics anchors"),
  mechanism: rule(isPoint, "A point"),
  modelOriginOffset: optional(isPoint, "A point"),
  overhead: rule(value => Array.isArray(value) && value.every(isRecordOf({
    center: rule(isPoint, "A point"), halfDepth: rule(isPositive, "Positive"), radius: rule(isPositive, "Positive")
  })), "Rotors { center, halfDepth, radius }"),
  plot: rule(isRecordOf({
    cells: rule(value => Array.isArray(value) && value.length === 2 && value.every(isPositiveCount), "[width, depth]"),
    scale: rule(isPositive, "A positive scale")
  }), "Plot is { cells, scale }"),
  workerExit: rule(isPoint, "A point")
};

const SIDECAR_FIELDS: Readonly<Record<BuildingSidecarName, FieldRules>> = {
  construction: CONSTRUCTION_FIELDS, geometry: GEOMETRY_FIELDS, rules: RULES_FIELDS
};

/** `[minX, minY, minZ, maxX, maxY, maxZ, shape?, yaw?, id?]` (README, "Building geometry"). */
const isEncodedVolume = (value: unknown) => Array.isArray(value) && value.length >= 6 && value.length <= 9 &&
  value.slice(0, 6).every(isFiniteNumber) && [undefined, null, "box", "ellipse"].includes(value[6]) &&
  (value[7] === undefined || value[7] === null || isFiniteNumber(value[7])) &&
  (value[8] === undefined || typeof value[8] === "string");
const isNavigationLevel = isRecordOf({
  interiors: rule(value => Array.isArray(value) && value.every(isEncodedVolume), "Encoded volumes"),
  obstacles: rule(value => Array.isArray(value) && value.every(isEncodedVolume), "Encoded volumes"),
  stock: rule(isRecordOf({
    fixed: rule(value => Array.isArray(value) && value.every(item => isPlainObject(item) &&
      isEncodedVolume(item.volume) && typeof item.ware === "string"), "Fixed stock volumes"),
    slots: rule(value => Array.isArray(value) && value.every(item => isPlainObject(item) &&
      isPoint(item.center) && isFiniteNumber(item.bottom) && typeof item.ware === "string"), "Stock slots")
  }), "Stock is { fixed, slots }")
});
/** Five levels; a number repeats an earlier stored level. */
const isNavigationFile = (value: unknown) => {
  if (!isPlainObject(value) || !Array.isArray(value.levels) || value.levels.length !== 5) return false;
  const levels: unknown[] = value.levels;
  return levels.every((level, index) => typeof level === "number"
    ? Number.isInteger(level) && level >= 1 && level <= index && typeof levels[level - 1] !== "number"
    : isNavigationLevel(level));
};

const NAVIGATION_BASE_NATION = "roman";
const navigationPath = (key: string, nation: string) => `buildings/${key}/navigation/${nation}.json`;
const tryRead = (read: (path: string) => unknown, path: string) => {
  try { return read(path); } catch { return undefined; }
};
/** The base nation's navigation exists; every other nation has its own file or reuses the base one. */
const navigationIssues = (key: string, at: string, ref: unknown, nations: readonly string[],
  read: (path: string) => unknown, sink: IssueSink) => {
  const expected = navigationPath(key, "{nation}");
  if (!isPlainObject(ref) || ref.path !== expected) {
    sink.add("sidecar", `${at}.sidecars.navigation`, `Must reference ${expected}`);
    return;
  }
  for (const nation of nations) {
    const own = tryRead(read, navigationPath(key, nation));
    if (own === undefined && nation !== NAVIGATION_BASE_NATION) continue;
    if (!isNavigationFile(own))
      sink.add("payload", navigationPath(key, nation), "Must be { levels: five navigation levels or level numbers }");
  }
};

const checkBuilding = (
  entry: Fields, at: string, ids: ReadonlySet<string>, read: (path: string) => unknown, sink: IssueSink
) => {
  const sidecars = isPlainObject(entry.sidecars) ? entry.sidecars : {};
  for (const name of BUILDING_SIDECARS) {
    const path = sidecarPath(String(entry.key), name);
    const ref = sidecars[name];
    if (!isPlainObject(ref) || ref.path !== path) {
      sink.add("sidecar", `${at}.sidecars.${name}`, `Must reference ${path}`);
      continue;
    }
    const data = read(path);
    checkPlainJson(data, path, sink);
    const fields = checkFields(data, path, sink, SIDECAR_FIELDS[name], `a building ${name} sidecar`);
    if (fields && name === "rules") refIssues(fields, path, ids, sink);
    if (fields && name === "construction") constructionIssues(fields, path, ids, sink);
  }
  navigationIssues(String(entry.key), at, sidecars.navigation, nationsOf(ids), read, sink);
};

const nationsOf = (ids: ReadonlySet<string>) =>
  [...ids].filter(id => id.startsWith("nation:")).map(id => id.slice("nation:".length));

/**
 * Runtime data validation of the building sidecars (Node check, tests): every active building references its
 * sidecars at `buildings/<key>/<name>.json`, each passes its field rules, its ware, settler, nation and
 * built-content references exist, and every measured construction cost equals the unified rule's.
 */
export const validateBuildingSidecars = (
  files: readonly CatalogDataFile[], read: (path: string) => unknown
): CatalogIssue[] => {
  const sink = createIssueSink();
  const ids = knownIds(files);
  for (const file of files) {
    if (file.kind !== "building" || !Array.isArray(file.entries)) continue;
    file.entries.forEach((entry: unknown, index) => {
      if (isPlainObject(entry) && entry.retired !== true)
        checkBuilding(entry, `${file.file}[${index}]`, ids, read, sink);
    });
  }
  return sink.issues;
};
