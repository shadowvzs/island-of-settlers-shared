import { SCRIPT_LIMITS } from "../constants.ts";
import type { ActorSelector } from "../types/actors.ts";
import type { ScriptVariable } from "../types/script.ts";
import type { ActionArg } from "../types/triggers.ts";
import type { ActorHandleValue, Expr, ScriptValue } from "../types/values.ts";
import type { EvalFrame, ScriptEngineCore } from "./core.ts";
import { evaluateExpr, resolveActors } from "./expressions.ts";
import type { ScriptEvalValue } from "./ports.ts";
import { cleanNumber, compareHandles, isActorHandle, sameHandle, sortedHandles } from "./values.ts";

/**
 * Variable actions (design §5.2.6): set, increase/decrease, array append/remove/clear and `storeActor`. Every write
 * builds a new value (the old one stays valid for `oldValue`) and goes through `core.writeVariable`.
 */

type VariableOp = "arrayAppend" | "arrayClear" | "arrayRemoveAt" | "decreaseVariable" | "increaseVariable"
  | "setVariable" | "storeActor";

export const VARIABLE_OPS: ReadonlySet<string> = new Set<VariableOp>([
  "arrayAppend", "arrayClear", "arrayRemoveAt", "decreaseVariable", "increaseVariable", "setVariable", "storeActor"
]);

const isExprArg = (arg: ActionArg | undefined): arg is Expr =>
  typeof arg === "object" && arg !== null && !Array.isArray(arg) && "k" in arg;

const evaluateArg = (core: ScriptEngineCore, frame: EvalFrame, arg: ActionArg | undefined) =>
  isExprArg(arg) ? evaluateExpr(core, frame, arg) : null;

const maxLengthOf = (variable: ScriptVariable) => variable.maxLength ?? SCRIPT_LIMITS.arrayLength;

const handlesOf = (value: ScriptEvalValue): ActorHandleValue[] => {
  if (isActorHandle(value)) return [value];
  if (!Array.isArray(value)) return [];
  return value.filter(isActorHandle);
};

/** Normalises an evaluated value to the variable's type; null when it does not fit. */
const coerce = (variable: ScriptVariable, value: ScriptEvalValue): ScriptValue | null => {
  switch (variable.type) {
    case "number": return typeof value === "number" ? { type: "number", value: cleanNumber(value) } : null;
    case "string": return typeof value === "string" ? { type: "string", value } : null;
    case "boolean": return typeof value === "boolean" ? { type: "boolean", value } : null;
    case "number[]":
      return Array.isArray(value) ? { type: "number[]", value: value.map(item => cleanNumber(Number(item)))
        .slice(0, maxLengthOf(variable)) } : null;
    case "string[]":
      return Array.isArray(value) ? { type: "string[]", value: value.map(String).slice(0, maxLengthOf(variable)) }
        : null;
    case "actor": return { type: "actor", value: sortedHandles(handlesOf(value)).slice(0, 1) };
    case "actorGroup":
      return { type: "actorGroup", value: sortedHandles(handlesOf(value)).slice(0, maxLengthOf(variable)) };
    case "text": return typeof value === "object" && value !== null ? { type: "text", value } as ScriptValue : null;
    case "region": return { type: "region", value: (value ?? null) } as ScriptValue;
    default: return null;
  }
};

const elementFits = (type: ScriptValue["type"], element: ScriptEvalValue) =>
  (type === "number[]" && typeof element === "number") || (type === "string[]" && typeof element === "string");

const withElement = (core: ScriptEngineCore, stored: ScriptValue, index: number, element: ScriptEvalValue) => {
  const items = stored.value as readonly unknown[];
  if (!Number.isInteger(index) || index < 0 || index >= items.length || !elementFits(stored.type, element)) {
    core.log("arrayIndex", `write [${index}]`);
    return null;
  }
  const next = [...items];
  next[index] = typeof element === "number" ? cleanNumber(element) : element;
  return { type: stored.type, value: next } as ScriptValue;
};

const setValue = (core: ScriptEngineCore, frame: EvalFrame, variable: ScriptVariable, stored: ScriptValue,
  args: Record<string, ActionArg>) => {
  const value = evaluateArg(core, frame, args.value);
  if (args.index && Array.isArray(stored.value)) {
    return withElement(core, stored, Number(evaluateArg(core, frame, args.index)), value);
  }
  return coerce(variable, value);
};

const addValue = (core: ScriptEngineCore, frame: EvalFrame, stored: ScriptValue, args: Record<string, ActionArg>,
  sign: 1 | -1) => {
  const amount = Number(evaluateArg(core, frame, args.amount) ?? 0) * sign;
  if (stored.type === "number") return { type: "number", value: cleanNumber(stored.value + amount) } as ScriptValue;
  if (stored.type !== "number[]" || !args.index) return null;
  const index = Number(evaluateArg(core, frame, args.index));
  return withElement(core, stored, index, (stored.value[index] ?? 0) + amount);
};

const appendValue = (core: ScriptEngineCore, frame: EvalFrame, variable: ScriptVariable, stored: ScriptValue,
  args: Record<string, ActionArg>) => {
  if (!Array.isArray(stored.value)) return null;
  const items = stored.value as readonly unknown[];
  if (items.length >= maxLengthOf(variable)) {
    core.log("arrayIndex", `${variable.id} full (${items.length})`);
    return null;
  }
  const element = evaluateArg(core, frame, args.value);
  if (stored.type === "actorGroup") return coerce(variable, [...stored.value, ...handlesOf(element)]);
  if (!elementFits(stored.type, element)) return null;
  return { type: stored.type, value: [...items, element] } as ScriptValue;
};

const removeAt = (core: ScriptEngineCore, frame: EvalFrame, stored: ScriptValue, args: Record<string, ActionArg>) => {
  if (!Array.isArray(stored.value)) return null;
  const index = Number(evaluateArg(core, frame, args.index));
  const items = stored.value as readonly unknown[];
  if (!Number.isInteger(index) || index < 0 || index >= items.length) {
    core.log("arrayIndex", `remove [${index}]`);
    return null;
  }
  return { type: stored.type, value: items.filter((_item, position) => position !== index) } as ScriptValue;
};

const clearValue = (stored: ScriptValue) =>
  Array.isArray(stored.value) ? { type: stored.type, value: [] } as ScriptValue : null;

/** `storeActor` (design §4.3): replace, add to or remove from an actor variable the selector's live members. */
const storeActors = (core: ScriptEngineCore, frame: EvalFrame, variable: ScriptVariable, stored: ScriptValue,
  args: Record<string, ActionArg>) => {
  if (stored.type !== "actor" && stored.type !== "actorGroup") return null;
  const selector = args.selector as ActorSelector | undefined;
  const members = selector ? resolveActors(core, frame, selector) : [];
  const mode = evaluateArg(core, frame, args.mode);
  if (mode === "add") return coerce(variable, [...stored.value, ...members]);
  if (mode === "remove") {
    return coerce(variable, stored.value.filter(handle => !members.some(member => sameHandle(member, handle))));
  }
  return coerce(variable, members);
};

const nextValue = (core: ScriptEngineCore, frame: EvalFrame, op: VariableOp, variable: ScriptVariable,
  stored: ScriptValue, args: Record<string, ActionArg>) => {
  switch (op) {
    case "setVariable": return setValue(core, frame, variable, stored, args);
    case "increaseVariable": return addValue(core, frame, stored, args, 1);
    case "decreaseVariable": return addValue(core, frame, stored, args, -1);
    case "arrayAppend": return appendValue(core, frame, variable, stored, args);
    case "arrayRemoveAt": return removeAt(core, frame, stored, args);
    case "arrayClear": return clearValue(stored);
    case "storeActor": return storeActors(core, frame, variable, stored, args);
  }
};

/** Applies one variable action; false when the target is unknown or the value does not fit (logged). */
export const applyVariableAction = (core: ScriptEngineCore, frame: EvalFrame, op: string,
  args: Record<string, ActionArg>) => {
  const target = args.variable as { id?: string } | undefined;
  const variable = target?.id === undefined ? undefined : core.lookup.variableById.get(target.id);
  const stored = variable ? core.state.values[variable.id] : undefined;
  if (!variable || !stored) {
    core.log("unknownReference", `variable ${target?.id ?? "?"}`);
    return false;
  }
  const value = nextValue(core, frame, op as VariableOp, variable, stored, args);
  if (!value) {
    core.log("actionFailed", `${op} on ${variable.id}`);
    return false;
  }
  core.writeVariable(variable.id, value);
  return true;
};

/**
 * Stores handles an action created (`spawn … store in`, design §5.2.1) in an actor variable, replacing its value;
 * false when the variable is unknown or not an actor variable.
 */
export const storeHandles = (core: ScriptEngineCore, variableId: string, handles: readonly ActorHandleValue[]) => {
  const variable = core.lookup.variableById.get(variableId);
  const stored = variable ? core.state.values[variable.id] : undefined;
  if (!variable || (stored?.type !== "actor" && stored?.type !== "actorGroup")) {
    core.log("unknownReference", `variable ${variableId}`);
    return false;
  }
  core.writeVariable(variable.id, coerce(variable, [...handles])!);
  return true;
};

/** Drops a fully gone handle from every actor variable holding it (owner 28); returns the touched ids. */
export const dropHandleFromVariables = (core: ScriptEngineCore, handle: ActorHandleValue) => {
  const touched: string[] = [];
  for (const variable of core.script.variables) {
    const stored = core.state.values[variable.id];
    if (stored?.type !== "actor" && stored?.type !== "actorGroup") continue;
    if (!stored.value.some(member => sameHandle(member, handle))) continue;
    const value = stored.value.filter(member => !sameHandle(member, handle)).sort(compareHandles);
    core.writeVariable(variable.id, { type: stored.type, value });
    touched.push(variable.id);
  }
  return touched;
};
