import {
  type Check, type CheckFields, checkValue, discriminatedUnion, enumOf, guard, integer, isPlainObject, number,
  recordOf, string
} from "../validation/index.ts";
import { CAMPAIGN_LIMITS } from "./campaign-constants.ts";
import { campaignIssue, type CampaignIssue } from "./campaign-issues.ts";

/**
 * Declarative structural checks for stored campaign documents (repository input, JSON import, API bodies), built
 * on the shared validation kit. Every failing path becomes one `invalidField` error; objects are strict.
 */
export type ShapeCheck = Check;
export type ShapeFields = CheckFields;

const IDENTIFIER = /^[A-Za-z0-9_.:-]+$/;
const LANGUAGE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

export const integerIn = integer;
export const numberIn = (min: number, maxExclusive: number) => number({ maxExclusive, min });
/** Game clock hour, 0 ≤ hour < 24. */
export const hour = numberIn(0, 24);
export const amount = integerIn(1, CAMPAIGN_LIMITS.maxAmount);
export const count = integerIn(0, CAMPAIGN_LIMITS.maxAmount);
export const booleanValue = guard(value => typeof value === "boolean");
export const stringUpTo = (maxLength: number) => string({ maxLength });
export const identifier = string({ maxLength: CAMPAIGN_LIMITS.identifierLength, minLength: 1, pattern: IDENTIFIER });
export const oneOf = enumOf;
export const timestamp = integerIn(0, Number.MAX_SAFE_INTEGER);

export const kindUnion = (variants: Readonly<Record<string, ShapeFields>>) => discriminatedUnion("kind", variants);

/** Identifier → count map (statistics). */
export const countMap = (maxEntries: number): ShapeCheck => recordOf(count, { key: identifier, maxEntries });

/** TranslatableText: a required English string plus other language codes, every value a bounded string. */
export const translatableText = (maxLength: number): ShapeCheck => (value, path, sink) => {
  if (!isPlainObject(value) || typeof value.en !== "string" ||
    Object.keys(value).length > CAMPAIGN_LIMITS.translations) {
    sink.add("type", path, "A translatable text is { en, …languages }");
    return;
  }
  const text = stringUpTo(maxLength);
  for (const [language, entry] of Object.entries(value)) {
    if (!LANGUAGE.test(language)) sink.add("pattern", `${path}.${language}`, "Unknown language code");
    text(entry, `${path}.${language}`, sink);
  }
};

/** Runs `check` on `value` and returns its issues as campaign `invalidField` errors. */
export const checkShape = (check: ShapeCheck, value: unknown, path: string): CampaignIssue[] =>
  checkValue(check, value, path).map(issue => campaignIssue("error", "invalidField", issue.path));

export { arrayOf, discriminatedUnion, guard, literal, nullable, objectOf, optional } from "../validation/index.ts";
