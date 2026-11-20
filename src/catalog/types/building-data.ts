import type { ContentText } from "./entry.ts";
import type { ContentId, RuleId } from "./refs.ts";
import type { WareAmounts } from "./units.ts";

/**
 * Building sidecar data (`data/buildings/<key>/rules.json` and `construction.json`, lane CAT7). The core entry
 * references both files by path; the simulation reads them through `catalog/building-data/*` (README, "Building
 * sidecars"). Ware lists name ware keys; a ware repeated in `inputs` is needed that many times per cycle.
 */

/** Silhouette family of the shared procedural recipe. */
export type BuildingStyleKey = "castle" | "cottage" | "hall" | "mill" | "mine" | "tower" | "well";
/** Animated work mechanism of the shared procedural recipe. */
export type BuildingMechanismKey = "crane" | "hammer" | "none" | "press" | "pump" | "saw" | "wheel";
/** Authored progression/architecture tier (daily quest pools, small-building architecture). */
export type BuildingProgressionTier = "big" | "medium" | "mines" | "small";
/** Where a building may stand on a colony: before the conquest (military plots) or only after it. */
export type BuildingColonyRule = "conquered" | "always";

/** Recipe inputs of the shared procedural model (style, roof, mechanism, props, model footprint class). */
export interface BuildingArt {
  /** Model metadata of the former workshop extension plots (3, 5, 6, 8, 15, 27). */
  extension: boolean;
  footprint: 1 | 2 | 3;
  mechanism: BuildingMechanismKey;
  props: readonly string[];
  roof: string;
  style: BuildingStyleKey;
}

/** One selectable shipyard order: what it builds and the wares one unit consumes. */
export interface BuildingProductionMode {
  builds: ContentId;
  inputs: WareAmounts;
}

/** A building's work cycle. `job` links the building to its `settler:*` worker. */
export interface BuildingProduction {
  /** Any one listed food per cycle (miners) instead of every input. */
  alternativeFood?: boolean;
  inputs: readonly string[];
  job: ContentId;
  /** Special production code that adjusts the rule (sawmill recipe choice, shipyard orders). */
  logic?: RuleId;
  /** Shipyard orders keyed by the saved mode id. */
  modes?: Readonly<Record<string, BuildingProductionMode>>;
  /** Outdoor work target kind (tree, fish, stone, plant, wildlife, field). */
  outdoor?: string;
  outputs: readonly string[];
  /** Plantation the worker sets around the house (drink chain growers). */
  plantation?: string;
  /** Authored cycle seconds at rate 1 (`production-timing.ts` scales them). */
  seconds: number;
  /** A service worker: no ware cycle. */
  service?: boolean;
}

/** Building levels 2–5: the upgrade family, what each level adds and the cost of each upgrade (index = saved level). */
export interface BuildingLevels {
  costs: readonly WareAmounts[];
  effects: readonly string[];
  family: string;
}

export interface BuildingLimits {
  colony?: BuildingColonyRule;
  /** On a campaign map only when its scenario allows the commander. */
  commanderCampaign?: boolean;
  homeOnly?: boolean;
  /** Counts every own site, construction included. */
  max?: number;
}

export interface BuildingMilitary {
  /** Archer posts on open tower decks (must match the recipe's `archerPositions`). */
  archerPosts?: number;
  /** Raid rule: `fort` garrison buildings take walls on the first assault; `support` buildings without garrison. */
  assault?: "fort" | "support";
  coinCapacity?: number;
  garrison?: number;
}

/** What a nation changes on its own variant (drink chain slots 5 and 6). */
export interface BuildingNationRules {
  production?: Pick<BuildingProduction, "inputs" | "job" | "outputs" | "plantation">;
  role?: ContentText;
}

/** `data/buildings/<key>/rules.json`. */
export interface BuildingRules {
  art: BuildingArt;
  levels?: BuildingLevels;
  limits?: BuildingLimits;
  military?: BuildingMilitary;
  nations?: Readonly<Record<string, BuildingNationRules>>;
  /** Shared shelf for the production outputs (nation outputs included); supplies and equipment do not count. */
  output?: { capacity: number };
  production?: BuildingProduction;
  progressionTier: BuildingProgressionTier;
  residence?: { growthSeconds: number; limit: number };
  /** What the building does, shown in the build menu: `content.building.<key>.role` and its English source. */
  role: ContentText;
  storage?: { capacity: number };
  /** Wall hit points once assaulted (BD1: every building type; a construction site has a share of them). */
  structureHp: number;
  /** Work animation id of the building's worker. */
  task: string;
  territoryRadius?: number;
  unlockLevel: number;
  /** The worker job (`settler:*`); absent for a building without a worker. */
  worker?: ContentId;
}

/** Measured at build time from the High, base-level model (tools/catalog/building-construction.ts). */
export interface ConstructionInputs {
  /** Occupied grid footprint [width, depth] in cells. */
  cells: readonly [number, number];
  /** Model height above the ground in tiles, rounded to 0.01. */
  height: number;
  triangles: number;
}

/** `data/buildings/<key>/construction.json`. */
export interface BuildingConstruction {
  /** Ware key → amount without a nation context (the shared base receipt). */
  cost: WareAmounts;
  /** An authored exception to the unified rule (the free headquarters, the all-tier monument). */
  fixed?: true;
  inputs?: ConstructionInputs;
  /**
   * Authored per-nation receipts (owner 2026-11-11: the pre-CAT7 national costs incl. the Indigenous cloth
   * receipts). A building without them pays the unified rule's `cost` in every nation.
   */
  nations?: Readonly<Record<string, WareAmounts>>;
}
