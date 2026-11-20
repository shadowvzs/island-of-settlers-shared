import { BUILDING_NAVIGATION_FILES } from "../data/buildings/navigation-index.ts";
import { deepFreeze } from "../helpers.ts";
import type {
  BuildingNavigationFile, BuildingNavigationLevel, EncodedNavigationVolume, NavigationVolume
} from "../types/building-geometry.ts";

/**
 * Building navigation sidecars (`data/buildings/<key>/navigation/<nation>.json`): per nation and level the rooms,
 * structural obstacles and stock displays the public walkable area avoids (README, "Building geometry"). Large, so
 * they load lazily per nation: `loadBuildingNavigation(nation)` before a simulation of that nation starts; the
 * synchronous reads then find them in memory.
 */
const loaded = new Map<string, Map<string, BuildingNavigationFile>>();
const pending = new Map<string, Promise<void>>();

const importNation = async (nation: string) => {
  const files = new Map<string, BuildingNavigationFile>();
  await Promise.all(Object.entries(BUILDING_NAVIGATION_FILES).map(async ([key, byNation]) => {
    const importer = byNation[nation];
    if (!importer) return;
    const module = await importer() as { default: BuildingNavigationFile };
    files.set(key, deepFreeze(module.default));
  }));
  loaded.set(nation, files);
};

/** Loads every building's navigation of one nation once (concurrent calls share the load). */
export const loadBuildingNavigation = (nation: string): Promise<void> => {
  if (loaded.has(nation)) return Promise.resolve();
  let load = pending.get(nation);
  if (!load) {
    load = importNation(nation).finally(() => pending.delete(nation));
    pending.set(nation, load);
  }
  return load;
};

/** Every nation with navigation sidecars. */
export const buildingNavigationNations = (): readonly string[] =>
  [...new Set(Object.values(BUILDING_NAVIGATION_FILES).flatMap(byNation => Object.keys(byNation)))];

/** A loaded navigation file; undefined until `loadBuildingNavigation(nation)` finished. */
export const loadedBuildingNavigation = (key: string, nation: string): BuildingNavigationFile | undefined =>
  loaded.get(nation)?.get(key);

/** Level 1-5 of a navigation file, following a repeated level's reference. */
export const buildingNavigationLevel = (file: BuildingNavigationFile, level: number): BuildingNavigationLevel => {
  const stored = file.levels[level - 1];
  if (typeof stored === "number") return buildingNavigationLevel(file, stored);
  if (!stored) throw new Error(`No navigation level ${level}`);
  return stored;
};

const point = (encoded: EncodedNavigationVolume, offset: number) =>
  [encoded[offset] as number, encoded[offset + 1] as number, encoded[offset + 2] as number] as const;

/** `[minX, minY, minZ, maxX, maxY, maxZ, shape?, yaw?, id?]` as a volume object. */
export const decodeNavigationVolume = (encoded: EncodedNavigationVolume): NavigationVolume => {
  const [, , , , , , shape, yaw, id] = encoded;
  const volume: { -readonly [K in keyof NavigationVolume]: NavigationVolume[K] } = {
    max: point(encoded, 3), min: point(encoded, 0)
  };
  if (typeof id === "string") volume.id = id;
  if (shape === "box" || shape === "ellipse") volume.shape = shape;
  if (typeof yaw === "number") volume.yaw = yaw;
  return volume;
};

/** The inverse of `decodeNavigationVolume` (the generator's encoding). */
export const encodeNavigationVolume = ({ id, max, min, shape, yaw }: NavigationVolume): EncodedNavigationVolume => {
  const encoded: (number | string | null)[] = [...min, ...max];
  if (id !== undefined) return [...encoded, shape ?? null, yaw ?? null, id];
  if (yaw !== undefined) return [...encoded, shape ?? null, yaw];
  return shape === undefined ? encoded : [...encoded, shape];
};
