import { secondsToTicks, ticksToSeconds } from "../../time/constants.ts";
import { SCRIPT_LIMITS } from "../constants.ts";
import type { ActorSelector } from "../types/actors.ts";
import type { ScriptRef } from "../types/refs.ts";
import type {
  ActorHandleValue, Expr, FunctionArg, MathOperator, RoundMode, ScriptFunctionKind
} from "../types/values.ts";
import type { EvalFrame, ScriptEngineCore } from "./core.ts";
import type { ScriptEvalScope, ScriptEvalValue } from "./ports.ts";
import { randomBetween } from "./rng.ts";
import { timerRemainingSeconds } from "./timers.ts";
import {
  cleanNumber, defaultElement, isActorHandle, rawEquals, rawOf, sortedHandles
} from "./values.ts";

/**
 * Expression evaluation (design §4.4): float64 `+ - * /`, min/max/mod, the four rounding modes, variables with
 * bounds-checked indexes, responses, loop locals and the read-only functions. Engine-owned functions are answered
 * here; world functions go to the port. Division by zero yields 0 with a log line; NaN/Infinity never escape.
 */

const asNumber = (value: ScriptEvalValue) => typeof value === "number" ? value : 0;

/** `round` = half away from zero, `trunc` toward zero (design m11). */
const roundNumber = (mode: RoundMode, value: number) => {
  if (mode === "floor") return Math.floor(value);
  if (mode === "ceil") return Math.ceil(value);
  if (mode === "trunc") return Math.trunc(value);
  return Math.sign(value) * Math.round(Math.abs(value));
};

const divide = (core: ScriptEngineCore, a: number, b: number, op: "/" | "mod") => {
  if (b !== 0) return op === "/" ? a / b : a % b;
  core.log("divisionByZero", `${a} ${op} 0`);
  return 0;
};

const applyMath = (core: ScriptEngineCore, op: MathOperator, a: number, b: number) => {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (op === "min") return Math.min(a, b);
  if (op === "max") return Math.max(a, b);
  return divide(core, a, b, op);
};

const checkedNumber = (core: ScriptEngineCore, value: number) => {
  if (!Number.isFinite(value)) core.log("notANumber", String(value));
  return cleanNumber(value);
};

const readVariable = (core: ScriptEngineCore, frame: EvalFrame, expr: Extract<Expr, { k: "var" }>) => {
  const stored = core.state.values[expr.variable.id];
  if (!stored) {
    core.log("unknownReference", `variable ${expr.variable.id}`);
    return null;
  }
  if (!expr.index) return stored.value as ScriptEvalValue;
  if (!Array.isArray(stored.value)) return stored.value as ScriptEvalValue;
  const index = asNumber(evaluateExpr(core, frame, expr.index));
  const items = stored.value as readonly unknown[];
  if (Number.isInteger(index) && index >= 0 && index < items.length) return items[index] as ScriptEvalValue;
  core.log("arrayIndex", `${expr.variable.id}[${index}]`);
  return defaultElement(stored.type);
};

/** Evaluates one expression in a frame (a run, or the empty frame for slot filters and quest checks). */
export const evaluateExpr = (core: ScriptEngineCore, frame: EvalFrame, expr: Expr): ScriptEvalValue => {
  switch (expr.k) {
    case "lit": return expr.value;
    case "list": return expr.items.map(item => evaluateExpr(core, frame, item));
    case "var": return readVariable(core, frame, expr);
    case "ref": return expr;
    case "resp": return rawOf(frame.context[expr.key]);
    case "cell": return frame.cell?.[expr.key] ?? null;
    case "local": return rawOf(frame.locals[expr.name]);
    case "math": {
      const a = asNumber(evaluateExpr(core, frame, expr.a));
      const b = asNumber(evaluateExpr(core, frame, expr.b));
      return checkedNumber(core, applyMath(core, expr.op, a, b));
    }
    case "round": return checkedNumber(core, roundNumber(expr.mode, asNumber(evaluateExpr(core, frame, expr.of))));
    case "fn": return evaluateFunction(core, frame, expr.fn, expr.args);
    case "text": return expr.text;
  }
};

const isExpr = (arg: FunctionArg | undefined): arg is Expr => arg !== undefined && "k" in arg;

const argValue = (core: ScriptEngineCore, frame: EvalFrame, arg: FunctionArg | undefined) =>
  isExpr(arg) ? evaluateExpr(core, frame, arg) : null;

const refId = (arg: FunctionArg | undefined) => {
  if (!isExpr(arg) || arg.k !== "ref") return null;
  return (arg as ScriptRef).id;
};

const arrayOf = (core: ScriptEngineCore, arg: FunctionArg | undefined): readonly unknown[] => {
  const id = refId(arg);
  const value = id === null ? undefined : core.state.values[id]?.value;
  return Array.isArray(value) ? value : [];
};


type EngineFunction = (core: ScriptEngineCore, frame: EvalFrame, args: Record<string, FunctionArg>) =>
  ScriptEvalValue;

const ENGINE_FUNCTIONS: Partial<Record<ScriptFunctionKind, EngineFunction>> = {
  contains: (core, frame, args) => {
    const value = argValue(core, frame, args.value);
    return arrayOf(core, args.variable).some(item => rawEquals(item as ScriptEvalValue, value));
  },
  elapsedSeconds: core => ticksToSeconds(core.state.scriptTick),
  indexOf: (core, frame, args) => {
    const value = argValue(core, frame, args.value);
    return arrayOf(core, args.variable).findIndex(item => rawEquals(item as ScriptEvalValue, value));
  },
  length: (core, _frame, args) => arrayOf(core, args.variable).length,
  questClaims: (core, _frame, args) => core.state.quests[refId(args.quest) ?? ""]?.claimCount ?? 0,
  questState: (core, _frame, args) => core.state.quests[refId(args.quest) ?? ""]?.state ?? "inactive",
  random: (core, frame, args) => randomBetween(core.nextRandomUnit(),
    asNumber(argValue(core, frame, args.min)), asNumber(argValue(core, frame, args.max))),
  timerRemaining: (core, _frame, args) => timerRemainingSeconds(core.state, refId(args.timer))
};

const evaluateFunction = (
  core: ScriptEngineCore, frame: EvalFrame, fn: ScriptFunctionKind, args: Record<string, FunctionArg>
): ScriptEvalValue => {
  const engineFunction = ENGINE_FUNCTIONS[fn];
  if (engineFunction) return engineFunction(core, frame, args);
  const value = core.port.callFunction(fn, args, createEvalScope(core, frame));
  return typeof value === "number" ? checkedNumber(core, value) : value;
};

const liveHandles = (core: ScriptEngineCore, handles: readonly ActorHandleValue[]) =>
  sortedHandles(handles.filter(handle => core.port.isHandleLive(handle)));

const bindingHandles = (core: ScriptEngineCore, actorId: string) => {
  const binding = core.state.actors[actorId];
  if (!binding) return [];
  return binding.members.filter(member => member.state !== "dead" && member.state !== "gone")
    .map(member => member.handle);
};

const variableHandles = (core: ScriptEngineCore, id: string): readonly ActorHandleValue[] => {
  const stored = core.state.values[id];
  if (stored?.type !== "actor" && stored?.type !== "actorGroup") return [];
  return stored.value;
};

/** A response or local holds one handle, or a group (`lastSpawned` after a spawn of several units). */
const handleOf = (value: ScriptEvalValue): ActorHandleValue[] => {
  if (isActorHandle(value)) return [value];
  return Array.isArray(value) ? value.filter(isActorHandle) : [];
};

/**
 * Live members of a selector, sorted by handle. A stale handle (generation changed, object gone) never resolves to
 * the slot's successor (design §6.7).
 */
export const resolveActors = (core: ScriptEngineCore, frame: EvalFrame, selector: ActorSelector) => {
  switch (selector.kind) {
    case "instance": return liveHandles(core, bindingHandles(core, selector.actor.id));
    case "variable": return liveHandles(core, variableHandles(core, selector.variable.id));
    case "response": return liveHandles(core, handleOf(rawOf(frame.context[selector.key])));
    case "local": return liveHandles(core, handleOf(rawOf(frame.locals[selector.name])));
    default:
      return sortedHandles(core.port.queryActors(selector, SCRIPT_LIMITS.forEachMax, createEvalScope(core, frame)));
  }
};

export const createEvalScope = (core: ScriptEngineCore, frame: EvalFrame): ScriptEvalScope => ({
  evaluate: expr => evaluateExpr(core, frame, expr),
  resolveActors: selector => resolveActors(core, frame, selector),
  runId: frame.id
});

/** Whole script ticks of an expression in seconds (waits, timer starts); never negative. */
export const evaluateTicks = (core: ScriptEngineCore, frame: EvalFrame, expr: Expr) =>
  secondsToTicks(asNumber(evaluateExpr(core, frame, expr)));
