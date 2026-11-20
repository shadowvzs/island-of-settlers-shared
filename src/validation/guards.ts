/**
 * Value guards shared by every validator (saves, maps, API bodies, catalog, campaign, scripts). Pure CPU code:
 * safe in workers, the server and the client.
 */

/** Keys that could reach an object's prototype when used as a dynamic record key. */
export const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

export const isForbiddenKey = (key: string) => FORBIDDEN_KEYS.has(key);

/**
 * A record-like object: not null, not an array and not a typed array/`DataView`. The prototype is not checked
 * (in-memory saves may hold class instances); `hasPlainPrototype` is the JSON-data check.
 */
export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value);

/** Created by an object literal, `JSON.parse` or `Object.create(null)`. */
export const hasPlainPrototype = (value: object) => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** A safe integer at or above `minimum`. */
export const isSafeIntegerFrom = (value: unknown, minimum: number): value is number =>
  Number.isSafeInteger(value) && (value as number) >= minimum;

/** A non-negative safe integer: counts, ids, codes and indices. */
export const isSafeCount = (value: unknown): value is number => isSafeIntegerFrom(value, 0);

/** A positive safe integer. */
export const isPositiveCount = (value: unknown): value is number => isSafeIntegerFrom(value, 1);

/** A simulation tick: a non-negative safe integer. */
export const isTick = isSafeCount;

export const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/** An array of non-empty strings. */
export const isStringList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(isNonEmptyString);
