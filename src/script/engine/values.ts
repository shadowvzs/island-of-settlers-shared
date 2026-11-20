import type { RunContextValue } from "../types/run-state.ts";
import type { ActorHandleSpace, ActorHandleValue, ScriptValue } from "../types/values.ts";
import type { ScriptEvalValue } from "./ports.ts";

/** Raw value helpers of the engine: handles, equality, number hygiene, ScriptValue ↔ raw value. */

const HANDLE_SPACE_ORDER: Readonly<Record<ActorHandleSpace, number>> = Object.freeze({
  actor: 0, animal: 1, building: 2, presentation: 3, prop: 4, shell: 5, ship: 6
});

export const isActorHandle = (value: unknown): value is ActorHandleValue =>
  typeof value === "object" && value !== null && "space" in value && "generation" in value && "id" in value;

export const handleKey = (handle: ActorHandleValue) => `${handle.space}:${handle.id}:${handle.generation}`;

export const sameHandle = (a: ActorHandleValue, b: ActorHandleValue) =>
  a.id === b.id && a.space === b.space && a.generation === b.generation;

/** Deterministic member order (design §4.3): space, then id, then generation. */
export const compareHandles = (a: ActorHandleValue, b: ActorHandleValue) =>
  HANDLE_SPACE_ORDER[a.space] - HANDLE_SPACE_ORDER[b.space] || a.id - b.id || a.generation - b.generation;

/** Sorted, de-duplicated copy of handles (plain objects, so saves stay JSON). */
export const sortedHandles = (handles: readonly ActorHandleValue[]): ActorHandleValue[] => {
  const sorted = handles.map(({ generation, id, space }) => ({ generation, id, space })).sort(compareHandles);
  return sorted.filter((handle, index) => index === 0 || !sameHandle(handle, sorted[index - 1]!));
};

/** Finite, never negative zero: NaN/Infinity become 0 (the caller logs), -0 becomes 0 (JSON-stable saves). */
export const cleanNumber = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return value === 0 ? 0 : value;
};

/** Raw value of a stored variable or response. */
export const rawOf = (value: RunContextValue | undefined): ScriptEvalValue => {
  if (value === undefined) return null;
  if (isActorHandle(value)) return value;
  return value.value;
};

const isRefLike = (value: object): value is { id: string; k: "ref" } =>
  "k" in value && (value as { k: unknown }).k === "ref";

const arraysEqual = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((item, index) => rawEquals(item as ScriptEvalValue, b[index] as ScriptEvalValue));

/** Equality of evaluated values: scalars by value, refs by id, handles by slot and generation, arrays by items. */
export const rawEquals = (a: ScriptEvalValue, b: ScriptEvalValue): boolean => {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) && Array.isArray(b)) return arraysEqual(a, b);
  if (isActorHandle(a) && isActorHandle(b)) return sameHandle(a, b);
  if (isRefLike(a) && isRefLike(b)) return a.id === b.id;
  return false;
};

/** Default element of an array type, returned for out-of-range reads (design §4.5). */
export const defaultElement = (type: ScriptValue["type"]) => type === "string[]" ? "" : 0;

/** Copy of a stored value (arrays copied, so later writes never alias the script's initial value). */
export const copyValue = (value: ScriptValue): ScriptValue => {
  if (Array.isArray(value.value)) return { ...value, value: [...value.value] } as ScriptValue;
  return value;
};
