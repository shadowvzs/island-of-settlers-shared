import { entryByKey } from "./loader.ts";
import type { NationTerrainAffinity } from "./types/index.ts";

/** The homeland landscape affinity of a nation; undefined while the nation keeps the temperate defaults. */
export const nationTerrainAffinity = (nation: string): NationTerrainAffinity | undefined =>
  entryByKey("nation", nation)?.nation.terrainAffinity;
