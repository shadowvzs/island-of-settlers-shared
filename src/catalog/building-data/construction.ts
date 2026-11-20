import { buildingEntry } from "../buildings.ts";
import { BUILDING_CONSTRUCTION_FILES } from "../data/buildings/construction-index.ts";
import { deepFreeze } from "../helpers.ts";
import type { BuildingConstruction } from "../types/building-data.ts";

/**
 * Building construction sidecars (`data/buildings/<key>/construction.json`): the cost every nation pays under the
 * unified rule and the measured inputs (README, "Construction cost rule"). Loaded with their consumer's chunk.
 */
const CONSTRUCTION = deepFreeze(BUILDING_CONSTRUCTION_FILES) as Readonly<Record<string, BuildingConstruction>>;

/** The construction data of an active building code; undefined for retired and unknown codes. */
export const buildingConstruction = (code: number): BuildingConstruction | undefined => {
  const entry = buildingEntry(code);
  return entry && !entry.retired ? CONSTRUCTION[entry.key] : undefined;
};
