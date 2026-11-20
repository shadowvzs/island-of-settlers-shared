import { buildingByKey } from "../buildings.ts";
import { BUILDING_GEOMETRY_FILES } from "../data/buildings/geometry-index.ts";
import { deepFreeze } from "../helpers.ts";
import type { BuildingGeometry } from "../types/building-geometry.ts";

/**
 * Building geometry sidecars (`data/buildings/<key>/geometry.json`): plot, door, entrance sweep, logistics anchors,
 * worker exit and mechanism, identical for every nation (README, "Building geometry"). Small and needed by
 * placement before the first tick, so they load synchronously with their consumer's chunk.
 */
const GEOMETRY = deepFreeze(BUILDING_GEOMETRY_FILES) as unknown as Readonly<Record<string, BuildingGeometry>>;

const indexByCode = () => {
  const codes: (BuildingGeometry | undefined)[] = [];
  for (const [key, geometry] of Object.entries(GEOMETRY)) {
    const entry = buildingByKey(key);
    if (!entry) throw new Error(`No building entry for the geometry sidecar ${key}`);
    codes[entry.code] = geometry;
  }
  return Object.freeze(codes);
};

let byCode: readonly (BuildingGeometry | undefined)[] | null = null;

/** The geometry of an active building code (dense array, built once); undefined for retired and unknown codes. */
export const buildingGeometry = (code: number): BuildingGeometry | undefined => (byCode ??= indexByCode())[code];

/** The geometry of an active building code; throws for a building whose sidecar was not generated yet. */
export const requireBuildingGeometry = (code: number): BuildingGeometry => {
  const geometry = buildingGeometry(code);
  if (!geometry) throw new Error(`Building ${code} has no geometry sidecar: run npm run building-geometry`);
  return geometry;
};
