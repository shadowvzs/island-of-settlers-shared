import { CAMPAIGN_FALLBACK_LANGUAGE } from "../campaign-constants.ts";
import { speakDurationMs } from "./speak-timing.ts";
import type { CinematicStep } from "./types.ts";

export interface CinematicStepTiming {
  endMs: number;
  startMs: number;
}

export interface CinematicScheduleOptions {
  /** Real durations measured by the runtime (walk arrival, a clicked-away line), by step id; they re-anchor. */
  actualDurationsMs?: ReadonlyMap<string, number>;
  /** Language whose text times the speak steps; default English. */
  language?: string;
  /** Dialogue-speed setting; default SPEAK_MS_PER_CHAR. */
  msPerChar?: number;
}

/**
 * The intrinsic duration of a step (section 2.5): transitions (+ drift), speak, fade/shake/follow durations, walk
 * timeout as an upper bound when it waits for arrival, 0 for instant steps.
 */
export const stepDurationMs = (step: CinematicStep, options: CinematicScheduleOptions = {}) => {
  switch (step.kind) {
    case "camera": return step.transitionMs + (step.drift?.durationMs ?? 0);
    case "cinematicMode":
    case "weather": return step.transitionMs;
    case "cameraFollow":
    case "cameraShake":
    case "fade": return step.durationMs;
    case "speak": return speakDurationMs(step, options.language ?? CAMPAIGN_FALLBACK_LANGUAGE, options.msPerChar);
    case "walk": return step.waitUntilArrived ? step.timeoutMs : 0;
    default: return 0;
  }
};

/**
 * Start and end (ms from the sequence start) of every step: "after previous" starts `delayMs` after the previous
 * step's end, "with previous" `delayMs` after the previous step's start; the first step anchors at 0. Pure.
 */
export const scheduleSequence = (
  steps: readonly CinematicStep[], options: CinematicScheduleOptions = {}
): CinematicStepTiming[] => {
  const timings: CinematicStepTiming[] = [];
  let previous: CinematicStepTiming = { endMs: 0, startMs: 0 };
  for (const step of steps) {
    const anchor = step.start === "afterPrevious" ? previous.endMs : previous.startMs;
    const startMs = anchor + step.delayMs;
    const durationMs = options.actualDurationsMs?.get(step.id) ?? stepDurationMs(step, options);
    previous = { endMs: startMs + durationMs, startMs };
    timings.push(previous);
  }
  return timings;
};

/** The end of the last-finishing step (a "with previous" step may outlast the final one). */
export const sequenceDurationMs = (timings: readonly CinematicStepTiming[]) =>
  timings.reduce((longest, timing) => Math.max(longest, timing.endMs), 0);
