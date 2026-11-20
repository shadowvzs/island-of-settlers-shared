import type { MultiboardColumn, MultiboardSnapshot } from "../types/multiboards.ts";
import type { QuestText } from "../types/quest-text.ts";
import { WORLD_DEPENDENCY } from "./conditions.ts";
import type { ScriptEngineCore } from "./core.ts";
import { isTimerActive, timerDefinition, timerDependency, timerRemainingSeconds } from "./timers.ts";

/**
 * Timer windows (design §4.11): a timer with a `window` shows its remaining time as a one-cell board while it runs
 * or is paused, for every viewer. Derived presentation only: never saved or hashed, and nothing reads it back.
 * The value refreshes on the one-second cadence and on the tick of a timer action or expiry.
 */

const REMAINING_ID = "remaining";
const WINDOW_COLUMNS: readonly MultiboardColumn[] = Object.freeze([
  Object.freeze({ align: "center", header: Object.freeze({ en: "" }), id: REMAINING_ID, width: "auto" })
]);

interface TimerWindow {
  dirty: boolean;
  id: string;
  remaining: number;
  snapshot: MultiboardSnapshot | null;
  title: QuestText;
}

export class TimerWindows {
  private readonly byDependency = new Map<string, TimerWindow>();
  private readonly core: ScriptEngineCore;
  private readonly windows: TimerWindow[] = [];

  constructor(core: ScriptEngineCore) {
    this.core = core;
    for (const variable of core.script.variables) {
      const title = timerDefinition(variable)?.window?.title;
      if (!title) continue;
      const window: TimerWindow = { dirty: true, id: variable.id, remaining: 0, snapshot: null, title };
      this.windows.push(window);
      this.byDependency.set(timerDependency(variable.id), window);
    }
  }

  /** A timer changed (its own key) or a second passed (the world key). */
  markDependency(key: string) {
    if (key !== WORLD_DEPENDENCY) {
      const window = this.byDependency.get(key);
      if (window) window.dirty = true;
      return;
    }
    for (const window of this.windows) window.dirty = true;
  }

  /** Appends the windows of running and paused timers in variable order; unchanged windows keep their identity. */
  appendVisible(visible: MultiboardSnapshot[]) {
    for (const window of this.windows) {
      if (isTimerActive(this.core.state.timers[window.id])) visible.push(this.refresh(window));
    }
  }

  private refresh(window: TimerWindow): MultiboardSnapshot {
    if (window.snapshot && !window.dirty) return window.snapshot;
    window.dirty = false;
    const remaining = timerRemainingSeconds(this.core.state, window.id);
    if (window.snapshot && window.remaining === remaining) return window.snapshot;
    window.remaining = remaining;
    window.snapshot = {
      collapsed: false, collapseRevision: 0, columns: WINDOW_COLUMNS, id: window.id,
      rows: [{ cells: [{ format: "countdown", value: remaining }], icon: null, id: REMAINING_ID }],
      title: window.title
    };
    return window.snapshot;
  }
}
