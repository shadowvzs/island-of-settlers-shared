import { isFiniteNumber, isPlainObject, isSafeCount } from "../../validation/index.ts";
import { checkFields, type FieldRules, isOneOf, optional, rule } from "./fields.ts";
import type { PayloadCheck } from "./kinds.ts";

const isBoolean = (value: unknown) => typeof value === "boolean";
export const isPositive = (value: unknown) => isFiniteNumber(value) && (value as number) > 0;
export const isNonNegative = (value: unknown) => isFiniteNumber(value) && (value as number) >= 0;

const LIFE_RULES: FieldRules = {
  adultMeat: optional(isSafeCount, "Whole units"),
  bodyRadius: optional(isNonNegative, "A non-negative number"),
  domain: rule(isOneOf(["render", "sim"]), "render or sim"),
  editor: optional(isPlainObject, "An editor tool choice"),
  growthMinutes: optional(isPositive, "A positive number"),
  shadow: optional(isBoolean, "A boolean"),
  size: optional(isPositive, "A positive number"),
  sizeJitter: optional(isNonNegative, "A non-negative number"),
  weight: optional(isPositive, "A positive share")
};
const EDITOR_RULES: FieldRules = {
  order: rule(isSafeCount, "A non-negative integer"),
  tool: rule(isOneOf(["animal"]), "animal")
};

/** Life: the persisted species index is required; only listed tuning fields are allowed. */
const checkLife: PayloadCheck = (payload, path, sink, _context, entry) => {
  const fields = checkFields(payload, path, sink, LIFE_RULES, "{ domain, … }");
  if (fields?.editor !== undefined) checkFields(fields.editor, `${path}.editor`, sink, EDITOR_RULES, "{ order, tool }");
  if (!isSafeCount(entry.code)) sink.add("payload", path.replace(/\.life$/, ".code"), "A species index");
};

const LIFE = { check: checkLife, payload: "life" } as const;
export const LIFE_KIND_RULES = {
  animal: LIFE, bird: LIFE, butterfly: LIFE, critter: LIFE, fish: LIFE, whale: LIFE
} as const;
