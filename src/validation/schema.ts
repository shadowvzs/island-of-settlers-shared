import { isFiniteNumber, isForbiddenKey, isPlainObject } from "./guards.ts";
import { createIssueCollector, fieldPath, indexPath, type IssueSink, type ValidationIssue } from "./issues.ts";

/**
 * Small composable structural checks (no schema library: owner decision 2026-11-11). A check appends issues
 * at the failing path; objects are strict (unknown fields fail). Domain validators wrap them with their own
 * codes and messages.
 */
export type SchemaIssueCode =
  | "discriminator" | "enum" | "forbiddenKey" | "length" | "literal" | "pattern" | "range" | "type" | "union"
  | "unknownField";

export type Check = (value: unknown, path: string, sink: IssueSink<SchemaIssueCode>) => void;
export type CheckFields = Readonly<Record<string, Check>>;

/** A predicate check; a failure reports `code` with `message`. */
export const guard = (
  test: (value: unknown) => boolean, message = "Invalid value", code: SchemaIssueCode = "type"
): Check => (value, path, sink) => {
  if (!test(value)) sink.add(code, path, message);
};

export interface StringRule {
  maxLength?: number;
  minLength?: number;
  pattern?: RegExp;
}

const stringProblem = (value: unknown, rule: StringRule): [SchemaIssueCode, string] | null => {
  if (typeof value !== "string") return ["type", "A string is required"];
  if (value.length < (rule.minLength ?? 0) || value.length > (rule.maxLength ?? Infinity))
    return ["length", "The text length is out of range"];
  return rule.pattern && !rule.pattern.test(value) ? ["pattern", "The text has an invalid format"] : null;
};

export const string = (rule: StringRule = {}): Check => (value, path, sink) => {
  const problem = stringProblem(value, rule);
  if (problem) sink.add(problem[0], path, problem[1]);
};

export interface NumberRule {
  max?: number;
  /** Values must stay below this bound. */
  maxExclusive?: number;
  min?: number;
}

const inRange = (value: number, rule: NumberRule) => value >= (rule.min ?? -Infinity) &&
  value <= (rule.max ?? Infinity) && value < (rule.maxExclusive ?? Infinity);

/** A finite number within the rule. */
export const number = (rule: NumberRule = {}): Check => (value, path, sink) => {
  if (!isFiniteNumber(value)) sink.add("type", path, "A finite number is required");
  else if (!inRange(value, rule)) sink.add("range", path, "The number is out of range");
};

/** A safe integer within `min..max` (inclusive). */
export const integer = (min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): Check =>
  (value, path, sink) => {
    if (!Number.isSafeInteger(value)) sink.add("type", path, "A safe integer is required");
    else if ((value as number) < min || (value as number) > max) sink.add("range", path, "The integer is out of range");
  };

export const boolean: Check = guard(value => typeof value === "boolean", "A boolean is required");

export const literal = (expected: unknown): Check =>
  guard(value => value === expected, `Expected ${String(expected)}`, "literal");

export const enumOf = (values: readonly unknown[]): Check =>
  guard(value => values.includes(value), "Not one of the allowed values", "enum");

/** A field that may be absent; present values must pass `check`. */
export const optional = (check: Check): Check => (value, path, sink) => {
  if (value !== undefined) check(value, path, sink);
};

export const nullable = (check: Check): Check => (value, path, sink) => {
  if (value !== null) check(value, path, sink);
};

export const arrayOf = (item: Check, maxLength = Infinity): Check => (value, path, sink) => {
  if (!Array.isArray(value)) {
    sink.add("type", path, "An array is required");
    return;
  }
  if (value.length > maxLength) {
    sink.add("length", path, `At most ${maxLength} entries`);
    return;
  }
  value.forEach((entry, index) => item(entry, indexPath(path, index), sink));
};

/** Unknown fields are refused first, then every field of `fields` is checked (absent ones as undefined). */
export const objectOf = (fields: CheckFields): Check => (value, path, sink) => {
  if (!isPlainObject(value)) {
    sink.add("type", path, "An object is required");
    return;
  }
  for (const key of Object.keys(value))
    if (!Object.hasOwn(fields, key)) sink.add("unknownField", fieldPath(path, key), "Unknown field");
  for (const [key, check] of Object.entries(fields)) check(value[key], fieldPath(path, key), sink);
};

export interface RecordRule {
  /** Checks each key; prototype keys are always refused. */
  key?: Check;
  maxEntries?: number;
}

/** A dynamic-key record: each value passes `entry`. */
export const recordOf = (entry: Check, rule: RecordRule = {}): Check => (value, path, sink) => {
  if (!isPlainObject(value)) {
    sink.add("type", path, "An object is required");
    return;
  }
  const keys = Object.keys(value);
  if (keys.length > (rule.maxEntries ?? Infinity)) {
    sink.add("length", path, `At most ${rule.maxEntries} entries`);
    return;
  }
  for (const key of keys) {
    const keyPath = fieldPath(path, key);
    if (isForbiddenKey(key)) sink.add("forbiddenKey", keyPath, "Reserved key");
    else rule.key?.(key, keyPath, sink);
    entry(value[key], keyPath, sink);
  }
};

/** Passes when any alternative passes; otherwise one `union` issue at the path. */
export const union = (...alternatives: readonly Check[]): Check => (value, path, sink) => {
  if (!alternatives.some(check => checkValue(check, value, path).length === 0))
    sink.add("union", path, "No alternative matches");
};

/** A union discriminated on the string `field`; each variant lists its other fields. */
export const discriminatedUnion = (
  field: string, variants: Readonly<Record<string, CheckFields>>
): Check => (value, path, sink) => {
  const tag = isPlainObject(value) ? value[field] : undefined;
  if (typeof tag !== "string" || !Object.hasOwn(variants, tag)) {
    sink.add("discriminator", fieldPath(path, field), "Unknown variant");
    return;
  }
  objectOf({ ...variants[tag], [field]: literal(tag) })(value, path, sink);
};

/** Runs `check` and returns its issues (empty when the value conforms). */
export const checkValue = (check: Check, value: unknown, path = ""): ValidationIssue<SchemaIssueCode>[] => {
  const collector = createIssueCollector<SchemaIssueCode>();
  check(value, path, collector);
  return collector.issues;
};

/** True when `value` passes `check`; the caller names the type the check describes. */
export const conforms = <T>(check: Check, value: unknown): value is T => checkValue(check, value).length === 0;
