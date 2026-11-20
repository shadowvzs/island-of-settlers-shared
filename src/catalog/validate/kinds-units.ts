import {
  isFiniteNumber, isNonEmptyString, isPlainObject, isPositiveCount, isStringList
} from "../../validation/index.ts";
import type { EntryContext } from "./entry.ts";
import { checkFields, type FieldRules, isOneOf, optional, rule } from "./fields.ts";
import type { IssueSink } from "./issues.ts";
import type { PayloadCheck } from "./kinds.ts";
import { allowedPathTokens, checkAssetRef, checkContentRef } from "./refs.ts";

const isNonNegative = (value: unknown) => isFiniteNumber(value) && value >= 0;
const isPositive = (value: unknown) => isFiniteNumber(value) && value > 0;

/** A ware key → positive amount record whose keys are catalog wares. */
const checkWareAmounts = (value: unknown, path: string, sink: IssueSink, context: EntryContext) => {
  if (!isPlainObject(value) || Object.keys(value).length === 0) {
    sink.add("payload", path, "A non-empty record of ware key → amount");
    return;
  }
  for (const [ware, amount] of Object.entries(value)) {
    checkContentRef(`ware:${ware}`, ["ware"], `${path}.${ware}`, sink, context);
    if (!isPositiveCount(amount)) sink.add("payload", `${path}.${ware}`, "A positive whole amount");
  }
};

const SETTLER_RULES: FieldRules = {
  job: rule(isNonEmptyString, "The persisted English job string"),
  tool: optional(isNonEmptyString, "A ware key")
};

/** Settlers: the persisted job string and the tool ware. Job uniqueness is checked by the shared unit test. */
const checkSettler: PayloadCheck = (payload, path, sink, context) => {
  const fields = checkFields(payload, path, sink, SETTLER_RULES, "{ job, tool? }");
  if (isNonEmptyString(fields?.tool)) checkContentRef(`ware:${fields.tool}`, ["ware"], `${path}.tool`, sink, context);
};

const PROFILE_RULES: FieldRules = {
  armour: rule(value => Array.isArray(value) && value.length > 0 && value.every(isNonNegative),
    "Armour per rank, non-negative numbers"),
  damage: rule(isPositive, "A positive number"),
  hp: rule(isPositive, "A positive number"),
  interval: rule(isPositive, "A positive number"),
  minimumRange: rule(isNonNegative, "A non-negative number"),
  range: rule(isPositive, "A positive number"),
  sight: rule(isPositive, "A positive sight radius in tiles"),
  speed: rule(isPositive, "A positive number")
};
const PORTRAIT_RULES: FieldRules = {
  nations: rule(value => isStringList(value) && value.length > 0, "Nation keys with their own portraits"),
  path: rule(isPlainObject, "An asset reference"),
  ranked: optional(isPlainObject, "An asset reference")
};
const SOLDIER_RULES: FieldRules = {
  portrait: rule(isPlainObject, "Portrait templates"),
  profile: rule(isPlainObject, "The combat profile"),
  recruitCost: optional(isPlainObject, "Ware key → amount")
};

const checkPortraits = (value: unknown, path: string, sink: IssueSink, context: EntryContext, variants: unknown) => {
  const portrait = checkFields(value, path, sink, PORTRAIT_RULES, "{ nations, path, ranked? }");
  if (!portrait) return;
  const tokens = allowedPathTokens(variants);
  checkAssetRef(portrait.path, `${path}.path`, tokens, sink);
  if (portrait.ranked !== undefined) checkAssetRef(portrait.ranked, `${path}.ranked`, tokens, sink);
  if (isStringList(portrait.nations)) portrait.nations.forEach((nation, index) =>
    checkContentRef(`nation:${nation}`, ["nation"], `${path}.nations[${index}]`, sink, context));
};

/** Soldiers: combat profile (armour per declared rank), portraits and the recruitment cost of active troops. */
const checkSoldier: PayloadCheck = (payload, path, sink, context, entry) => {
  const fields = checkFields(payload, path, sink, SOLDIER_RULES, "{ portrait, profile, recruitCost? }");
  if (!fields) return;
  const profile = checkFields(fields.profile, `${path}.profile`, sink, PROFILE_RULES, "a combat profile");
  const rank = isPlainObject(entry.variants) ? entry.variants.rank : undefined;
  const ranks = isPlainObject(rank) ? (rank.max as number) + 1 : 0;
  if (profile && Array.isArray(profile.armour) && profile.armour.length !== ranks)
    sink.add("payload", `${path}.profile.armour`, "One armour value per declared rank (0..max)");
  checkPortraits(fields.portrait, `${path}.portrait`, sink, context, entry.variants);
  if (fields.recruitCost !== undefined) checkWareAmounts(fields.recruitCost, `${path}.recruitCost`, sink, context);
  if (fields.recruitCost === undefined && entry.retired !== true)
    sink.add("payload", `${path}.recruitCost`, "Active troops have a recruitment cost");
};

const AURA_RULES: FieldRules = {
  factor: rule(isPositive, "A positive share"),
  kind: rule(isOneOf(["arrowReduction", "bowDamage", "meleeDamage", "meleeDodge"]), "An aura kind")
};
const COMMANDER_RULES: FieldRules = {
  aura: rule(isPlainObject, "{ factor, kind }"),
  definition: rule(isNonEmptyString, "The persisted commander definition id"),
  loadout: rule(isOneOf(["axe", "bow", "sword"]), "axe, bow or sword"),
  names: rule(value => isStringList(value) && value.length > 0, "Display names"),
  recruitCost: rule(isPlainObject, "Ware key → amount"),
  role: rule(isOneOf(["defensive", "offensive"]), "defensive or offensive"),
  sight: rule(isPositive, "A positive sight radius in tiles"),
  style: rule(isOneOf(["melee", "ranged"]), "melee or ranged")
};

/** Commanders: one per nation (the key is the nation key). */
const checkCommander: PayloadCheck = (payload, path, sink, context, entry) => {
  const fields = checkFields(payload, path, sink, COMMANDER_RULES, "a commander definition");
  if (!fields) return;
  checkFields(fields.aura, `${path}.aura`, sink, AURA_RULES, "{ factor, kind }");
  checkWareAmounts(fields.recruitCost, `${path}.recruitCost`, sink, context);
  checkContentRef(`nation:${String(entry.key)}`, ["nation"], path.replace(/\.commander$/, ".key"), sink, context);
};

export const UNIT_KIND_RULES = {
  commander: { check: checkCommander, payload: "commander" },
  settler: { check: checkSettler, payload: "settler" },
  soldier: { check: checkSoldier, payload: "soldier" }
} as const;
