import { campaignIssue, type CampaignIssue } from "./campaign-issues.ts";

/**
 * Region library (cinematics plan section 2.1, lane CIN0): named places on a campaign map, authored once and
 * referenced by id from quests, victory rules, claim effects and cinematic steps. Coordinates are world cells in the
 * map scenario's x/z convention; a cell (x, z) covers [x, x + 1) × [z, z + 1). Pure and worker-safe.
 */
export type RegionShape =
  | { centerX: number; centerZ: number; kind: "circle"; radius: number }
  /** Axis-aligned, in world cells; a rotated rectangle is not needed now. */
  | { kind: "rect"; maxX: number; maxZ: number; minX: number; minZ: number }
  /** A spot with a facing (radians): spawns, landings, walk and camera targets. It covers its one cell. */
  | { facing: number; kind: "point"; x: number; z: number };

export type RegionShapeKind = RegionShape["kind"];

export interface MapRegion {
  /** Editor overlay colour (border + translucent fill); absent: CAMPAIGN_REGION_DEFAULT_COLOR. */
  color?: string;
  /** Stable `region-<n>`, never reused after a deletion (see `addRegion`). */
  id: string;
  /** Editor-only label, e.g. "North bridge"; never shown to players. */
  name: string;
  shape: RegionShape;
}

/** Map size in cells, for bounds checks and rasterization. */
export interface RegionBounds {
  cellsX: number;
  cellsZ: number;
}

/** True when the world position lies in the region; a point region contains every position of its cell. */
export const regionContains = (region: Pick<MapRegion, "shape">, x: number, z: number) => {
  const { shape } = region;
  if (shape.kind === "point") return Math.floor(x) === Math.floor(shape.x) && Math.floor(z) === Math.floor(shape.z);
  if (shape.kind === "rect") return x >= shape.minX && x <= shape.maxX && z >= shape.minZ && z <= shape.maxZ;
  const dx = x - shape.centerX, dz = z - shape.centerZ;
  return dx * dx + dz * dz <= shape.radius * shape.radius;
};

/**
 * Cell membership (TRG4): the position's cell belongs to the region when the region contains the cell's centre, the
 * same rule as `rasterizeRegion`, so enter/leave events and `actorInRegion` reads always agree.
 */
export const regionContainsCell = (region: Pick<MapRegion, "shape">, x: number, z: number) =>
  regionContains(region, Math.floor(x) + 0.5, Math.floor(z) + 0.5);

/** The cell span a shape can touch: [x0, x1] × [z0, z1] before clipping. */
const shapeCellSpan = (shape: RegionShape) => {
  if (shape.kind === "point") {
    const x = Math.floor(shape.x), z = Math.floor(shape.z);
    return { x0: x, x1: x, z0: z, z1: z };
  }
  if (shape.kind === "rect") return { x0: Math.floor(shape.minX), x1: Math.floor(shape.maxX),
    z0: Math.floor(shape.minZ), z1: Math.floor(shape.maxZ) };
  const { centerX, centerZ, radius } = shape;
  return { x0: Math.floor(centerX - radius), x1: Math.floor(centerX + radius),
    z0: Math.floor(centerZ - radius), z1: Math.floor(centerZ + radius) };
};

/**
 * Cell indices (`z * cellsX + x`, ascending) whose centre the region contains, clipped to the map. "A unit enters
 * the region" is then one lookup of the unit's cell on its movement events (no per-tick scans).
 */
export const rasterizeRegion = (region: Pick<MapRegion, "shape">, cellsX: number, cellsZ: number) => {
  const span = shapeCellSpan(region.shape), cells: number[] = [];
  const x0 = Math.max(0, span.x0), x1 = Math.min(cellsX - 1, span.x1);
  const z0 = Math.max(0, span.z0), z1 = Math.min(cellsZ - 1, span.z1);
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) if (regionContainsCell(region, x, z)) cells.push(z * cellsX + x);
  return cells;
};

/**
 * Rasterized cells per region id, computed on first use (a run clones its map at start, so regions do not change
 * during it). A region whose shape object was replaced (editor) is rasterized again.
 */
export const createRegionCellCache = ({ cellsX, cellsZ }: RegionBounds) => {
  const entries = new Map<string, { cells: readonly number[]; shape: RegionShape }>();
  return {
    cells: (region: MapRegion): readonly number[] => {
      const cached = entries.get(region.id);
      if (cached?.shape === region.shape) return cached.cells;
      const cells = rasterizeRegion(region, cellsX, cellsZ);
      entries.set(region.id, { cells, shape: region.shape });
      return cells;
    }
  };
};

const finiteValues = (...values: number[]) => values.every(value => Number.isFinite(value));

/** False for non-finite numbers, a radius ≤ 0 or an empty rectangle (min ≥ max). */
const isShapeWellFormed = (shape: RegionShape) => {
  if (shape.kind === "point") return finiteValues(shape.x, shape.z, shape.facing);
  if (shape.kind === "rect") return finiteValues(shape.minX, shape.minZ, shape.maxX, shape.maxZ) &&
    shape.minX < shape.maxX && shape.minZ < shape.maxZ;
  return finiteValues(shape.centerX, shape.centerZ, shape.radius) && shape.radius > 0;
};

/** The whole shape lies on the map (a point in one of its cells). */
const isShapeInside = (shape: RegionShape, { cellsX, cellsZ }: RegionBounds) => {
  if (shape.kind === "point") return shape.x >= 0 && shape.x < cellsX && shape.z >= 0 && shape.z < cellsZ;
  if (shape.kind === "rect") return shape.minX >= 0 && shape.minZ >= 0 && shape.maxX <= cellsX &&
    shape.maxZ <= cellsZ;
  const { centerX, centerZ, radius } = shape;
  return centerX - radius >= 0 && centerZ - radius >= 0 && centerX + radius <= cellsX && centerZ + radius <= cellsZ;
};

/**
 * Library checks: unique ids, finite numbers, radius > 0, min < max and, when `bounds` is given, every shape inside
 * the map. Issues point at `regions[i]`.
 */
export const validateRegions = (regions: readonly MapRegion[], bounds?: RegionBounds): CampaignIssue[] => {
  const issues: CampaignIssue[] = [], seen = new Set<string>();
  regions.forEach((region, index) => {
    const path = `regions[${index}]`, regionId = region.id;
    if (seen.has(regionId)) issues.push(campaignIssue("error", "duplicateId", "regions", { id: regionId }));
    seen.add(regionId);
    if (!isShapeWellFormed(region.shape)) {
      issues.push(campaignIssue("error", "invalidRegionShape", `${path}.shape`, { regionId }));
      return;
    }
    if (bounds && !isShapeInside(region.shape, bounds))
      issues.push(campaignIssue("error", "regionOutOfBounds", `${path}.shape`, { regionId }));
  });
  return issues;
};
