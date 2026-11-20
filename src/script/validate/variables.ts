import {
  arrayOf, boolean, type Check, discriminatedUnion, enumOf, guard, nullable, number, objectOf, optional, recordOf,
  string
} from "../../validation/index.ts";
import { ARRAY_ELEMENT_TYPES, CELL_FORMATS, SCRIPT_LIMITS, SCRIPT_NAME_PATTERN } from "../constants.ts";
import { checkNodeShape } from "../shape.ts";
import { expr, playerFilter, questText, scriptId, scriptRef } from "../shape-nodes.ts";
import type { MultiboardDefinition, TimerDefinition } from "../types/multiboards.ts";
import type { QuestText } from "../types/quest-text.ts";
import type { ScriptVariable } from "../types/script.ts";
import type { Expr, ValueType } from "../types/values.ts";
import type { ValidationRun } from "./context.ts";
import { checkText, expectType, exprType } from "./expr.ts";
import { createScope } from "./scope.ts";

/** Map variables (trigger design §4.5, §4.11): names, typed initial values, multiboards and timers. */

const cell = discriminatedUnion("format", {
  ...Object.fromEntries(CELL_FORMATS.filter(format => format !== "fraction").map(format => [format, { expr }])),
  fraction: { current: expr, target: expr }
});
const multiboardShape = objectOf({
  audience: playerFilter,
  cells: recordOf(cell, { maxEntries: SCRIPT_LIMITS.multiboardColumns }),
  columns: arrayOf(objectOf({ align: enumOf(["left", "right", "center"]), header: questText, id: scriptId,
    width: guard(value => value === "auto" || (typeof value === "number" && value > 0)) }),
  SCRIPT_LIMITS.multiboardColumns),
  initiallyCollapsed: boolean,
  initiallyVisible: boolean,
  rows: discriminatedUnion("kind", {
    array: { lengthOf: scriptRef, maxRows: number({ max: SCRIPT_LIMITS.multiboardRows, min: 1 }) },
    players: { filter: playerFilter },
    static: { rows: arrayOf(objectOf({ icon: optional(scriptRef), id: scriptId, label: questText }),
      SCRIPT_LIMITS.multiboardRows) }
  }),
  sort: nullable(objectOf({ columnId: scriptId, direction: enumOf(["asc", "desc"]) })),
  title: questText
});
const timerShape = objectOf({
  autoStart: boolean, periodic: boolean, seconds: number({ max: SCRIPT_LIMITS.maxCount, min: 1 }),
  window: nullable(objectOf({ title: questText }))
});
const isList = (item: (value: unknown) => boolean) => guard(value => Array.isArray(value) && value.every(item));
const isNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const isString = (value: unknown) => typeof value === "string";
const VALUE_SHAPES: Partial<Record<ValueType, Check>> = {
  actor: guard(Array.isArray), actorGroup: guard(Array.isArray), boolean, multiboard: multiboardShape,
  number: guard(isNumber), "number[]": isList(isNumber), region: nullable(scriptRef),
  string: string({ maxLength: SCRIPT_LIMITS.textLength }), "string[]": isList(isString), text: questText,
  timer: timerShape
};

const checkCells = (run: ValidationRun, board: MultiboardDefinition, path: string) => {
  const columnIds = new Set(board.columns.map(column => column.id));
  const scope = { ...createScope(), cell: true };
  for (const [columnId, boardCell] of Object.entries(board.cells)) {
    const cellPath = `${path}.cells.${columnId}`;
    if (!columnIds.has(columnId)) run.sink.add("error", "multiboardUnknownColumn", cellPath, { column: columnId });
    const expressions: readonly Expr[] = "expr" in boardCell ? [boardCell.expr] : [boardCell.current, boardCell.target];
    if (boardCell.format === "countdown") expectType(run, boardCell.expr, "number", scope, cellPath);
    else expressions.forEach(item => exprType(run, item, scope, cellPath));
  }
  for (const column of board.columns)
    if (!Object.hasOwn(board.cells, column.id))
      run.sink.add("error", "multiboardColumnWithoutCell", `${path}.columns`, { column: column.id });
  if (board.sort && !columnIds.has(board.sort.columnId))
    run.sink.add("error", "multiboardUnknownColumn", `${path}.sort.columnId`, { column: board.sort.columnId });
};

const checkMultiboard = (run: ValidationRun, board: MultiboardDefinition, path: string) => {
  const scope = createScope();
  checkText(run, board.title, scope, `${path}.title`);
  board.columns.forEach((column, index) => checkText(run, column.header, scope, `${path}.columns[${index}].header`));
  checkCells(run, board, path);
  const { rows } = board;
  if (rows.kind === "static")
    rows.rows.forEach((row, index) => checkText(run, row.label, scope, `${path}.rows.rows[${index}].label`));
  if (rows.kind !== "array") return;
  const source = run.index.variables.get(rows.lengthOf.id);
  if (source && !ARRAY_ELEMENT_TYPES[source.type] && source.type !== "actorGroup")
    run.sink.add("error", "multiboardRowSourceNotArray", `${path}.rows.lengthOf`);
};

const checkArrayLength = (run: ValidationRun, variable: ScriptVariable, path: string) => {
  const value = variable.initial.value;
  const limit = variable.maxLength ?? SCRIPT_LIMITS.arrayLength;
  if (Array.isArray(value) && value.length > limit) run.sink.add("error", "arrayTooLong", path, { limit });
};

const checkInitialValue = (run: ValidationRun, variable: ScriptVariable, path: string) => {
  const { initial, type } = variable;
  if (initial.type !== type) {
    run.sink.add("error", "variableInitialTypeMismatch", path, { type });
    return;
  }
  if (!checkNodeShape(VALUE_SHAPES[type]!, initial.value, `${path}.value`, run.sink)) return;
  checkArrayLength(run, variable, `${path}.value`);
  if ((type === "actor" || type === "actorGroup") && (initial.value as unknown[]).length > 0)
    run.sink.add("error", "actorVariableNotEmpty", `${path}.value`);
  if (type === "text") checkText(run, initial.value as QuestText, createScope(), `${path}.value`);
  if (type === "multiboard") checkMultiboard(run, initial.value as MultiboardDefinition, `${path}.value`);
  if (type === "timer") {
    const { window } = initial.value as TimerDefinition;
    if (window) checkText(run, window.title, createScope(), `${path}.value.window.title`);
  }
};

const countLimit = (run: ValidationRun, type: ValueType, limit: number) => {
  const count = run.script.variables.filter(variable => variable.type === type).length;
  if (count > limit) run.sink.add("error", "tooMany", "variables", { kind: type, limit });
};

export const checkVariables = (run: ValidationRun) => {
  const names = new Set<string>();
  run.script.variables.forEach((variable, index) => {
    const path = `variables[${index}]`;
    const lowerName = variable.name.toLowerCase();
    if (!SCRIPT_NAME_PATTERN.test(variable.name))
      run.sink.add("error", "invalidVariableName", `${path}.name`, { name: variable.name });
    else if (names.has(lowerName)) run.sink.add("error", "duplicateVariableName", `${path}.name`,
      { name: variable.name });
    names.add(lowerName);
    checkInitialValue(run, variable, `${path}.initial`);
  });
  countLimit(run, "multiboard", SCRIPT_LIMITS.multiboards);
  countLimit(run, "timer", SCRIPT_LIMITS.timers);
};

/** A typed expression outside a run (quest progress); reused by the quest checks. */
export const expectStaticType = (run: ValidationRun, value: Expr, type: ValueType, path: string) =>
  expectType(run, value, type, createScope(), path);
