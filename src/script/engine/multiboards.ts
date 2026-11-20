import type {
  MultiboardCell, MultiboardDefinition, MultiboardSnapshot, MultiboardState
} from "../types/multiboards.ts";
import type { QuestText } from "../types/quest-text.ts";
import type { PlayerFilter } from "../types/refs.ts";
import type { ActionArg } from "../types/triggers.ts";
import type { Expr } from "../types/values.ts";
import { WORLD_DEPENDENCY } from "./conditions.ts";
import type { EvalFrame, ScriptEngineCore } from "./core.ts";
import { playerFilterMatches } from "./event-matching.ts";
import { evaluateExpr } from "./expressions.ts";
import {
  buildMultiboardRows, cellDependencies, evaluateMultiboardCell, type MultiboardRow, rowSourceDependencies,
  sameMultiboardCell, sortMultiboardRows
} from "./multiboard-cells.ts";
import { TimerWindows } from "./timer-windows.ts";
import { rawOf } from "./values.ts";

/**
 * Multiboards at run time (design §6.9). The saved state per board is `{ visible, collapsed, … }` in the run state;
 * everything else here is derived and never saved or hashed. Each cell knows the variables and quests it reads:
 * a write marks only those cells dirty, world functions refresh on the one-second cadence, timers on that cadence
 * and on the tick they start, pause, resume, stop or expire, and
 * `snapshots` re-evaluates only the dirty cells of the boards the viewer sees. Nothing runs per tick or per frame.
 */

export const MULTIBOARD_OPS: ReadonlySet<string> = new Set([
  "collapseMultiboard", "expandMultiboard", "hideMultiboard", "setMultiboardTitle", "showMultiboard"
]);

/** Dependency index entry: a cell column of a board, or its row source (`ROW_SOURCE`). */
interface BoardUser {
  board: BoardRuntime;
  column: number;
}

interface BoardRuntime {
  cells: readonly MultiboardCell[];
  definition: MultiboardDefinition;
  dirtyColumns: boolean[];
  headerDirty: boolean;
  id: string;
  rows: MultiboardRow[];
  rowsDirty: boolean;
  snapshot: MultiboardSnapshot | null;
}

const ROW_SOURCE = -1;
const EMPTY_SNAPSHOTS: readonly MultiboardSnapshot[] = Object.freeze([]);

const refIdOf = (arg: ActionArg | undefined) => (arg as { id?: string } | null | undefined)?.id ?? "";

const isExpr = (arg: ActionArg | undefined): arg is Expr =>
  typeof arg === "object" && arg !== null && !Array.isArray(arg) && "k" in arg;

const isPlayerFilter = (arg: ActionArg | undefined): arg is PlayerFilter =>
  typeof arg === "object" && arg !== null && !Array.isArray(arg) && !("k" in arg) && "kind" in arg;

const isQuestText = (value: unknown): value is QuestText =>
  typeof value === "object" && value !== null && typeof (value as { en?: unknown }).en === "string";

/** A `triggeringPlayer` audience is fixed to that player when the action runs (the saved state has no run). */
const fixedAudience = (frame: EvalFrame, audience: PlayerFilter): PlayerFilter | null => {
  if (audience.kind !== "response") return audience;
  const faction = rawOf(frame.context[audience.key]);
  return typeof faction === "number" ? { faction, kind: "slot" } : null;
};

const shownState = (frame: EvalFrame, state: MultiboardState, audienceArg: ActionArg | undefined) => {
  const { audience: _replaced, ...rest } = state;
  const audience = isPlayerFilter(audienceArg) ? fixedAudience(frame, audienceArg) : null;
  return audience ? { ...rest, audience, visible: true } : { ...rest, visible: true };
};

const sameItems = <T>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((item, index) => item === b[index]);

const isDirty = (board: BoardRuntime) => board.headerDirty || board.rowsDirty || board.dirtyColumns.includes(true);

export class MultiboardRuntime {
  private readonly boards: BoardRuntime[] = [];
  private readonly byId = new Map<string, BoardRuntime>();
  private readonly core: ScriptEngineCore;
  private published: readonly MultiboardSnapshot[] = EMPTY_SNAPSHOTS;
  private readonly timerWindows: TimerWindows;
  private readonly users = new Map<string, BoardUser[]>();

  constructor(core: ScriptEngineCore) {
    this.core = core;
    this.timerWindows = new TimerWindows(core);
    for (const variable of core.script.variables) {
      if (variable.initial.type === "multiboard") this.addBoard(variable.id, variable.initial.value);
    }
  }

  /** A variable or quest changed: only the cells (and row sources) reading it become dirty. */
  markDependency(key: string) {
    this.timerWindows.markDependency(key);
    const users = this.users.get(key);
    if (!users) return;
    for (const { board, column } of users) {
      if (column === ROW_SOURCE) board.rowsDirty = true;
      else board.dirtyColumns[column] = true;
    }
  }

  /** The one-second cadence of cells that read the world (functions, timers, player rows). */
  markWorld() {
    this.markDependency(WORLD_DEPENDENCY);
  }

  /** Show, hide, collapse, expand and set title; an unknown board is logged and ignored. */
  applyAction(frame: EvalFrame, op: string, args: Record<string, ActionArg>) {
    const id = refIdOf(args.multiboard);
    const board = this.byId.get(id);
    const state = this.core.state.multiboards[id];
    if (!board || !state) {
      this.core.log("unknownReference", `multiboard ${id || "?"}`);
      return;
    }
    const next = this.nextState(frame, op, state, args);
    if (!next) {
      this.core.log("actionFailed", `${op} on ${id}`);
      return;
    }
    this.core.state.multiboards[id] = next;
    board.headerDirty = true;
  }

  /**
   * The boards `viewer` (a faction) sees, in variable order, then the windows of running timers. Only dirty cells
   * are evaluated; the returned list, every board, row and cell keep their identity while their content is unchanged.
   */
  snapshots(viewer: number): readonly MultiboardSnapshot[] {
    const visible: MultiboardSnapshot[] = [];
    for (const board of this.boards) {
      const state = this.core.state.multiboards[board.id];
      if (!state?.visible) continue;
      if (!playerFilterMatches(this.core, state.audience ?? board.definition.audience, viewer)) continue;
      visible.push(this.refreshBoard(board, state));
    }
    this.timerWindows.appendVisible(visible);
    if (!sameItems(visible, this.published)) this.published = visible.length > 0 ? visible : EMPTY_SNAPSHOTS;
    return this.published;
  }

  private addBoard(id: string, definition: MultiboardDefinition) {
    const cells = definition.columns.map(column =>
      definition.cells[column.id] ?? { expr: { k: "lit", type: "string", value: "" }, format: "text" } as const);
    const board: BoardRuntime = {
      cells, definition, dirtyColumns: cells.map(() => true), headerDirty: true, id, rows: [], rowsDirty: true,
      snapshot: null
    };
    this.boards.push(board);
    this.byId.set(id, board);
    cells.forEach((cell, column) => {
      for (const key of cellDependencies(cell)) this.addUser(key, { board, column });
    });
    for (const key of rowSourceDependencies(definition)) this.addUser(key, { board, column: ROW_SOURCE });
  }

  private addUser(key: string, user: BoardUser) {
    const users = this.users.get(key);
    if (users) users.push(user);
    else this.users.set(key, [user]);
  }

  private nextState(frame: EvalFrame, op: string, state: MultiboardState, args: Record<string, ActionArg>):
    MultiboardState | null {
    if (op === "showMultiboard") return shownState(frame, state, args.audience);
    if (op === "hideMultiboard") return { ...state, visible: false };
    if (op === "setMultiboardTitle") {
      const title = isExpr(args.text) ? evaluateExpr(this.core, frame, args.text) : null;
      return isQuestText(title) ? { ...state, title } : null;
    }
    const collapseRevision = (state.collapseRevision ?? 0) + 1;
    return { ...state, collapsed: op === "collapseMultiboard", collapseRevision };
  }

  /** Rebuilt rows keep the evaluated cells of the row with the same id, so unchanged rows keep their snapshot. */
  private rebuildRows(board: BoardRuntime) {
    const previous = new Map(board.rows.map(entry => [entry.id, entry]));
    board.rows = buildMultiboardRows(this.core, board.definition);
    for (const entry of board.rows) {
      const kept = previous.get(entry.id);
      if (!kept || kept.icon !== entry.icon) continue;
      entry.cells = kept.cells;
      entry.snapshot = kept.snapshot;
    }
    board.dirtyColumns.fill(true);
    board.rowsDirty = false;
  }

  private evaluateDirtyColumns(board: BoardRuntime) {
    board.dirtyColumns.forEach((dirty, column) => {
      if (!dirty) return;
      board.dirtyColumns[column] = false;
      const cell = board.cells[column]!;
      for (const entry of board.rows) {
        const next = evaluateMultiboardCell(this.core, cell, entry.context);
        if (sameMultiboardCell(entry.cells[column], next)) continue;
        entry.cells[column] = next;
        entry.snapshot = null;
      }
    });
  }

  private refreshBoard(board: BoardRuntime, state: MultiboardState): MultiboardSnapshot {
    if (board.snapshot && !isDirty(board)) return board.snapshot;
    if (board.rowsDirty) this.rebuildRows(board);
    this.evaluateDirtyColumns(board);
    for (const entry of board.rows) entry.snapshot ??= { cells: [...entry.cells], icon: entry.icon, id: entry.id };
    const ordered = sortMultiboardRows(board.definition, board.rows).map(entry => entry.snapshot!);
    const previous = board.snapshot;
    const rows = previous && sameItems(ordered, previous.rows) ? previous.rows : ordered;
    if (previous && rows === previous.rows && !board.headerDirty) return previous;
    board.headerDirty = false;
    board.snapshot = {
      collapsed: state.collapsed, collapseRevision: state.collapseRevision ?? 0, columns: board.definition.columns,
      id: board.id, rows, title: state.title ?? board.definition.title
    };
    return board.snapshot;
  }
}
