import tuning from "../data/tuning/wildlife-profiles.json" with { type: "json" };
import { deepFreeze } from "../helpers.ts";
import type { WildlifeProfileTuning } from "../types/tuning.ts";

/**
 * Wildlife behaviour profiles keyed by `animal:*` key (simulation data, deterministic at start). Loaded
 * synchronously with its consumer's chunk, never with the core catalog (README, "Tuning sidecars"); validated by
 * `validateTuningSidecars`.
 */
export const WILDLIFE_PROFILE_TUNING = deepFreeze(tuning) as unknown as Readonly<Record<string, WildlifeProfileTuning>>;
