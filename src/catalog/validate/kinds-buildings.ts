import { isPlainObject, isSafeCount } from "../../validation/index.ts";
import { checkFields, type FieldRules, rule } from "./fields.ts";
import type { PayloadCheck } from "./kinds.ts";
import { checkContentRef } from "./refs.ts";

const BUILDING_RULES: FieldRules = {
  placeable: rule(value => typeof value === "boolean", "A boolean")
};

/** Buildings: the persisted BuildingType code; nation names are keyed by nation. */
const checkBuilding: PayloadCheck = (payload, path, sink, context, entry) => {
  const fields = checkFields(payload, path, sink, BUILDING_RULES, "{ placeable }");
  const entryPath = path.replace(/\.building$/, "");
  if (!isSafeCount(entry.code)) sink.add("payload", `${entryPath}.code`, "The BuildingType code is required");
  if (fields?.placeable === true && entry.retired === true)
    sink.add("payload", `${path}.placeable`, "A retired building is never placeable");
  const variants = isPlainObject(entry.text) && isPlainObject(entry.text.variants) ? entry.text.variants : {};
  for (const nation of Object.keys(variants))
    checkContentRef(`nation:${nation}`, ["nation"], `${entryPath}.text.variants.${nation}`, sink, context);
};

export const BUILDING_KIND_RULES = { building: { check: checkBuilding, payload: "building" } } as const;
