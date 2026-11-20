import type { RoadPlantForm, RoadPlantTuning, TuningVec3 } from "./catalog/index.ts";
import { ROAD_PLANT_TUNING, type RoadPlantId } from "./catalog/tuning/plants.ts";

export type { RoadPlantForm, RoadPlantId };
export type RoadPlantColour = TuningVec3;

/**
 * Ornamental plant model parameters per species: the catalog sidecar `tuning/models/plants.json` (names, items,
 * prices and availability live in the content catalog's `decoration:plant-*` entries) plus the derived crown base.
 */
export interface RoadPlantDefinition extends RoadPlantTuning {
  /** Trees keep broad crowns above riders/cargo; full model bounds still require placement checks. */
  crownBase: number;
  id: RoadPlantId;
  variants: 3;
}

/** Forms whose crown is lifted above riders and cargo. */
const RAISED_CROWN_FORMS: readonly RoadPlantForm[] = ["tree", "weeping", "palm"];

const toRoadPlant = ([id, tuning]: readonly [RoadPlantId, RoadPlantTuning]): RoadPlantDefinition => ({
  ...tuning,
  blossom: tuning.blossom,
  crownBase: RAISED_CROWN_FORMS.includes(tuning.form) ? 2.3 : .12,
  id,
  variants: 3
});

/** Every ornamental species in table order; loaded synchronously with its consumers, never with the core catalog. */
export const ROAD_PLANTS: readonly RoadPlantDefinition[] =
  (Object.entries(ROAD_PLANT_TUNING) as [RoadPlantId, RoadPlantTuning][]).map(toRoadPlant);

export const getRoadPlant = (id: string) => ROAD_PLANTS.find(definition => definition.id === id);
