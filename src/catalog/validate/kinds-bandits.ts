import { isPlainObject, isPositiveCount, isSafeCount } from "../../validation/index.ts";
import { checkFields, type FieldRules, isOneOf, rule } from "./fields.ts";
import type { PayloadCheck } from "./kinds.ts";
import { checkContentRef } from "./refs.ts";

const isModel = (value: unknown) => {
  if (!isPlainObject(value)) return false;
  const { capacity, cells, kind, lookouts } = value;
  const known = Object.keys(value).every(field => ["capacity", "cells", "kind", "lookouts"].includes(field));
  return known && Array.isArray(cells) && cells.length === 2 && cells.every(isPositiveCount)
    && ["camp", "stronghold", "tower"].includes(String(kind)) && isSafeCount(lookouts)
    && (capacity === undefined || isPositiveCount(capacity));
};

const BANDIT_RULES: FieldRules = {
  capacity: rule(isPositiveCount, "A positive garrison"),
  militaryBuilding: rule(value => typeof value === "string", "A building id"),
  models: rule(value => Array.isArray(value) && value.length > 0 && value.every(isModel),
    "Layouts { cells, kind, lookouts, capacity? }"),
  tier: rule(isOneOf(["Hard", "Medium", "Very hard"]), "Medium, Hard or Very hard")
};

/** Bandit sites: own code, borrowed military building, layouts; the tier and enclosure texts are required variants. */
const checkBandit: PayloadCheck = (payload, path, sink, context, entry) => {
  const fields = checkFields(payload, path, sink, BANDIT_RULES, "{ capacity, militaryBuilding, models, tier }");
  if (fields) checkContentRef(fields.militaryBuilding, ["building"], `${path}.militaryBuilding`, sink, context);
  const entryPath = path.replace(/\.bandit$/, "");
  if (!isSafeCount(entry.code)) sink.add("payload", `${entryPath}.code`, "A bandit code is required");
  const variants = isPlainObject(entry.text) && isPlainObject(entry.text.variants) ? entry.text.variants : {};
  for (const variant of ["enclosure", "tier"])
    if (!isPlainObject(variants[variant])) sink.add("payload", `${entryPath}.text.variants.${variant}`, "Required");
  const models = isPlainObject(payload) && Array.isArray(payload.models) ? payload.models : [];
  if (models.some(model => isPlainObject(model) && model.kind === "tower") && !isPlainObject(variants.tower))
    sink.add("payload", `${entryPath}.text.variants.tower`, "A scaffold layout needs its name");
};

export const BANDIT_KIND_RULES = { bandit: { check: checkBandit, payload: "bandit" } } as const;
