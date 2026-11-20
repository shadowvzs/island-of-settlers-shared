/**
 * The one source of simulation time units (unification survey §4). The settlement, event core,
 * wildlife, replay verifier and offline catch-up all step in fixed 20 Hz ticks; every tick/second/day
 * conversion reads these values instead of writing `0.05`, `50` or `24 * 60 * 60 * 20` again.
 */

/** Simulation ticks per second. */
export const TICK_HZ = 20;
/** One tick in milliseconds. */
export const TICK_MS = 50;
/**
 * One tick in seconds. Written as the literal `0.05` (the same double as `1 / TICK_HZ`) because float
 * accumulation of this exact value is part of the replay hashes.
 */
export const TICK_SECONDS = 0.05;
/** Ticks in one game minute. */
export const TICKS_PER_MINUTE = 60 * TICK_HZ;
/** Ticks in one game day. */
export const TICKS_PER_DAY = 24 * 60 * TICKS_PER_MINUTE;
/** One UTC day in milliseconds (calendar/wall-clock arithmetic, not a tick count). */
export const DAY_MS = 86_400_000;

/** Whole ticks in a span of seconds (rounded; never negative). */
export const secondsToTicks = (seconds: number) => Math.max(0, Math.round(seconds * 1000 / TICK_MS));

/** Seconds at a whole tick count: `tick × 50 / 1000`, exact for every path that reaches the same tick. */
export const ticksToSeconds = (ticks: number) => ticks * TICK_MS / 1000;
