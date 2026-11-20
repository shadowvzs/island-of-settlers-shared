import { isFiniteNumber, isPlainObject, isStringList } from "../../validation/index.ts";
import {
  ROCK_PALETTES, SAND_PALETTES, SOIL_PALETTES, TERRAIN_GROUND_MATERIALS, TERRAIN_GROUND_VARIANTS
} from "../terrain.ts";
import type { EntryContext } from "./entry.ts";
import type { IssueSink } from "./issues.ts";

const AFFINITY_FIELDS = ["cover", "ground", "palette", "trees", "variants", "water"] as const;
const PALETTE_FIELDS = new Set([
  "heather", "jungle", "rock", "rockTypical", "sand", "sandTypical", "soil", "soilTypical"
]);
const TREE_FIELDS = new Set(["broadleaf", "conifer", "forest", "palms"]);
const WATER_FIELDS = new Set(["rivers", "wetness"]);
const PLANT_PREFIX = "plant:";

const inRange = (value: unknown, min: number, max: number): value is number =>
  isFiniteNumber(value) && value >= min && value <= max;

/** A list of distinct allowed strings; `required` must be one of them (a default palette is typical too). */
const checkChoiceList = (
  value: unknown, allowed: readonly string[], path: string, sink: IssueSink, required: unknown,
  allowEmpty = false
) => {
  if (!isStringList(value) || (!allowEmpty && value.length === 0) || new Set(value).size !== value.length) {
    sink.add("payload", path, "A list of distinct values");
    return;
  }
  for (const item of value)
    if (!allowed.includes(item)) sink.add("payload", path, `Unknown value ${item}`);
  if (required !== undefined && !value.includes(required as string))
    sink.add("payload", path, "The default palette must be listed");
};

/** One palette field: a known default id, and the typical list includes it. */
const checkPaletteField = (
  value: Record<string, unknown>, field: "rock" | "sand" | "soil", allowed: readonly string[],
  path: string, sink: IssueSink
) => {
  const chosen = value[field];
  if (typeof chosen !== "string" || !allowed.includes(chosen))
    sink.add("payload", `${path}.${field}`, `A known ${field} palette id`);
  checkChoiceList(value[`${field}Typical`], allowed, `${path}.${field}Typical`, sink, chosen);
};

const checkPalette = (value: unknown, path: string, sink: IssueSink) => {
  if (!isPlainObject(value)) {
    sink.add("payload", path, "A terrain palette object");
    return;
  }
  for (const key of Object.keys(value))
    if (!PALETTE_FIELDS.has(key)) sink.add("payload", `${path}.${key}`, "Unknown palette field");
  for (const key of ["heather", "jungle"])
    if (value[key] !== undefined && !inRange(value[key], 0, 1))
      sink.add("payload", `${path}.${key}`, "A share in 0..1");
  checkPaletteField(value, "rock", ROCK_PALETTES, path, sink);
  checkPaletteField(value, "sand", SAND_PALETTES, path, sink);
  checkPaletteField(value, "soil", SOIL_PALETTES, path, sink);
};

const checkTrees = (value: unknown, path: string, sink: IssueSink) => {
  if (!isPlainObject(value) || Object.keys(value).some(key => !TREE_FIELDS.has(key)) ||
    Object.keys(value).length !== TREE_FIELDS.size) {
    sink.add("payload", path, "Trees are { broadleaf, conifer, forest, palms }");
    return;
  }
  if (!inRange(value.broadleaf, 0, 2)) sink.add("payload", `${path}.broadleaf`, "A multiplier in 0..2");
  if (!inRange(value.conifer, 0, 1)) sink.add("payload", `${path}.conifer`, "A weight in 0..1");
  if (!inRange(value.forest, -1, 1)) sink.add("payload", `${path}.forest`, "An offset in -1..1");
  if (!inRange(value.palms, 0, 1)) sink.add("payload", `${path}.palms`, "A weight in 0..1");
};

const checkWater = (value: unknown, path: string, sink: IssueSink) => {
  if (!isPlainObject(value) || Object.keys(value).some(key => !WATER_FIELDS.has(key)) ||
    Object.keys(value).length !== WATER_FIELDS.size) {
    sink.add("payload", path, "Water is { rivers, wetness }");
    return;
  }
  for (const key of WATER_FIELDS)
    if (!inRange(value[key], 0, 4)) sink.add("payload", `${path}.${key}`, "A multiplier in 0..4");
};

const checkCover = (value: unknown, path: string, sink: IssueSink, context: EntryContext) => {
  if (!isStringList(value) || value.length === 0 || new Set(value).size !== value.length) {
    sink.add("payload", path, "A non-empty list of distinct plant ids");
    return;
  }
  for (const id of value) {
    if (!id.startsWith(PLANT_PREFIX)) sink.add("reference", path, "Cover kinds are plant ids");
    else if (!context.ids.has(id)) sink.add("reference", path, `Unknown content id ${id}`);
  }
};

const checkTerrainAffinity = (
  value: unknown, path: string, sink: IssueSink, context: EntryContext
) => {
  if (!isPlainObject(value) || AFFINITY_FIELDS.some(field => value[field] === undefined) ||
    Object.keys(value).some(field => !(AFFINITY_FIELDS as readonly string[]).includes(field))) {
    sink.add("payload", path, "A terrain affinity with cover, ground, palette, trees, variants and water");
    return;
  }
  checkCover(value.cover, `${path}.cover`, sink, context);
  checkChoiceList(value.ground, TERRAIN_GROUND_MATERIALS, `${path}.ground`, sink, undefined);
  checkPalette(value.palette, `${path}.palette`, sink);
  checkTrees(value.trees, `${path}.trees`, sink);
  checkChoiceList(value.variants, TERRAIN_GROUND_VARIANTS, `${path}.variants`, sink, undefined, true);
  checkWater(value.water, `${path}.water`, sink);
};

/** The nation payload: its settler-model flag and the optional homeland landscape affinity. */
export const checkNationPayload = (
  payload: unknown, path: string, sink: IssueSink, context: EntryContext
) => {
  if (!isPlainObject(payload) || typeof payload.settlers !== "boolean" ||
    Object.keys(payload).some(key => !["settlers", "terrainAffinity"].includes(key))) {
    sink.add("payload", path, "A nation payload is { settlers: boolean, terrainAffinity? }");
    return;
  }
  if (payload.terrainAffinity !== undefined)
    checkTerrainAffinity(payload.terrainAffinity, `${path}.terrainAffinity`, sink, context);
};
