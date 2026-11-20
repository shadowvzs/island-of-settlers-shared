/**
 * Building geometry sidecars (content catalog plan §10.3, CAT8): the gameplay contract placement, logistics and
 * navigation read. Generated from the recipes by `npm run building-geometry`; the client's contract test keeps the
 * recipes and this data equal. Coordinates are building-local (+Z is the access side) before rotation.
 */
export type GeometryPoint = readonly [number, number, number];

export interface GeometryBox {
  max: GeometryPoint;
  min: GeometryPoint;
}

/** `data/buildings/<key>/geometry.json`: identical for every nation (placement uses the Roman base recipe). */
export interface BuildingGeometry {
  /** Doorway in recipe units: hinge point, opening width/height, arch spring, arched or flat lintel. */
  door: { height: number; hinge: GeometryPoint; profile: "arched" | "flat"; spring: number; width: number };
  /** Door-swing reservations in recipe units (barracks and forester only). */
  entrance: readonly GeometryBox[];
  ground: "building" | "mine";
  /** Logistics anchors in fitted grid units: door lane, worker approach, carrier handoff/queue, road end. */
  logistics: {
    carrierApproach: GeometryPoint;
    carrierHandoff: GeometryPoint;
    carrierQueue: readonly GeometryPoint[];
    doorThreshold: GeometryPoint;
    roadConnection: GeometryPoint;
    workerApproach: GeometryPoint;
    workerExit: GeometryPoint;
  };
  /** Work mechanism anchor in recipe units (well crank, mill rotor hub, …). */
  mechanism: GeometryPoint;
  /** The recipe's authoring translation, recipe units (shipyard). */
  modelOriginOffset?: GeometryPoint;
  /** Rotating sweeps reserved above the plot, recipe units (mill sails). */
  overhead: readonly { center: GeometryPoint; halfDepth: number; radius: number }[];
  /** Reserved grid cells and the one uniform recipe-to-grid scale both LODs share. */
  plot: { cells: readonly [number, number]; scale: number };
  /** Worker spawn/exit point in fitted grid units. */
  workerExit: GeometryPoint;
}

/** A navigation solid in fitted grid units; ellipses use the min/max envelope, `yaw` turns it about its centre. */
export interface NavigationVolume {
  id?: string;
  max: GeometryPoint;
  min: GeometryPoint;
  shape?: "box" | "ellipse";
  yaw?: number;
}

/**
 * A stored navigation solid: `[minX, minY, minZ, maxX, maxY, maxZ]`, optionally followed by
 * `shape` ("box" | "ellipse" | null), `yaw` (number | null) and `id` (string).
 */
export type EncodedNavigationVolume = readonly (number | string | null)[];

/**
 * A fixed stock display solid (hanging or non-ware stock), present while `slot < count(ware)` in the building's
 * input or output; it also joins a canonical slot of the same kind and number that shows `ware` or one of `wares`.
 */
export interface FixedStockVolume {
  kind: "input" | "output";
  slot: number;
  volume: EncodedNavigationVolume;
  ware: string;
  wares?: readonly string[];
}

/** Where a canonical stock slot seats a ware (recipe units, after bay packing); stacked slots name their support. */
export interface StockSlotPlacement {
  bottom: number;
  center: GeometryPoint;
  horizontalSpan: readonly [number, number];
  support?: StockSlotPlacement;
  yaw: number;
}

/**
 * A canonical stock slot: the `slot`-th unit of the concatenated counts of `wares` (default `[ware]`) picks the
 * ware shown; its solids are the ware model seated at this placement.
 */
export interface CanonicalStockSlot extends StockSlotPlacement {
  kind: "input" | "output";
  slot: number;
  ware: string;
  wares?: readonly string[];
}

export interface BuildingStockNavigation {
  fixed: readonly FixedStockVolume[];
  slots: readonly CanonicalStockSlot[];
}

/** One finished building level: rooms (never public), structural obstacles and live stock displays. */
export interface BuildingNavigationLevel {
  interiors: readonly EncodedNavigationVolume[];
  obstacles: readonly EncodedNavigationVolume[];
  stock: BuildingStockNavigation;
}

/**
 * `data/buildings/<key>/navigation/<nation>.json`: levels 1-5 in order; a number repeats the level it names
 * (1-based) when a level leaves the walkable area unchanged.
 */
export interface BuildingNavigationFile {
  levels: readonly (BuildingNavigationLevel | number)[];
}
