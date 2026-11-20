/**
 * Cosmetic server season (seasons plan 2026-11-17, sections 11-12). Pure and clock-free: callers pass the
 * time. Nothing here enters worlds, saves or the simulation; the blend is derived from the season start
 * and its transition length, so reloads and offline catch-up land on the same look.
 */
export const SEASON_MODES = ["none", "two", "four"] as const;
export type SeasonMode = (typeof SEASON_MODES)[number];
export const VISUAL_SEASONS = ["summer", "spring", "autumn", "winter", "monsoon"] as const;
export type VisualSeason = (typeof VISUAL_SEASONS)[number];

export interface SeasonSettings {
  /** Server time (ms) of the last admin change; its transition runs from `previousSeason`. */
  changedAt: number;
  /** The shown season in `none` mode (admin choice, default summer). */
  fixedSeason: VisualSeason;
  mode: SeasonMode;
  /** The season shown when the admin last changed the settings. */
  previousSeason: VisualSeason;
  /** Length of the admin-change transition (calendar changes always take one game week). */
  transitionSeconds: number;
}

export interface SeasonPhase {
  /** 0 shows `from`, 1 shows `to`. */
  blend: number;
  from: VisualSeason;
  to: VisualSeason;
}

/** Admin switch / preview transition (owner 2026-11-17: 3 minutes; 30 s for tests and cinematics). */
export const MANUAL_TRANSITION_SECONDS = 180;
export const MAX_TRANSITION_SECONDS = 7 * 24 * 3600;
/** One game week: 3 s real = 1 game minute, so a 72-minute game day. */
export const GAME_WEEK_MS = 7 * 72 * 60_000;

export const DEFAULT_SEASON_SETTINGS: Readonly<SeasonSettings> = Object.freeze({
  changedAt: 0, fixedSeason: "summer", mode: "none", previousSeason: "summer",
  transitionSeconds: MANUAL_TRANSITION_SECONDS
});

export const isSeasonMode = (value: unknown): value is SeasonMode =>
  SEASON_MODES.some(mode => mode === value);

export const isVisualSeason = (value: unknown): value is VisualSeason =>
  VISUAL_SEASONS.some(season => season === value);

/** UTC month (0-11) -> season, per cycle. Four: Mar-May spring ... Dec-Feb winter. Two: Jun-Sep monsoon. */
const FOUR_SEASON_MONTHS: readonly VisualSeason[] = [
  "winter", "winter", "spring", "spring", "spring", "summer",
  "summer", "summer", "autumn", "autumn", "autumn", "winter"
];
const TWO_SEASON_MONTHS: readonly VisualSeason[] = [
  "summer", "summer", "summer", "summer", "summer", "monsoon",
  "monsoon", "monsoon", "monsoon", "summer", "summer", "summer"
];

const monthsOf = (mode: Exclude<SeasonMode, "none">) =>
  mode === "four" ? FOUR_SEASON_MONTHS : TWO_SEASON_MONTHS;

/** The calendar season of a cycling mode at a server time. */
export const getCalendarSeason = (mode: Exclude<SeasonMode, "none">, nowMs: number): VisualSeason =>
  monthsOf(mode)[new Date(nowMs).getUTCMonth()]!;

/** The calendar season and the server time (ms) its run of months began, with the season before it. */
const getCalendarRun = (mode: Exclude<SeasonMode, "none">, nowMs: number) => {
  const months = monthsOf(mode);
  const now = new Date(nowMs);
  const season = months[now.getUTCMonth()]!;
  let year = now.getUTCFullYear(), month = now.getUTCMonth();
  for (let step = 0; step < 12; step++) {
    const previousMonth = (month + 11) % 12;
    if (months[previousMonth] !== season)
      return { previous: months[previousMonth]!, season, start: Date.UTC(year, month, 1) };
    if (month === 0) year--;
    month = previousMonth;
  }
  return { previous: season, season, start: 0 };
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** The phase (from, to, blend) shown at `nowMs`; an admin change overrides the calendar until it ends. */
export const resolveSeasonPhase = (settings: SeasonSettings, nowMs: number): SeasonPhase => {
  const transitionMs = Math.max(0, settings.transitionSeconds) * 1000;
  const sinceChange = nowMs - settings.changedAt;
  const target = settings.mode === "none" ? settings.fixedSeason : getCalendarSeason(settings.mode, nowMs);
  if (settings.mode === "none" || sinceChange < transitionMs) {
    const blend = transitionMs > 0 ? clamp01(sinceChange / transitionMs) : 1;
    return { blend, from: settings.previousSeason, to: target };
  }
  const run = getCalendarRun(settings.mode, nowMs);
  return { blend: clamp01((nowMs - run.start) / GAME_WEEK_MS), from: run.previous, to: run.season };
};

/** The season a snapping consumer (the prepared winter rebuild, impostor bakes) shows: swap at mid-blend. */
export const getDominantSeason = (phase: SeasonPhase): VisualSeason =>
  phase.blend < 0.5 ? phase.from : phase.to;

/** Validated settings from untrusted JSON, or null. */
export const readSeasonSettings = (value: unknown): SeasonSettings | null => {
  if (!value || typeof value !== "object") return null;
  const { changedAt, fixedSeason, mode, previousSeason, transitionSeconds } = value as Record<string, unknown>;
  if (!isSeasonMode(mode) || !isVisualSeason(fixedSeason) || !isVisualSeason(previousSeason)) return null;
  if (typeof changedAt !== "number" || !Number.isFinite(changedAt)) return null;
  if (typeof transitionSeconds !== "number" || !Number.isFinite(transitionSeconds)) return null;
  if (transitionSeconds < 0 || transitionSeconds > MAX_TRANSITION_SECONDS) return null;
  return { changedAt, fixedSeason, mode, previousSeason, transitionSeconds };
};
