import { SCRIPT_LIMITS } from "../constants.ts";
import type {
  MultiboardCell, MultiboardCellContext, MultiboardCellSnapshot, MultiboardCellValue, MultiboardDefinition,
  MultiboardRowSnapshot
} from "../types/multiboards.ts";
import type { QuestText, QuestTextValue } from "../types/quest-text.ts";
import type { Expr } from "../types/values.ts";
import { addExpressionDependencies, variableDependency, WORLD_DEPENDENCY } from "./conditions.ts";
import type { EvalFrame, ScriptEngineCore } from "./core.ts";
import { playerFilterMatches } from "./event-matching.ts";
import { evaluateExpr } from "./expressions.ts";
import type { ScriptEvalValue } from "./ports.ts";
import { cleanNumber } from "./values.ts";

/**
 * Multiboard rows and cells (design §4.11, §6.9): the rows of a row source with their cell context, the evaluation
 * of one cell, the dependency keys a cell reads and the optional leaderboard order. Pure helpers of the runtime.
 */

/** One row of a board at run time: its cell context and the cells evaluated so far (one per column). */
export interface MultiboardRow {
  cells: MultiboardCellSnapshot[];
  context: MultiboardCellContext;
  icon: string | null;
  id: string;
  snapshot: MultiboardRowSnapshot | null;
}

const isQuestText = (value: ScriptEvalValue): value is QuestText =>
  typeof value === "object" && value !== null && !Array.isArray(value)
  && typeof (value as { en?: unknown }).en === "string";

const cellExpressions = (cell: MultiboardCell): Expr[] =>
  cell.format === "fraction" ? [cell.current, cell.target] : [cell.expr];

const textExpressions = (expr: Expr): Expr[] => {
  if (expr.k !== "text") return [];
  return Object.values(expr.text.values ?? {}).filter(value => value.kind === "expr").map(value => value.expr);
};

/** Dependency keys of a cell: `var:<id>`, `quest:<id>` and the one-second `world` cadence (functions, timers). */
export const cellDependencies = (cell: MultiboardCell) => {
  const keys = new Set<string>();
  for (const expr of cellExpressions(cell)) {
    addExpressionDependencies(expr, keys);
    for (const placeholder of textExpressions(expr)) addExpressionDependencies(placeholder, keys);
  }
  return keys;
};

/** Dependency keys of the row source: the array variable, or the world cadence for player rows. */
export const rowSourceDependencies = (definition: MultiboardDefinition) => {
  if (definition.rows.kind === "array") return [variableDependency(definition.rows.lengthOf.id)];
  return definition.rows.kind === "players" ? [WORLD_DEPENDENCY] : [];
};

const row = (id: string, context: Partial<MultiboardCellContext>, icon: string | null = null): MultiboardRow => ({
  cells: [], context: { rowIndex: 0, rowItem: null, rowLabel: null, rowPlayer: null, ...context }, icon, id,
  snapshot: null
});

const humanFactions = (core: ScriptEngineCore) => {
  const factions: number[] = [];
  for (let faction = 0; faction <= SCRIPT_LIMITS.maxFaction; faction++) {
    if (core.port.playerIsHuman(faction)) factions.push(faction);
  }
  return factions;
};

const playerRows = (core: ScriptEngineCore, source: Extract<MultiboardDefinition["rows"], { kind: "players" }>) => {
  const factions = core.port.playerFactions?.() ?? humanFactions(core);
  return factions.filter(faction => playerFilterMatches(core, source.filter, faction))
    .slice(0, SCRIPT_LIMITS.multiboardRows)
    .map((faction, rowIndex) => row(`player-${faction}`, { rowIndex, rowPlayer: faction }));
};

const arrayRows = (core: ScriptEngineCore, source: Extract<MultiboardDefinition["rows"], { kind: "array" }>) => {
  const stored = core.state.values[source.lengthOf.id]?.value;
  const items: readonly unknown[] = Array.isArray(stored) ? stored : [];
  return items.slice(0, source.maxRows).map((item, rowIndex) => {
    const rowItem = typeof item === "number" || typeof item === "string" ? item : null;
    return row(`item-${rowIndex}`, { rowIndex, rowItem });
  });
};

/** The rows of a board in source order: static rows, one per matching player, or one per array element. */
export const buildMultiboardRows = (core: ScriptEngineCore, definition: MultiboardDefinition): MultiboardRow[] => {
  const source = definition.rows;
  if (source.kind === "players") return playerRows(core, source);
  if (source.kind === "array") return arrayRows(core, source);
  return source.rows.map((entry, rowIndex) =>
    row(entry.id, { rowIndex, rowLabel: entry.label }, entry.icon?.id ?? null));
};

/** Number placeholders of a text are evaluated here, so the view needs no engine to show "Planted 3/8". */
const freezeText = (core: ScriptEngineCore, frame: EvalFrame, text: QuestText): QuestText => {
  if (!text.values) return text;
  let frozen: Record<string, QuestTextValue> | null = null;
  for (const [name, value] of Object.entries(text.values)) {
    if (value.kind !== "expr") continue;
    const result = evaluateExpr(core, frame, value.expr);
    if (typeof result !== "number") continue;
    frozen ??= { ...text.values };
    frozen[name] = { kind: "number", value: result };
  }
  return frozen ? { ...text, values: frozen } : text;
};

const cellValue = (core: ScriptEngineCore, frame: EvalFrame, value: ScriptEvalValue): MultiboardCellValue => {
  if (typeof value === "number") return cleanNumber(value);
  if (typeof value === "string" || typeof value === "boolean") return value;
  return isQuestText(value) ? freezeText(core, frame, value) : null;
};

const numberOf = (value: ScriptEvalValue) => typeof value === "number" ? cleanNumber(value) : 0;

/** Evaluates one cell in its row context; a fraction cell evaluates its two expressions. */
export const evaluateMultiboardCell = (
  core: ScriptEngineCore, cell: MultiboardCell, context: MultiboardCellContext
): MultiboardCellSnapshot => {
  const frame: EvalFrame = { cell: context, context: {}, id: null, locals: {} };
  if (cell.format === "fraction") {
    return {
      current: numberOf(evaluateExpr(core, frame, cell.current)), format: "fraction",
      target: numberOf(evaluateExpr(core, frame, cell.target))
    };
  }
  return { format: cell.format, value: cellValue(core, frame, evaluateExpr(core, frame, cell.expr)) };
};

const sameValue = (a: MultiboardCellValue, b: MultiboardCellValue) => {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
};

export const sameMultiboardCell = (a: MultiboardCellSnapshot | undefined, b: MultiboardCellSnapshot) => {
  if (!a || a.format !== b.format) return false;
  if (a.format === "fraction" && b.format === "fraction") return a.current === b.current && a.target === b.target;
  if (a.format === "fraction" || b.format === "fraction") return false;
  return sameValue(a.value, b.value);
};

type SortKey = number | string | null;

const sortKey = (cell: MultiboardCellSnapshot | undefined): SortKey => {
  if (!cell) return null;
  if (cell.format === "fraction") return cell.current;
  return typeof cell.value === "number" || typeof cell.value === "string" ? cell.value : null;
};

/** Numbers before strings before empty cells; equal keys keep the source order. */
const compareKeys = (a: SortKey, b: SortKey) => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : Number(a > b);
  return Number(a === null) - Number(b === null) || Number(typeof a === "string") - Number(typeof b === "string");
};

/** The rows in display order: source order, or sorted by the sort column (stable; empty cells last). */
export const sortMultiboardRows = (definition: MultiboardDefinition, rows: readonly MultiboardRow[]) => {
  const { sort } = definition;
  const column = sort ? definition.columns.findIndex(entry => entry.id === sort.columnId) : -1;
  if (!sort || column < 0) return rows;
  const direction = sort.direction === "desc" ? -1 : 1;
  const keyed = rows.map((entry, index) => ({ entry, index, key: sortKey(entry.cells[column]) }));
  keyed.sort((a, b) => {
    if (a.key === null || b.key === null) return compareKeys(a.key, b.key) || a.index - b.index;
    return direction * compareKeys(a.key, b.key) || a.index - b.index;
  });
  return keyed.map(item => item.entry);
};
