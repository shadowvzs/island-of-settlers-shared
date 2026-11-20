import { isScriptPredicateKind, PREDICATE_CATALOG } from "../catalog/predicates.ts";
import { SCRIPT_LIMITS } from "../constants.ts";
import type { Condition } from "../types/triggers.ts";
import type { Expr } from "../types/values.ts";
import type { ValidationRun } from "./context.ts";
import { expectType, exprType } from "./expr.ts";
import { deeper, type ExprScope } from "./scope.ts";
import { checkSlots } from "./slots.ts";

/** Conditions (trigger design §4.7): and/or/not groups nested ≤ `nestingDepth`, typed comparisons, predicates. */

const ORDERING = new Set(["<", "<=", ">", ">="]);

const checkCompare = (
  run: ValidationRun, condition: Extract<Condition, { k: "compare" }>, scope: ExprScope, path: string
) => {
  if (ORDERING.has(condition.op)) {
    expectType(run, condition.a, "number", scope, `${path}.a`);
    expectType(run, condition.b, "number", scope, `${path}.b`);
    return;
  }
  const left = exprType(run, condition.a, scope, `${path}.a`);
  const right = exprType(run, condition.b, scope, `${path}.b`);
  if (left !== null && right !== null && left !== right)
    run.sink.add("error", "slotTypeMismatch", `${path}.b`, { actual: right, expected: left });
};

const checkPredicate = (
  run: ValidationRun, condition: Extract<Condition, { k: "is" }>, scope: ExprScope, path: string
) => {
  if (!isScriptPredicateKind(condition.pred)) {
    run.sink.add("error", "unknownPredicate", `${path}.pred`, { kind: String(condition.pred) });
    return;
  }
  const def = PREDICATE_CATALOG[condition.pred];
  if ("environment" in def && def.environment) run.environment.reads = true;
  checkSlots(run, def.args, condition.args, scope, `${path}.args`, { mode: "query", subject: null });
};

export const checkCondition = (run: ValidationRun, condition: Condition, scope: ExprScope, path: string): void => {
  if (scope.depth > SCRIPT_LIMITS.nestingDepth) {
    run.sink.add("error", "nestingTooDeep", path, { limit: SCRIPT_LIMITS.nestingDepth });
    return;
  }
  switch (condition.k) {
    case "all":
    case "any":
      condition.of.forEach((item, index) => checkCondition(run, item, deeper(scope), `${path}.of[${index}]`));
      return;
    case "not": return checkCondition(run, condition.of, deeper(scope), `${path}.of`);
    case "compare": return checkCompare(run, condition, scope, path);
    case "is": return checkPredicate(run, condition, scope, path);
    case "bool": return expectType(run, condition.of, "boolean", scope, `${path}.of`);
  }
};

const exprReadsState = (expr: Expr): boolean => {
  switch (expr.k) {
    case "var":
    case "fn":
      return true;
    case "math": return exprReadsState(expr.a) || exprReadsState(expr.b);
    case "round": return exprReadsState(expr.of);
    case "list": return expr.items.some(exprReadsState);
    default: return false;
  }
};

/** True when a condition reads something that can change (a variable, a function, a world predicate). */
export const conditionHasDependencies = (condition: Condition): boolean => {
  switch (condition.k) {
    case "all":
    case "any":
      return condition.of.some(conditionHasDependencies);
    case "not": return conditionHasDependencies(condition.of);
    case "compare": return exprReadsState(condition.a) || exprReadsState(condition.b);
    case "is": return condition.pred !== "mapKindIs";
    case "bool": return exprReadsState(condition.of);
  }
};
