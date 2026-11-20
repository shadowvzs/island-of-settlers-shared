import tuning from "../data/tuning/models/whales.json" with { type: "json" };
import { deepFreeze } from "../helpers.ts";
import type { WhaleTuning } from "../types/tuning.ts";

/**
 * Whale shapes keyed by `whale:*` key. Loaded synchronously with its consumer's chunk, never with the core catalog
 * (README, "Tuning sidecars"); validated by `validateTuningSidecars`.
 */
export const WHALE_TUNING = deepFreeze(tuning) as unknown as Readonly<Record<string, WhaleTuning>>;
