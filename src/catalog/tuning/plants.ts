import tuning from "../data/tuning/models/plants.json" with { type: "json" };
import { deepFreeze } from "../helpers.ts";
import type { RoadPlantTuning } from "../types/tuning.ts";

/**
 * Ornamental plant model parameters keyed by species (`decoration.plant.species`), in table order. Loaded
 * synchronously with its consumer's chunk, never with the core catalog (README, "Tuning sidecars"); validated by
 * `validateTuningSidecars`.
 */
export const ROAD_PLANT_TUNING = deepFreeze(tuning) as unknown as Readonly<Record<RoadPlantId, RoadPlantTuning>>;
/** Ornamental species ids: the keys of the plant tuning sidecar. */
export type RoadPlantId = keyof typeof tuning;
