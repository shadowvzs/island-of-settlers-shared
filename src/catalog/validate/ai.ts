import {
  arrayOf, boolean, type Check, type CheckFields, checkValue, enumOf, integer, isPlainObject, objectOf, optional,
  recordOf, string
} from "../../validation/index.ts";
import { AI_POSTURES, KEY_PATTERN } from "../constants.ts";
import { applyProgramOverlay, isProgramOverlay } from "../ai/program-overlay.ts";
import type {
  BuildGoal, BuildGoalStep, BuildProgram, BuildProgramOverlay, PostureStockTarget
} from "../types/ai.ts";
import type { BuildingRules } from "../types/building-data.ts";
import type { WareAmounts } from "../types/units.ts";
import type { CatalogDataFile } from "./index.ts";
import { type CatalogIssue, type CatalogIssueCode, createIssueSink, type Fields } from "./issues.ts";
import { checkPlainJson } from "./json.ts";

const MAX_GOALS = 32;
const MAX_STOCK_TARGET = 1000;
const MAX_FACTOR_PERCENT = 1000;
const MAX_TARGET_COUNT = 60;
const MAX_TARGET_STEPS = 8;
const MAX_WEIGHT = 1000;
/** A style's offensive terms scale its level's row between a tenth and ten times (`StyleStrategy`). */
const MIN_STYLE_PERCENT = 10;
const STYLE_RAIDS = ["always", "level", "never"] as const;

const key = string({ pattern: KEY_PATTERN });
const percent = integer(0, MAX_FACTOR_PERCENT);
const postureTarget = objectOf(Object.fromEntries(AI_POSTURES.map(posture =>
  [posture, integer(1, MAX_STOCK_TARGET)])));

const targetSteps = arrayOf(objectOf({ buildings: integer(0), count: integer(0, MAX_TARGET_COUNT) }),
  MAX_TARGET_STEPS);

const stylePercent = integer(MIN_STYLE_PERCENT, MAX_FACTOR_PERCENT);

const strategyCheck = objectOf({
  attackRatioPercent: stylePercent,
  attackStrengthPercent: stylePercent,
  calmPosture: enumOf(AI_POSTURES),
  firstAttackPercent: stylePercent,
  raids: enumOf(STYLE_RAIDS),
  retryPercent: stylePercent,
  soldierReserve: integer(0, MAX_TARGET_COUNT)
});

const goalFields = {
  building: string({ pattern: /^building:/ }),
  group: key,
  id: key,
  nations: optional(arrayOf(key)),
  nationTargets: optional(recordOf(targetSteps, { key })),
  requires: optional(arrayOf(objectOf({ count: integer(1, MAX_TARGET_COUNT), goal: key }))),
  target: targetSteps,
  weight: integer(1, MAX_WEIGHT)
};
const groupFields = {
  exposed: boolean,
  postures: objectOf(Object.fromEntries(AI_POSTURES.map(posture => [posture, percent]))),
  style: integer(1, MAX_FACTOR_PERCENT)
};
const stockFields = {
  default: postureTarget,
  resumeMargin: integer(0, MAX_STOCK_TARGET),
  wares: recordOf(postureTarget, { key })
};
const scalarFields = {
  commitmentPercent: integer(0, 100),
  costWeight: integer(0, MAX_WEIGHT),
  strategy: optional(strategyCheck),
  style: key,
  threatPenalty: integer(0, MAX_WEIGHT)
};
/** The fields as optional ones, without `omit` (an overlay's partial goal keeps its id as the record key). */
const optionalFields = (fields: CheckFields, omit?: string): CheckFields => Object.fromEntries(Object.entries(fields)
  .filter(([field]) => field !== omit).map(([field, check]) => [field, optional(check)]));

const programCheck = objectOf({
  ...scalarFields,
  goals: arrayOf(objectOf(goalFields), MAX_GOALS),
  groups: recordOf(objectOf(groupFields), { key }),
  stock: objectOf(stockFields)
});

/** A style overlay (`BuildProgramOverlay`): every field but `extends` and `style` optional, partial goals/groups. */
const overlayCheck = objectOf({
  ...optionalFields(scalarFields),
  addGoals: optional(arrayOf(objectOf(goalFields), MAX_GOALS)),
  extends: key,
  goalOrder: optional(arrayOf(key, MAX_GOALS)),
  goals: optional(recordOf(objectOf(optionalFields(goalFields, "id")), { key })),
  groups: optional(recordOf(objectOf(optionalFields(groupFields)), { key })),
  removeGoals: optional(arrayOf(key, MAX_GOALS)),
  stock: optional(objectOf(optionalFields(stockFields))),
  style: key
});

/** Reads a building's sidecar (`buildings/<key>/<name>.json`) relative to `catalog/data/`. */
type ReadSidecar = (path: string) => unknown;

/** What a build program issue is about; the tools group and word their report by it (`npm run ai:check`). */
export type BuildProgramIssueKind =
  | "missingProducer" | "notPlaceable" | "overlay" | "program" | "requirement" | "shape" | "stockMargin"
  | "stockWare" | "unknownBuilding";

/** A build program issue with its subject as data: the program, and where known the goal, nation and ware. */
export interface BuildProgramIssue extends CatalogIssue {
  /** The goal's building (`building:*`). */
  building?: string;
  /** The goal id (for `missingProducer`: the first goal that needs the ware). */
  goal?: string;
  kind: BuildProgramIssueKind;
  nation?: string;
  /** `missingProducer`: every goal of the nation that needs the ware, in program order. */
  neededBy?: readonly string[];
  /** The program's style key (its file is `ai/<style>.json`). */
  style: string;
  ware?: string;
}

type IssueSubject = Omit<BuildProgramIssue, "code" | "message" | "path" | "style">;

/** The catalog as the build program check and tools read it: active buildings and nations plus the sidecars. */
export interface BuildProgramCatalog {
  /** Active (not retired) building entries by content id. */
  buildings: ReadonlyMap<string, Fields>;
  /** Active nation keys in catalog order. */
  nations: readonly string[];
  readSidecar: ReadSidecar;
}

interface ProgramContext {
  catalog: BuildProgramCatalog;
  file: string;
  issues: BuildProgramIssue[];
  style: string;
}

const activeEntries = (files: readonly CatalogDataFile[], kind: string) => files
  .filter(file => file.kind === kind && Array.isArray(file.entries))
  .flatMap(file => (file.entries as unknown[]).filter(isPlainObject)).filter(entry => entry.retired !== true);

export const buildProgramCatalog = (
  files: readonly CatalogDataFile[], readSidecar: ReadSidecar
): BuildProgramCatalog => ({
  buildings: new Map(activeEntries(files, "building").map(entry => [String(entry.id), entry])),
  nations: activeEntries(files, "nation").map(entry => String(entry.key)),
  readSidecar
});

/** Whether the goal is played by the nation (`nations` absent: every nation). */
export const goalPlaysFor = (goal: BuildGoal, nation: string) => !goal.nations || goal.nations.includes(nation);

/** Whether the active building (`building:*`) can be placed by the nation. */
export const isBuildingPlaceableFor = (catalog: BuildProgramCatalog, building: string, nation: string) => {
  const entry = catalog.buildings.get(building);
  if (!entry || !isPlainObject(entry.building) || entry.building.placeable !== true) return false;
  const variants = isPlainObject(entry.variants) ? entry.variants.nation : undefined;
  return variants === "all" || (Array.isArray(variants) && variants.includes(nation));
};

const sidecarOf = <Value>(catalog: BuildProgramCatalog, building: string, name: string) =>
  catalog.readSidecar(`buildings/${building.slice("building:".length)}/${name}.json`) as Value | undefined;

/** The building's `rules.json` sidecar. */
export const buildingRulesOf = (catalog: BuildProgramCatalog, building: string) =>
  sidecarOf<BuildingRules>(catalog, building, "rules");

/** The wares one work cycle takes or yields for the nation (its override, else the shared recipe). */
export const productionWares = (rules: BuildingRules, nation: string, field: "inputs" | "outputs") =>
  rules.nations?.[nation]?.production?.[field] ?? rules.production?.[field] ?? [];

/** The wares the nation pays to construct the building (its receipt, else the shared cost). */
export const constructionWares = (catalog: BuildProgramCatalog, building: string, nation: string) => {
  const construction = sidecarOf<{ cost?: WareAmounts; nations?: Record<string, WareAmounts> }>(catalog, building,
    "construction");
  const cost = construction?.nations?.[nation] ?? construction?.cost ?? {};
  return Object.keys(cost).filter(ware => (cost[ware] ?? 0) > 0);
};

/**
 * The wares a goal's work needs: its production inputs, except a garrison's (coins promote its soldiers; the
 * building garrisons and claims land without them).
 */
const workInputs = (rules: BuildingRules, nation: string) =>
  (rules.military?.garrison ? [] : productionWares(rules, nation, "inputs"));

/** Ascending own building counts, the first at 0. */
const isTargetCurve = (steps: readonly BuildGoalStep[]) => steps.length > 0 &&
  steps.every((step, at) => at ? step.buildings > steps[at - 1]!.buildings : step.buildings === 0);

const report = (
  context: ProgramContext, code: CatalogIssueCode, path: string, message: string, subject: IssueSubject
) => { context.issues.push({ code, message, path, style: context.style, ...subject }); };

/** Each goal: a known group, a unique placeable building, earlier requirements, ascending target steps from 0. */
const checkGoals = (program: BuildProgram, context: ProgramContext) => {
  const { catalog, file } = context;
  const seenIds = new Set<string>(), seenBuildings = new Set<string>();
  program.goals.forEach((goal, index) => {
    const path = `${file}.goals[${index}]`;
    const subject = { building: goal.building, goal: goal.id };
    const programIssue = { ...subject, kind: "program" } as const;
    if (seenIds.has(goal.id)) report(context, "duplicateId", `${path}.id`, `Duplicate goal ${goal.id}`, programIssue);
    if (seenBuildings.has(goal.building))
      report(context, "duplicateId", `${path}.building`, "One goal per building", programIssue);
    if (!Object.hasOwn(program.groups, goal.group))
      report(context, "reference", `${path}.group`, `Unknown group ${goal.group}`, programIssue);
    if (!catalog.buildings.has(goal.building))
      report(context, "reference", `${path}.building`, `Unknown building ${goal.building}`,
        { ...subject, kind: "unknownBuilding" });
    for (const required of goal.requires ?? [])
      if (!seenIds.has(required.goal))
        report(context, "reference", `${path}.requires`, `${required.goal} is no earlier goal`,
          { ...subject, kind: "requirement" });
    const curves: [string, readonly BuildGoalStep[]][] = [["target", goal.target],
      ...Object.entries(goal.nationTargets ?? {}).map(([nation, steps]): [string, readonly BuildGoalStep[]] =>
        [`nationTargets.${nation}`, steps])];
    for (const [field, steps] of curves)
      if (!isTargetCurve(steps))
        report(context, "payload", `${path}.${field}`, "Steps with ascending own building counts, the first at 0",
          programIssue);
    for (const nation of Object.keys(goal.nationTargets ?? {}))
      if (!catalog.nations.includes(nation) || !goalPlaysFor(goal, nation))
        report(context, "reference", `${path}.nationTargets.${nation}`, `${nation} does not play ${goal.id}`,
          programIssue);
    seenIds.add(goal.id);
    seenBuildings.add(goal.building);
  });
};

/**
 * For one computer nation: every goal it plays is a building of that nation, its requirements are goals the nation
 * plays, and every production input and construction ware of those goals comes from a goal's output (the chains
 * exist; start stock only seeds them).
 */
const checkNationChains = (
  program: BuildProgram, context: ProgramContext, nation: string, producedByAny: Set<string>
) => {
  const { catalog, file } = context;
  const goals = program.goals.filter(goal => goalPlaysFor(goal, nation));
  const played = new Set(goals.map(goal => goal.id));
  const produced = new Set<string>(), needed = new Map<string, string[]>();
  for (const goal of goals) {
    const path = `${file}.goals.${goal.id}`;
    const subject = { building: goal.building, goal: goal.id, nation };
    for (const required of goal.requires ?? [])
      if (!played.has(required.goal))
        report(context, "reference", `${path}.requires`, `${nation} skips ${required.goal}`,
          { ...subject, kind: "requirement" });
    if (!isBuildingPlaceableFor(catalog, goal.building, nation)) {
      report(context, "reference", path, `${goal.building} is no placeable ${nation} building`,
        { ...subject, kind: "notPlaceable" });
      continue;
    }
    const rules = buildingRulesOf(catalog, goal.building);
    if (!rules) continue;
    for (const ware of productionWares(rules, nation, "outputs")) {
      produced.add(ware);
      producedByAny.add(ware);
    }
    const wares = [...workInputs(rules, nation), ...constructionWares(catalog, goal.building, nation)];
    for (const ware of new Set(wares)) needed.set(ware, [...needed.get(ware) ?? [], goal.id]);
  }
  for (const [ware, neededBy] of needed)
    if (!produced.has(ware))
      report(context, "reference", `${file}.goals.${neededBy[0]}`, `No ${nation} goal produces ${ware}`,
        { goal: neededBy[0], kind: "missingProducer", nation, neededBy, ware });
};

/**
 * Every stock target lies above the resume margin (`stockMargin`) and names a ware one of the program's goals
 * produces (`stockWare`).
 */
const checkStockTargets = (program: BuildProgram, produced: ReadonlySet<string>, context: ProgramContext) => {
  const { default: fallback, resumeMargin, wares } = program.stock;
  const aboveMargin = (target: PostureStockTarget) => AI_POSTURES.every(posture => target[posture] > resumeMargin);
  const marginMessage = "Every target lies above the resume margin";
  if (!aboveMargin(fallback))
    report(context, "payload", `${context.file}.stock.default`, marginMessage, { kind: "stockMargin" });
  for (const [ware, target] of Object.entries(wares)) {
    const path = `${context.file}.stock.wares.${ware}`;
    if (!aboveMargin(target)) report(context, "payload", path, marginMessage, { kind: "stockMargin", ware });
    if (!produced.has(ware))
      report(context, "reference", path, `No goal produces ${ware}`, { kind: "stockWare", ware });
  }
};

const checkProgram = (raw: unknown, context: ProgramContext) => {
  const { catalog, file, style } = context;
  if (!reportShape(raw, programCheck, context)) return;
  const program = raw as BuildProgram;
  if (program.style !== style)
    report(context, "payload", `${file}.style`, `The file of style ${style} names another style`, { kind: "program" });
  checkGoals(program, context);
  const produced = new Set<string>();
  for (const nation of catalog.nations) checkNationChains(program, context, nation, produced);
  checkStockTargets(program, produced, context);
};

const reportShape = (raw: unknown, check: Check, context: ProgramContext) => {
  const sink = createIssueSink();
  checkPlainJson(raw, context.file, sink);
  const shape = checkValue(check, raw, context.file);
  for (const issue of shape) sink.add("shape", issue.path, issue.message);
  for (const issue of sink.issues) report(context, issue.code, issue.path, issue.message, { kind: "shape" });
  return shape.length === 0;
};

const reportUnknown = (context: ProgramContext, field: string, ids: readonly string[], known: ReadonlySet<string>) => {
  for (const id of ids)
    if (!known.has(id))
      report(context, "reference", `${context.file}.${field}`, `${id} is no goal or group of the base program`,
        { goal: id, kind: "overlay" });
};

/** Every id an overlay names exists where it must (base goals and groups), and `goalOrder` lists each goal once. */
const checkOverlayIds = (overlay: BuildProgramOverlay, base: BuildProgram, context: ProgramContext) => {
  const baseGoals = new Set(base.goals.map(goal => goal.id));
  reportUnknown(context, "removeGoals", overlay.removeGoals ?? [], baseGoals);
  reportUnknown(context, "goals", Object.keys(overlay.goals ?? {}), baseGoals);
  reportUnknown(context, "groups", Object.keys(overlay.groups ?? {}), new Set(Object.keys(base.groups)));
  for (const goal of overlay.addGoals ?? [])
    if (baseGoals.has(goal.id))
      report(context, "duplicateId", `${context.file}.addGoals`, `${goal.id} is already a base goal`,
        { goal: goal.id, kind: "overlay" });
  if (!overlay.goalOrder) return;
  const removed = new Set(overlay.removeGoals ?? []);
  const added = (overlay.addGoals ?? []).map(goal => goal.id);
  const resulting = [...[...baseGoals].filter(id => !removed.has(id)), ...added].sort().join();
  if ([...overlay.goalOrder].sort().join() !== resulting)
    report(context, "payload", `${context.file}.goalOrder`, "Every resulting goal id exactly once",
      { kind: "overlay" });
};

/** The whole program of an overlay file, or undefined when it cannot be resolved (its issues are reported). */
const resolveOverlay = (raw: unknown, programs: Readonly<Record<string, unknown>>, context: ProgramContext) => {
  if (!reportShape(raw, overlayCheck, context)) return undefined;
  const overlay = raw as BuildProgramOverlay;
  const base = programs[overlay.extends];
  if (!isPlainObject(base) || isProgramOverlay(base) || checkValue(programCheck, base, "").length) {
    report(context, "reference", `${context.file}.extends`, `${overlay.extends} is no whole, valid program`,
      { kind: "overlay" });
    return undefined;
  }
  const issues = context.issues.length;
  checkOverlayIds(overlay, base as unknown as BuildProgram, context);
  if (context.issues.length > issues) return undefined;
  return applyProgramOverlay(base as unknown as BuildProgram, overlay);
};

/**
 * Runtime data validation of the computer factions' build programs (`data/ai/<style>.json`, Node check and tests):
 * the shape, unique goals in build order, known groups and buildings, and for every nation the goal buildings it
 * places and closed production and construction chains. `programs` is keyed by style; an overlay (`extends`, EAI5a)
 * is checked for its shape and ids, then validated as the whole program it resolves to. Every issue names its
 * program, kind and subject, so `npm run ai:check` groups them without parsing messages.
 */
export const validateBuildPrograms = (
  files: readonly CatalogDataFile[], readSidecar: ReadSidecar, programs: Readonly<Record<string, unknown>>
): BuildProgramIssue[] => {
  const catalog = buildProgramCatalog(files, readSidecar);
  const issues: BuildProgramIssue[] = [];
  for (const [style, raw] of Object.entries(programs)) {
    const context = { catalog, file: `ai/${style}.json`, issues, style };
    const program = isProgramOverlay(raw) ? resolveOverlay(raw, programs, context) : raw;
    if (program) checkProgram(program, context);
  }
  return issues;
};
