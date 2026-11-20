import { TICK_SECONDS } from "./time/constants.ts";

/**
 * Render frames retain partial time; authoritative simulation work runs in fixed 50 ms ticks.
 * Metadata only: a frame remainder never executes a tick or advances the authoritative clock.
 */
export const validFrameAccumulator = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value < TICK_SECONDS;
