import { isFiniteNumber, isPlainObject } from "../../validation/index.ts";
import type { EntryContext } from "./entry.ts";
import { checkFields, type FieldRules, isListOf, optional, rule } from "./fields.ts";
import type { IssueSink } from "./issues.ts";
import type { PayloadCheck } from "./kinds.ts";
import { allowedPathTokens, checkAssetRef, checkContentRef } from "./refs.ts";

const isPositive = (value: unknown) => isFiniteNumber(value) && value > 0;
const isNonNegative = (value: unknown) => isFiniteNumber(value) && value >= 0;

const HULL_RULES: FieldRules = {
  beam: rule(isPositive, "A positive width"),
  length: rule(isPositive, "A positive length"),
  oar: optional(isPlainObject, "{ inboard, length }"),
  overallBeam: optional(isPositive, "A positive width"),
  overallLength: optional(isPositive, "A positive length"),
  scale: optional(isPositive, "A positive render scale"),
  spacing: optional(isNonNegative, "A non-negative spacing")
};
const OAR_RULES: FieldRules = {
  inboard: rule(isNonNegative, "A non-negative length"),
  length: rule(isPositive, "A positive length")
};
const CAPACITY_RULES: FieldRules = {
  boxes: rule(value => Number.isSafeInteger(value) && (value as number) >= 0, "Ware boxes on deck"),
  passengers: rule(value => Number.isSafeInteger(value) && (value as number) >= 0, "Units on deck")
};
const SHIP_RULES: FieldRules = {
  builtBy: optional(value => typeof value === "string", "A building id"),
  capacity: optional(isPlainObject, "Deck capacity { passengers, boxes }"),
  hull: optional(isPlainObject, "A hull contract"),
  hullOf: optional(value => typeof value === "string", "A ship id"),
  liveries: rule(isListOf(["enemy", "nation", "neutral"]), "enemy, nation or neutral"),
  nationIcons: optional(isPlainObject, "Nation key → asset reference"),
  neutralIcons: optional(isPlainObject, "Nation key → asset reference")
};

const checkIcons = (
  value: unknown, path: string, sink: IssueSink, context: EntryContext, tokens: ReadonlySet<string>
) => {
  if (value === undefined) return;
  for (const [nation, icon] of Object.entries(value as Record<string, unknown>)) {
    checkContentRef(`nation:${nation}`, ["nation"], `${path}.${nation}`, sink, context);
    checkAssetRef(icon, `${path}.${nation}`, tokens, sink);
  }
};

/** Ships and boats: exactly one of an own hull or a shared hull (`hullOf` another ship). */
const checkShip: PayloadCheck = (payload, path, sink, context, entry) => {
  const fields = checkFields(payload, path, sink, SHIP_RULES, "{ liveries, hull? | hullOf? }");
  if (!fields) return;
  if ((fields.hull === undefined) === (fields.hullOf === undefined))
    sink.add("payload", path, "A ship has either its own hull or hullOf another ship");
  const hull = fields.hull === undefined ? null : checkFields(fields.hull, `${path}.hull`, sink, HULL_RULES, "a hull");
  if (hull?.oar !== undefined) checkFields(hull.oar, `${path}.hull.oar`, sink, OAR_RULES, "{ inboard, length }");
  if (fields.capacity !== undefined)
    checkFields(fields.capacity, `${path}.capacity`, sink, CAPACITY_RULES, "{ passengers, boxes }");
  if (fields.hullOf !== undefined) checkContentRef(fields.hullOf, ["ship", "boat"], `${path}.hullOf`, sink, context);
  if (fields.builtBy !== undefined) checkContentRef(fields.builtBy, ["building"], `${path}.builtBy`, sink, context);
  const tokens = allowedPathTokens(entry.variants);
  checkIcons(fields.nationIcons, `${path}.nationIcons`, sink, context, tokens);
  checkIcons(fields.neutralIcons, `${path}.neutralIcons`, sink, context, tokens);
};

const SHIP = { check: checkShip, payload: "ship" } as const;
export const SHIP_KIND_RULES = { boat: SHIP, ship: SHIP } as const;
