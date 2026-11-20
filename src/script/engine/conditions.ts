import type { ScriptPredicateKind } from "../catalog/predicates.ts";
import type { ScriptRef } from "../types/refs.ts";
import type { CompareOperator, Condition, PredicateArg } from "../types/triggers.ts";
import type { Expr, FunctionArg } from "../types/values.ts";
import type { EvalFrame, ScriptEngineCore } from "./core.ts";
import { createEvalScope, evaluateExpr } from "./expressions.ts";
import type { ScriptEvalValue } from "./ports.ts";
import { timerDependency } from "./timers.ts";
import { rawEquals } from "./values.ts";

/**
 * Condition evaluation (design §4.7) and the dependency keys of `waitUntil` (design §6.5): a waiting run is
 * re-checked when a variable or quest it reads changes; world predicates and functions are re-checked on the
 * one-second cadence, never per tick, except region membership, which the region watch marks when it changes.
 */

const compareOrdered = (op: CompareOperator, a: ScriptEvalValue, b: ScriptEvalValue) => {
  const bothNumbers = typeof a === "number" && typeof b === "number";
  const bothStrings = typeof a === "string" && typeof b === "string";
  if (!bothNumbers && !bothStrings) return false;
  if (op === "<") return a < b;
  if (op === "<=") return a <= b;
  if (op === ">") return a > b;
  return a >= b;
};

const compareValues = (op: CompareOperator, a: ScriptEvalValue, b: ScriptEvalValue) => {
  if (op === "==") return rawEquals(a, b);
  if (op === "!=") return !rawEquals(a, b);
  return compareOrdered(op, a, b);
};

const refArgId = (arg: FunctionArg | PredicateArg | undefined) => {
  if (!arg || !("k" in arg) || arg.k !== "ref") return null;
  return (arg as ScriptRef).id;
};

const literalArg = (core: ScriptEngineCore, frame: EvalFrame, arg: PredicateArg | undefined) => {
  if (!arg || !("k" in arg)) return null;
  return evaluateExpr(core, frame, arg as Expr);
};

type EnginePredicate = (core: ScriptEngineCore, frame: EvalFrame, args: Record<string, PredicateArg>) => boolean;

const ENGINE_PREDICATES: Partial<Record<ScriptPredicateKind, EnginePredicate>> = {
  questIs: (core, frame, args) =>
    (core.state.quests[refArgId(args.quest) ?? ""]?.state ?? "inactive") === literalArg(core, frame, args.state),
  triggerEnabled: (core, _frame, args) => core.isTriggerEnabled(refArgId(args.trigger) ?? ""),
  cinematicActive: core => (core.state.cinematic?.active ?? null) !== null
};

const testPredicate = (
  core: ScriptEngineCore, frame: EvalFrame, pred: ScriptPredicateKind, args: Record<string, PredicateArg>
) => {
  const enginePredicate = ENGINE_PREDICATES[pred];
  if (enginePredicate) return enginePredicate(core, frame, args);
  return core.port.testPredicate(pred, args, createEvalScope(core, frame));
};

export const evaluateCondition = (core: ScriptEngineCore, frame: EvalFrame, condition: Condition): boolean => {
  switch (condition.k) {
    case "all": return condition.of.every(item => evaluateCondition(core, frame, item));
    case "any": return condition.of.some(item => evaluateCondition(core, frame, item));
    case "not": return !evaluateCondition(core, frame, condition.of);
    case "compare":
      return compareValues(condition.op, evaluateExpr(core, frame, condition.a),
        evaluateExpr(core, frame, condition.b));
    case "is": return testPredicate(core, frame, condition.pred, condition.args);
    case "bool": return evaluateExpr(core, frame, condition.of) === true;
  }
};

/** Dependency key of the one-second world cadence. */
export const WORLD_DEPENDENCY = "world";
export const variableDependency = (id: string) => `var:${id}`;
export const questDependency = (id: string) => `quest:${id}`;
/** A cinematic sequence started or ended (CIN4): `cinematicActive` waits wake on the same tick. */
export const CINEMATIC_DEPENDENCY = "cinematic";
/** A watched region's membership changed (TRG4 cell watch): region waits wake on the same tick. */
export const regionDependency = (id: string) => `region:${id}`;

/** World reads whose answer changes exactly when an actor enters or leaves their `region` argument. */
const REGION_PREDICATES: ReadonlySet<string> = new Set(["actorInRegion"]);
const REGION_FUNCTIONS: ReadonlySet<string> = new Set(["countInRegion"]);

const addRegionDependency = (arg: FunctionArg | PredicateArg | undefined, keys: Set<string>) => {
  const id = refArgId(arg);
  if (id !== null) keys.add(regionDependency(id));
};

const ENGINE_FUNCTION_DEPENDENCIES = new Set(["contains", "indexOf", "length", "questClaims", "questState"]);

const collectArgDependencies = (args: Record<string, FunctionArg | PredicateArg>, keys: Set<string>) => {
  for (const arg of Object.values(args)) {
    if ("kind" in arg && arg.kind === "variable" && "variable" in arg) keys.add(variableDependency(arg.variable.id));
    if (!("k" in arg)) continue;
    const expr = arg as Expr;
    if (expr.k === "ref" && expr.kind === "variable") keys.add(variableDependency(expr.id));
    else if (expr.k === "ref" && expr.kind === "quest") keys.add(questDependency(expr.id));
    else if (expr.k === "ref" && expr.kind === "timer") keys.add(timerDependency(expr.id));
    else collectExprDependencies(expr, keys);
  }
};

const collectExprDependencies = (expr: Expr, keys: Set<string>) => {
  switch (expr.k) {
    case "var":
      keys.add(variableDependency(expr.variable.id));
      if (expr.index) collectExprDependencies(expr.index, keys);
      return;
    case "list": expr.items.forEach(item => collectExprDependencies(item, keys)); return;
    case "math": collectExprDependencies(expr.a, keys); collectExprDependencies(expr.b, keys); return;
    case "round": collectExprDependencies(expr.of, keys); return;
    case "fn":
      if (!ENGINE_FUNCTION_DEPENDENCIES.has(expr.fn)) keys.add(WORLD_DEPENDENCY);
      if (REGION_FUNCTIONS.has(expr.fn)) addRegionDependency(expr.args.region, keys);
      collectArgDependencies(expr.args, keys);
      return;
    default: return;
  }
};

const collectConditionDependencies = (condition: Condition, keys: Set<string>) => {
  switch (condition.k) {
    case "all":
    case "any": condition.of.forEach(item => collectConditionDependencies(item, keys)); return;
    case "not": collectConditionDependencies(condition.of, keys); return;
    case "compare": collectExprDependencies(condition.a, keys); collectExprDependencies(condition.b, keys); return;
    case "bool": collectExprDependencies(condition.of, keys); return;
    case "is":
      if (!ENGINE_PREDICATES[condition.pred]) keys.add(WORLD_DEPENDENCY);
      if (condition.pred === "cinematicActive") keys.add(CINEMATIC_DEPENDENCY);
      if (REGION_PREDICATES.has(condition.pred)) addRegionDependency(condition.args.region, keys);
      collectArgDependencies(condition.args, keys);
  }
};

/** Adds the dependency keys of one expression (multiboard cells use the same keys as `waitUntil`). */
export const addExpressionDependencies = (expr: Expr, keys: Set<string>) => collectExprDependencies(expr, keys);

/** Sorted dependency keys of a condition (saved with the wait, so a reload re-checks the same set). */
export const conditionDependencies = (condition: Condition) => {
  const keys = new Set<string>();
  collectConditionDependencies(condition, keys);
  return [...keys].sort();
};
