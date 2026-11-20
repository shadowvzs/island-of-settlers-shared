import tuning from "../data/tuning/models/butterflies.json" with { type: "json" };
import { deepFreeze } from "../helpers.ts";
import type { ButterflyTuning } from "../types/tuning.ts";

/**
 * Butterfly model and flight tuning keyed by `butterfly:*` key. Loaded synchronously with its consumer's chunk,
 * never with the core catalog (README, "Tuning sidecars"); validated by `validateTuningSidecars`.
 */
export const BUTTERFLY_TUNING = deepFreeze(tuning) as unknown as Readonly<Record<string, ButterflyTuning>>;
