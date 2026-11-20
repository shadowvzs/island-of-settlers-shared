import { isFiniteNumber, isPlainObject, isPositiveCount, isSafeCount } from "../../validation/index.ts";
import { checkFields, type FieldRules, isOneOf, optional, rule } from "./fields.ts";
import type { CatalogDataFile } from "./index.ts";
import { type CatalogIssue, createIssueSink, type Fields, type IssueSink } from "./issues.ts";
import { checkPlainJson } from "./json.ts";
import { isNonNegative, isPositive } from "./kinds-life.ts";

/**
 * One tuning sidecar (README, "Tuning sidecars"): its path, the entries that must reference it, the record key of
 * such an entry and the field rules of one record.
 */
interface TuningSidecarRule {
  owns: (entry: Fields, kind: string) => boolean;
  path: string;
  recordKey: (entry: Fields) => unknown;
  rules: FieldRules;
}

const isNumberList = (length: number) => (value: unknown) =>
  Array.isArray(value) && value.length === length && value.every(isFiniteNumber);
const isVec3 = isNumberList(3);
const isColor = (value: unknown) => isVec3(value) && (value as number[]).every(channel => channel >= 0 && channel <= 1);
const isRange = (value: unknown) => isNumberList(2)(value) && (value as number[])[0]! <= (value as number[])[1]!;
const isShare = (value: unknown) => isNonNegative(value) && (value as number) <= 1;
/** Control points with increasing positions. */
const isProfile = (value: unknown) => Array.isArray(value) && value.length >= 2 && value.every(isNumberList(2))
  && value.every((point, index) => index === 0 || point[0] > value[index - 1][0]);
/** A nested object passing its own field rules (no unknown fields). */
const isRecord = (rules: FieldRules) => (value: unknown) => {
  const sink = createIssueSink();
  checkFields(value, "", sink, rules, "an object");
  return isPlainObject(value) && sink.issues.length === 0;
};

const COLOR = rule(isColor, "A colour is [r, g, b] in 0..1");
const RANGE = rule(isRange, "A range is [min, max] with min <= max");
const POSITIVE = rule(isPositive, "A positive number");
const NUMBER = rule(isFiniteNumber, "A finite number");
const SHARE = rule(isShare, "A share in 0..1");
const VEC3 = rule(isVec3, "Three finite numbers");
const PROFILE = rule(isProfile, "Profile points [position, value] with increasing positions");

const GAIT = rule(isRecord({ speed: POSITIVE, stride: POSITIVE }), "A gait is { speed, stride } (positive)");
const WILDLIFE_RULES: FieldRules = {
  alertRadius: POSITIVE,
  body: rule(isRecord({ back: POSITIVE, front: POSITIVE, height: POSITIVE }), "A body is { back, front, height }"),
  calm: rule(isRecord(Object.fromEntries(["graze", "idle", "look", "rest", "walk"].map(state => [state, SHARE]))),
    "Calm weights are { graze, idle, look, rest, walk } shares"),
  clearance: POSITIVE,
  cliffMargin: rule(isSafeCount, "Whole nav cells >= 0"),
  durations: rule(isRecord(Object.fromEntries(["alert", "graze", "idle", "look", "recover", "rest"]
    .map(state => [state, RANGE]))), "Durations are { alert, graze, idle, look, recover, rest } ranges"),
  fleeRadius: POSITIVE,
  group: RANGE,
  length: POSITIVE,
  lieDown: POSITIVE,
  maxForestDepth: rule(value => value === null || isNonNegative(value), "World units >= 0, or null: unlimited"),
  maxSlopeDegrees: rule(value => isPositive(value) && (value as number) < 90, "Degrees in (0, 90)"),
  minRegionArea: POSITIVE,
  personalSpace: POSITIVE,
  reaction: RANGE,
  run: GAIT,
  safeDistance: POSITIVE,
  sizeJitter: SHARE,
  standRadius: POSITIVE,
  trot: GAIT,
  turnRate: POSITIVE,
  walk: GAIT,
  wanderDistance: RANGE
};

const BIRD_COLORS = ["back", "beak", "belly", "breast", "cap", "covert", "eye", "tail", "throat", "wing", "wingTip"];
const WING_STATION = isRecord({ lead: NUMBER, span: SHARE, tip: SHARE, trail: NUMBER });
const BIRD_SHAPE_RULES: FieldRules = {
  beakLength: POSITIVE,
  bodyLength: POSITIVE,
  bodyRadius: POSITIVE,
  colors: rule(isRecord(Object.fromEntries(BIRD_COLORS.map(part => [part, COLOR]))), "Every bird part colour"),
  primaries: rule(isOneOf([3, 6]), "3 or 6 primaries"),
  primaryNotch: SHARE,
  tailFork: SHARE,
  tailLength: POSITIVE,
  tailWidth: POSITIVE,
  wing: rule(value => Array.isArray(value) && value.length >= 2 && value.every(WING_STATION),
    "Wing stations { lead, span, tip, trail }")
};
const BIRD_RULES: FieldRules = {
  altitude: RANGE,
  circling: SHARE,
  flapAmplitude: POSITIVE,
  flapRate: POSITIVE,
  flockMax: rule(isPositiveCount, "A whole number > 0"),
  flockMin: rule(isPositiveCount, "A whole number > 0"),
  glideDihedral: NUMBER,
  glideFold: SHARE,
  glideShare: SHARE,
  habitat: rule(isRecord({ forest: SHARE, grass: SHARE, water: SHARE }), "Habitat { forest, grass, water } shares"),
  perches: rule(isOneOf(["canopy", "ground", "both", "none"]), "canopy, ground, both or none"),
  shape: rule(isRecord(BIRD_SHAPE_RULES), "A bird shape (see BirdShapeTuning)"),
  size: POSITIVE,
  speed: POSITIVE,
  turnRate: POSITIVE
};

const WING_OUTLINE = rule(isRecord({
  keys: rule(isProfile, "Radius keys [angle, radius] with increasing angles"),
  scallopDepth: optional(isShare, "A share in 0..1"),
  scallops: optional(isPositiveCount, "A whole number > 0")
}), "A wing outline { keys, scallopDepth?, scallops? }");
const WING_STYLE = isRecord({
  base: COLOR, baseStrength: SHARE, fringe: COLOR, margin: COLOR, marginWidth: SHARE, vein: COLOR, veinStrength: SHARE
});
const WING_SIDE = rule(isRecord({ style: rule(WING_STYLE, "A wing style") }), "A wing side { style }");
const BUTTERFLY_RULES: FieldRules = {
  body: COLOR,
  bodyLight: COLOR,
  cruise: RANGE,
  flapRate: POSITIVE,
  glide: SHARE,
  habitat: rule(isRecord({ edge: SHARE, flowers: SHARE, meadow: SHARE, water: SHARE }),
    "Habitat { edge, flowers, meadow, water } shares"),
  shape: rule(isRecord({ fore: WING_OUTLINE, hind: WING_OUTLINE }), "A wing shape { fore, hind }"),
  size: POSITIVE,
  speed: POSITIVE,
  under: WING_SIDE,
  upper: WING_SIDE
};

const FISH_RULES: FieldRules = {
  accent: COLOR,
  back: COLOR,
  belly: COLOR,
  body: rule(value => Array.isArray(value) && value.length >= 3 && value.every(isPositive),
    "Half heights per station (positive)"),
  burst: POSITIVE,
  coldWater: rule(value => typeof value === "boolean", "true or false"),
  cruise: POSITIVE,
  depth: RANGE,
  fin: COLOR,
  length: POSITIVE,
  marking: rule(isOneOf(["bands", "bars", "eyeband", "none", "stripe", "twotone"]), "A known fish marking"),
  school: RANGE,
  sheen: SHARE,
  side: COLOR,
  thickness: POSITIVE,
  tail: rule(isOneOf(["forked", "lunate", "round"]), "forked, lunate or round"),
  wag: POSITIVE
};

const FIN = rule(isRecord({
  chord: PROFILE, chordDirection: VEC3, root: VEC3, span: POSITIVE, spanDirection: VEC3, sweep: PROFILE,
  thickness: PROFILE
}), "A fin { chord, chordDirection, root, span, spanDirection, sweep, thickness }");
const WHALE_RULES: FieldRules = {
  blowhole: SHARE,
  bodyEnd: SHARE,
  bottom: PROFILE,
  dorsal: FIN,
  fluke: FIN,
  length: POSITIVE,
  pectoral: FIN,
  top: PROFILE,
  width: PROFILE
};

const PLANT_RULES: FieldRules = {
  blossom: optional(isColor, "A colour is [r, g, b] in 0..1"),
  crownRadius: POSITIVE,
  foliage: COLOR,
  form: rule(isOneOf(["bush", "flower", "column", "tree", "weeping", "palm", "bonsai", "topiary"]),
    "A known plant form"),
  height: POSITIVE,
  leafLength: POSITIVE,
  leafWidth: POSITIVE
};

const ownsKind = (owner: string) => (entry: Fields, kind: string) => kind === owner && entry.retired !== true;
const byKey = (entry: Fields) => entry.key;
const plantSpecies = (entry: Fields) => {
  const decoration = entry.decoration;
  return isPlainObject(decoration) && isPlainObject(decoration.plant) ? decoration.plant.species : undefined;
};

/** Every tuning sidecar; the entries named by `owns` reference it as `sidecars.tuning`. */
export const TUNING_SIDECAR_RULES: readonly TuningSidecarRule[] = [
  { owns: ownsKind("animal"), path: "tuning/wildlife-profiles.json", recordKey: byKey, rules: WILDLIFE_RULES },
  { owns: ownsKind("bird"), path: "tuning/models/birds.json", recordKey: byKey, rules: BIRD_RULES },
  { owns: ownsKind("butterfly"), path: "tuning/models/butterflies.json", recordKey: byKey, rules: BUTTERFLY_RULES },
  { owns: ownsKind("fish"), path: "tuning/models/fish.json", recordKey: byKey, rules: FISH_RULES },
  { owns: ownsKind("whale"), path: "tuning/models/whales.json", recordKey: byKey, rules: WHALE_RULES },
  {
    owns: (entry, kind) => kind === "decoration" && plantSpecies(entry) !== undefined,
    path: "tuning/models/plants.json",
    recordKey: plantSpecies,
    rules: PLANT_RULES
  }
];

const tuningPath = (entry: Fields) => {
  const sidecars = entry.sidecars;
  return isPlainObject(sidecars) && isPlainObject(sidecars.tuning) ? sidecars.tuning.path : undefined;
};

/** Record keys the entries expect from the sidecar; reports owners that do not reference it. */
const expectedKeys = (sidecar: TuningSidecarRule, files: readonly CatalogDataFile[], sink: IssueSink) => {
  const keys = new Set<string>();
  for (const file of files) {
    if (!Array.isArray(file.entries)) continue;
    file.entries.forEach((entry: unknown, index) => {
      if (!isPlainObject(entry) || !sidecar.owns(entry, file.kind)) return;
      if (tuningPath(entry) !== sidecar.path)
        sink.add("sidecar", `${file.file}[${index}].sidecars.tuning`, `Must reference ${sidecar.path}`);
      keys.add(String(sidecar.recordKey(entry)));
    });
  }
  return keys;
};

const checkSidecar = (
  sidecar: TuningSidecarRule, data: unknown, files: readonly CatalogDataFile[], sink: IssueSink
) => {
  const keys = expectedKeys(sidecar, files, sink);
  checkPlainJson(data, sidecar.path, sink);
  if (!isPlainObject(data)) {
    sink.add("shape", sidecar.path, "A tuning sidecar is a record keyed by entry key");
    return;
  }
  for (const key of keys)
    if (!(key in data)) sink.add("sidecar", `${sidecar.path}.${key}`, "Missing record of a referencing entry");
  for (const [key, record] of Object.entries(data)) {
    if (!keys.has(key)) sink.add("sidecar", `${sidecar.path}.${key}`, "No entry references this record");
    checkFields(record, `${sidecar.path}.${key}`, sink, sidecar.rules, "a tuning record");
  }
};

/**
 * Runtime data validation of the tuning sidecars (Node check, tests): plain JSON, one record per referencing entry
 * and no orphan, every record passing its field rules, and every owning entry referencing its sidecar.
 */
export const validateTuningSidecars = (
  files: readonly CatalogDataFile[], read: (path: string) => unknown
): CatalogIssue[] => {
  const sink = createIssueSink();
  for (const sidecar of TUNING_SIDECAR_RULES) checkSidecar(sidecar, read(sidecar.path), files, sink);
  return sink.issues;
};
