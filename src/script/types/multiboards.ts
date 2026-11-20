import type { QuestText } from "./quest-text.ts";
import type { PlayerFilter, ScriptRef, VariableId } from "./refs.ts";
import type { Expr } from "./values.ts";

/** Multiboards and timers are map-saved variables (trigger design §4.11). */

export type CellFormat = "text" | "number" | "fraction" | "percent" | "countdown" | "iconNumber";

/** A fraction cell has two expressions; every other format has one (rev n1). */
export type MultiboardCell =
  | { current: Expr; format: "fraction"; target: Expr }
  | { expr: Expr; format: Exclude<CellFormat, "fraction"> };

export interface MultiboardColumn {
  align: "left" | "right" | "center";
  header: QuestText;
  id: string;
  width: "auto" | number;
}

export interface MultiboardStaticRow {
  /** The catalog entry's icon. */
  icon?: ScriptRef<"content">;
  id: string;
  label: QuestText;
}

export type MultiboardRowSource =
  | { kind: "static"; rows: MultiboardStaticRow[] }
  | { filter: PlayerFilter; kind: "players" }
  | { kind: "array"; lengthOf: ScriptRef<"variable">; maxRows: number };

export interface MultiboardDefinition {
  /** Who sees it; single-human maps: the human. */
  audience: PlayerFilter;
  /** Cell per column id, evaluated with the row context (`{ k: "cell" }`). */
  cells: Record<string, MultiboardCell>;
  columns: MultiboardColumn[];
  initiallyCollapsed: boolean;
  initiallyVisible: boolean;
  rows: MultiboardRowSource;
  /** Optional sort (leaderboard). */
  sort: { columnId: string; direction: "asc" | "desc" } | null;
  title: QuestText;
}

export interface TimerDefinition {
  /** Started at map start; otherwise by `timerStart`. */
  autoStart: boolean;
  periodic: boolean;
  /** Script seconds (script clock, frozen offline). */
  seconds: number;
  /** Optional on-screen countdown. */
  window: { title: QuestText } | null;
}

/** Row context of a cell expression (`{ k: "cell" }`); a key the row source does not provide reads as null. */
export interface MultiboardCellContext {
  rowIndex: number;
  /** The array element of an `array` row. */
  rowItem: number | string | null;
  /** The label of a `static` row. */
  rowLabel: QuestText | null;
  /** The faction of a `players` row. */
  rowPlayer: number | null;
}

/** Saved state of one board (design §6.9); the optional fields exist only after the action that sets them. */
export interface MultiboardState {
  /** `showMultiboard` with an audience: replaces the definition's audience until the next show without one. */
  audience?: PlayerFilter;
  collapsed: boolean;
  /** +1 per script collapse/expand action; a player's own header toggle made before it no longer applies. */
  collapseRevision?: number;
  /** `setMultiboardTitle`: replaces the definition's title. */
  title?: QuestText;
  visible: boolean;
}

/** An evaluated cell value: plain JSON, presentation-neutral (the view formats and translates it). */
export type MultiboardCellValue = boolean | number | string | QuestText | null;

export type MultiboardCellSnapshot =
  | { current: number; format: "fraction"; target: number }
  | { format: Exclude<CellFormat, "fraction">; value: MultiboardCellValue };

export interface MultiboardRowSnapshot {
  /** One cell per column, in column order. */
  cells: readonly MultiboardCellSnapshot[];
  /** Catalog content id of a static row's icon. */
  icon: string | null;
  id: string;
}

/**
 * A visible board as the engine publishes it. Objects are replaced only when their content changed: an unchanged
 * board, row or cell keeps its identity between snapshots, so a view can skip it by reference.
 */
export interface MultiboardSnapshot {
  collapsed: boolean;
  collapseRevision: number;
  columns: readonly MultiboardColumn[];
  id: VariableId;
  /** Sorted when the definition has a sort. */
  rows: readonly MultiboardRowSnapshot[];
  title: QuestText;
}
