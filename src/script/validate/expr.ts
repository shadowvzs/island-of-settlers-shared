import { functionDef, isScriptFunctionKind } from "../catalog/functions.ts";
import {
  ALWAYS_AVAILABLE_RESPONSES, ARRAY_ELEMENT_TYPES, CELL_CONTEXT_TYPES, RESPONSE_TYPES, SCRIPT_DEFAULT_LANGUAGES,
  SCRIPT_FALLBACK_LANGUAGE
} from "../constants.ts";
import type { QuestText } from "../types/quest-text.ts";
import type { ScriptRef, ScriptRefKind } from "../types/refs.ts";
import type { EventResponseKey, Expr, ValueType } from "../types/values.ts";
import type { ValidationRun } from "./context.ts";
import type { ExprScope } from "./scope.ts";
import { checkSlots } from "./slots.ts";

/**
 * Static types of expressions (trigger design §4.4): every expression has one value type, or null when only the
 * run knows it (a loop item, an `oldValue`); null is accepted everywhere. Unknown names are reported here.
 */
export type StaticType = ValueType | null;

/** The value type a reference yields when it is used as an operand. */
const REF_VALUE_TYPES: Partial<Record<ScriptRefKind, ValueType>> = {
  actor: "actor", multiboard: "multiboard", quest: "quest", region: "region", timer: "timer"
};

export const refValueType = (run: ValidationRun, ref: ScriptRef): StaticType => {
  if (ref.kind === "content") return run.catalog.entry(ref.id)?.kind === "ware" ? "ware" : "actorType";
  if (ref.kind === "variable") return run.index.variables.get(ref.id)?.type ?? null;
  return REF_VALUE_TYPES[ref.kind] ?? null;
};

export const refKindValueType = (kind: ScriptRefKind): ValueType | undefined => REF_VALUE_TYPES[kind];

export const accepts = (expected: ValueType, actual: StaticType) =>
  actual === null || actual === expected || (expected === "actorGroup" && actual === "actor");

const isAvailable = (scope: ExprScope, key: EventResponseKey) =>
  scope.responses.has(key) || ALWAYS_AVAILABLE_RESPONSES.includes(key);

const responseType = (run: ValidationRun, key: EventResponseKey, scope: ExprScope, path: string): StaticType => {
  if (!isAvailable(scope, key)) run.sink.add("error", "unknownResponse", path, { key });
  if (key !== "oldValue" && key !== "newValue") return RESPONSE_TYPES[key];
  const changed = scope.changedVariable ? run.index.variables.get(scope.changedVariable) : undefined;
  return changed?.type ?? null;
};

const variableType = (
  run: ValidationRun, expr: Extract<Expr, { k: "var" }>, scope: ExprScope, path: string
): StaticType => {
  const type = run.index.variables.get(expr.variable.id)?.type ?? null;
  if (!expr.index) return type;
  expectType(run, expr.index, "number", scope, `${path}.index`);
  if (type === null) return null;
  const element = ARRAY_ELEMENT_TYPES[type];
  if (!element) run.sink.add("error", "slotTypeMismatch", `${path}.index`, { actual: type, expected: "array" });
  return element ?? null;
};

const functionType = (
  run: ValidationRun, expr: Extract<Expr, { k: "fn" }>, scope: ExprScope, path: string
): StaticType => {
  if (!isScriptFunctionKind(expr.fn)) {
    run.sink.add("error", "unknownFunction", `${path}.fn`, { kind: String(expr.fn) });
    return null;
  }
  const def = functionDef(expr.fn);
  if (def.environment) run.environment.reads = true;
  // A cell is evaluated for presentation; `random` would advance the saved script stream (TRG8 note).
  if (scope.cell && expr.fn === "random") run.sink.add("error", "multiboardCellRandom", path, {});
  checkSlots(run, def.args, expr.args, scope, `${path}.args`, { mode: "query", subject: null });
  return def.result;
};

const localType = (run: ValidationRun, name: string, scope: ExprScope, path: string): StaticType => {
  const type = scope.locals.get(name);
  if (type === undefined) run.sink.add("error", "unknownLocal", path, { name });
  return type ?? null;
};

const cellType = (run: ValidationRun, key: keyof typeof CELL_CONTEXT_TYPES, scope: ExprScope, path: string) => {
  if (!scope.cell) run.sink.add("error", "unknownResponse", path, { key });
  return CELL_CONTEXT_TYPES[key];
};

const listType = (run: ValidationRun, expr: Extract<Expr, { k: "list" }>, scope: ExprScope, path: string) => {
  const element = ARRAY_ELEMENT_TYPES[expr.type]!;
  expr.items.forEach((item, index) => expectType(run, item, element, scope, `${path}.items[${index}]`));
  return expr.type;
};

const numeric = (run: ValidationRun, operands: readonly [Expr, string][], scope: ExprScope): ValueType => {
  for (const [operand, path] of operands) expectType(run, operand, "number", scope, path);
  return "number";
};

/** The static type of an expression; reports unknown names, unavailable responses and operand types. */
export const exprType = (run: ValidationRun, expr: Expr, scope: ExprScope, path: string): StaticType => {
  switch (expr.k) {
    case "lit": return expr.type;
    case "list": return listType(run, expr, scope, path);
    case "var": return variableType(run, expr, scope, path);
    case "ref": return refValueType(run, expr);
    case "resp": return responseType(run, expr.key, scope, `${path}.key`);
    case "cell": return cellType(run, expr.key, scope, `${path}.key`);
    case "local": return localType(run, expr.name, scope, `${path}.name`);
    case "math": return numeric(run, [[expr.a, `${path}.a`], [expr.b, `${path}.b`]], scope);
    case "round": return numeric(run, [[expr.of, `${path}.of`]], scope);
    case "fn": return functionType(run, expr, scope, path);
    case "text":
      checkText(run, expr.text, scope, `${path}.text`);
      return "text";
  }
};

/** Reports a type mismatch; a raw string where players read text is its own error (rev m6). */
export const expectType = (run: ValidationRun, expr: Expr, expected: ValueType, scope: ExprScope, path: string) => {
  const actual = exprType(run, expr, scope, path);
  if (expected === "text" && actual === "string") run.sink.add("error", "rawStringInVisibleSlot", path);
  else if (!accepts(expected, actual)) run.sink.add("error", "slotTypeMismatch", path, { actual: actual ?? "?",
    expected });
};

const checkTranslations = (run: ValidationRun, text: QuestText, path: string) => {
  if (text.translationKey !== undefined) return;
  const languages = run.context.languages ?? SCRIPT_DEFAULT_LANGUAGES;
  for (const language of languages) {
    const value = text[language];
    if (language === SCRIPT_FALLBACK_LANGUAGE || (typeof value === "string" && value.trim())) continue;
    run.sink.add("warning", "missingTranslation", path, { language });
  }
};

/** Player-visible text: English required, other languages warned (unless a shipped Lingui id), typed values. */
export const checkText = (run: ValidationRun, text: QuestText, scope: ExprScope, path: string) => {
  if (!text.en.trim()) run.sink.add("error", "missingEnglishText", path);
  checkTranslations(run, text, path);
  for (const [name, value] of Object.entries(text.values ?? {}))
    if (value.kind === "expr") exprType(run, value.expr, scope, `${path}.values.${name}.expr`);
};
