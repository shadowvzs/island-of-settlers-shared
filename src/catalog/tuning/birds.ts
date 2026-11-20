import tuning from "../data/tuning/models/birds.json" with { type: "json" };
import { deepFreeze } from "../helpers.ts";
import type { BirdTuning } from "../types/tuning.ts";

/**
 * Bird model and flight tuning keyed by `bird:*` key. Loaded synchronously with its consumer's chunk, never with
 * the core catalog (README, "Tuning sidecars"); validated by `validateTuningSidecars`.
 */
export const BIRD_TUNING = deepFreeze(tuning) as unknown as Readonly<Record<string, BirdTuning>>;
