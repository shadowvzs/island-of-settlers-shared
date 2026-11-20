import { DAY_MS } from "../../time/constants.ts";
import { SCRIPT_LIMITS } from "../constants.ts";
import type { QuestRepeat } from "../types/quests.ts";
import type { QuestInstanceState } from "../types/run-state.ts";

/**
 * Repeat windows on one fixed UTC grid (design §7.2, owner round 5 item 6, round 6 item 45):
 * `window(t) = floor((t − offset) / period)` on the game clock `gameNow`. Yearly/monthly calendar rules have no
 * fixed period; their window key is the UTC date (YYYYMMDD) of the last matching moment ≤ t, computed after
 * subtracting `minuteUtc`. `Date.UTC` arithmetic is timezone- and locale-free, so it is deterministic.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
/** 1970-01-01 was a Thursday (weekday 4 with 0 = Sunday). */
const EPOCH_WEEKDAY = 4;

const intervalPeriod = (repeat: Extract<QuestRepeat, { kind: "interval" }>) =>
  repeat.days * DAY_MS + repeat.hours * HOUR_MS + repeat.minutes * MINUTE_MS;

const gridWindow = (t: number, offset: number, period: number) => Math.floor((t - offset) / period);

const dateKey = (year: number, month: number, day: number) => year * 10_000 + month * 100 + day;

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Last date ≤ (year, month, day) whose day of month is `wantedDay` (months without that day are skipped). */
const lastMonthlyDate = (year: number, month: number, day: number, wantedDay: number) => {
  let candidateYear = year;
  let candidateMonth = day >= wantedDay ? month : month - 1;
  for (let step = 0; step < 24; step++) {
    if (candidateMonth < 1) {
      candidateMonth = 12;
      candidateYear -= 1;
    }
    if (daysInMonth(candidateYear, candidateMonth) >= wantedDay) {
      return dateKey(candidateYear, candidateMonth, wantedDay);
    }
    candidateMonth -= 1;
  }
  return dateKey(candidateYear, candidateMonth, wantedDay);
};

const calendarDateWindow = (t: number, repeat: Extract<QuestRepeat, { kind: "calendar" }>) => {
  const shifted = new Date(t - repeat.minuteUtc * MINUTE_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const wantedDay = repeat.day ?? 1;
  if (repeat.month === undefined) return lastMonthlyDate(year, month, day, wantedDay);
  const reached = month > repeat.month || (month === repeat.month && day >= wantedDay);
  return dateKey(reached ? year : year - 1, repeat.month, wantedDay);
};

/**
 * Window index of a repeat rule at `t`; null for rules without windows (`once`, `onCompletion`).
 * `firstActivationUtc` anchors interval grids (kept across re-arms).
 */
export const repeatWindow = (repeat: QuestRepeat, t: number, firstActivationUtc: number | null) => {
  switch (repeat.kind) {
    case "once":
    case "onCompletion": return null;
    case "interval": {
      const period = intervalPeriod(repeat);
      return period > 0 ? gridWindow(t, firstActivationUtc ?? 0, period) : null;
    }
    case "calendar": {
      const minuteOffset = repeat.minuteUtc * MINUTE_MS;
      if (repeat.month !== undefined || repeat.day !== undefined) return calendarDateWindow(t, repeat);
      if (repeat.weekday === undefined) return gridWindow(t, minuteOffset, DAY_MS);
      const weekdayOffset = ((repeat.weekday - EPOCH_WEEKDAY + 7) % 7) * DAY_MS;
      return gridWindow(t, weekdayOffset + minuteOffset, 7 * DAY_MS);
    }
  }
};

/** A succeeded quest may be claimed at `t` (design §7.2, m5). */
export const isClaimable = (repeat: QuestRepeat, quest: QuestInstanceState, t: number) => {
  if (quest.state !== "succeeded") return false;
  if (repeat.kind === "once") return quest.claimCount === 0;
  if (repeat.kind === "onCompletion") return repeat.maxClaims === null || quest.claimCount < repeat.maxClaims;
  const window = repeatWindow(repeat, t, quest.activatedUtc);
  return window !== null && (quest.lastWindow === null || window > quest.lastWindow);
};

/** A claimed repeating quest re-arms when its next window opens (or at once for `onCompletion`). */
export const isRearmable = (repeat: QuestRepeat, quest: QuestInstanceState, t: number) => {
  if (quest.state !== "claimed" || repeat.kind === "once") return false;
  if (repeat.kind === "onCompletion") return repeat.maxClaims === null || quest.claimCount < repeat.maxClaims;
  const window = repeatWindow(repeat, t, quest.activatedUtc);
  return window !== null && quest.lastWindow !== null && window > quest.lastWindow;
};

/** Records a claim: count, bounded date history (newest last) and the window index. */
export const recordClaim = (repeat: QuestRepeat, quest: QuestInstanceState, t: number): QuestInstanceState => ({
  ...quest,
  claimCount: quest.claimCount + 1,
  lastClaims: [...quest.lastClaims, t].slice(-SCRIPT_LIMITS.claimHistory),
  lastWindow: repeatWindow(repeat, t, quest.activatedUtc) ?? quest.lastWindow,
  state: "claimed"
});
