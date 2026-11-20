import { isNonEmptyString, isPlainObject, isPositiveCount, isSafeCount } from "../../validation/index.ts";
import { KEBAB_KEY_PATTERN } from "../constants.ts";
import { checkFields, type FieldRules, isListOf, isOneOf, optional, rule } from "./fields.ts";
import type { PayloadCheck } from "./kinds.ts";
import { checkContentRef } from "./refs.ts";

const DECORATION_USES = ["shop", "editor", "building"];
const DECORATION_FINISHES = ["limestone", "granite", "marble", "native"];
const RELEASE_GATES = ["decoration", "ornamentalPlant", "plantCompletion"];

const PLANT_RULES: FieldRules = {
  form: rule(isOneOf(["roadside", "standalone"]), "roadside or standalone"),
  palette: rule(isOneOf(["default", "yellow", "orange"]), "default, yellow or orange"),
  potted: rule(value => typeof value === "boolean", "A boolean"),
  species: rule(value => isNonEmptyString(value) && KEBAB_KEY_PATTERN.test(value), "A kebab-case species id"),
  variant: rule(isOneOf([0, 1, 2]), "0, 1 or 2")
};

const DECORATION_RULES: FieldRules = {
  maxHeld: rule(isPositiveCount, "A positive integer"),
  nation: rule(isNonEmptyString, "A nation key"),
  plant: optional(isPlainObject, "A plant asset"),
  price: rule(isPositiveCount, "Gems, a positive integer"),
  releaseGate: optional(isOneOf(RELEASE_GATES), `One of ${RELEASE_GATES.join(", ")}`),
  shopAvailable: rule(value => typeof value === "boolean", "A boolean"),
  uses: rule(isListOf(DECORATION_USES), `A non-empty list of ${DECORATION_USES.join(", ")}`)
};

/** Decorations: payload fields, finish variants (the item ids) and shop availability only with the shop use. */
const checkDecoration: PayloadCheck = (payload, path, sink, context, entry) => {
  const fields = checkFields(payload, path, sink, DECORATION_RULES, "{ maxHeld, nation, price, shopAvailable, uses }");
  if (!fields) return;
  if (isNonEmptyString(fields.nation))
    checkContentRef(`nation:${fields.nation}`, ["nation"], `${path}.nation`, sink, context);
  if (fields.plant !== undefined) checkFields(fields.plant, `${path}.plant`, sink, PLANT_RULES, "a plant asset");
  const finishes = isPlainObject(entry.variants) ? entry.variants.finish : undefined;
  if (!isListOf(DECORATION_FINISHES)(finishes))
    sink.add("variants", path.replace(/\.decoration$/, ".variants.finish"), "Decorations declare their finishes");
  const uses = fields.uses as readonly string[];
  if (fields.shopAvailable === true && Array.isArray(uses) && !uses.includes("shop"))
    sink.add("payload", `${path}.shopAvailable`, "Only items with the shop use are sold");
};

const ITEM_RULES: FieldRules = {
  maxHeld: rule(isPositiveCount, "A positive integer"),
  offerKey: rule(value => isNonEmptyString(value) && KEBAB_KEY_PATTERN.test(value), "A kebab-case offer id"),
  price: rule(isPositiveCount, "Gems, a positive integer")
};

const checkItem: PayloadCheck = (payload, path, sink) => {
  checkFields(payload, path, sink, ITEM_RULES, "{ maxHeld, offerKey, price }");
};

const OFFER_RULES: FieldRules = {
  amount: rule(isPositiveCount, "A positive integer"),
  price: rule(isPositiveCount, "Gems, a positive integer"),
  resourceTier: optional(isSafeCount, "A non-negative integer"),
  ware: rule(isNonEmptyString, "A ware key")
};

const checkOffer: PayloadCheck = (payload, path, sink, context) => {
  const fields = checkFields(payload, path, sink, OFFER_RULES, "{ amount, price, ware, resourceTier? }");
  if (fields && isNonEmptyString(fields.ware))
    checkContentRef(`ware:${fields.ware}`, ["ware"], `${path}.ware`, sink, context);
};

export const SHOP_KIND_RULES = {
  decoration: { check: checkDecoration, payload: "decoration" },
  item: { check: checkItem, payload: "item" },
  offer: { check: checkOffer, payload: "offer" }
} as const;
