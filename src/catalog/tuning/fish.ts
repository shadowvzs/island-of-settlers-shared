import tuning from "../data/tuning/models/fish.json" with { type: "json" };
import { deepFreeze } from "../helpers.ts";
import type { FishTuning } from "../types/tuning.ts";

/**
 * Fish model and motion tuning keyed by `fish:*` key. Loaded synchronously with its consumer's chunk, never with
 * the core catalog (README, "Tuning sidecars"); validated by `validateTuningSidecars`.
 */
export const FISH_TUNING = deepFreeze(tuning) as unknown as Readonly<Record<string, FishTuning>>;
