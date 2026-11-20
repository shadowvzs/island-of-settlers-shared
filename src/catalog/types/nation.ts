import type {
  RockPaletteId,
  SandPaletteId,
  SoilPaletteId,
  TerrainGroundMaterial,
  TerrainGroundVariant
} from "../terrain.ts";
import type { ContentEntryBase } from "./entry.ts";

/** A nation's homeland palette: the render default and the palette values the homeland is typical of. */
export interface NationTerrainPalette {
  /** Heather moorland share 0..1 on exposed grass (cold, windy homeland). */
  heather?: number;
  /** Tropical jungle floor share 0..1 (dark, damp forest floor). */
  jungle?: number;
  rock: RockPaletteId;
  /** Every rock palette the homeland is typical of (editor tooltips); includes `rock`. */
  rockTypical: readonly RockPaletteId[];
  sand: SandPaletteId;
  /** Every sand palette the homeland is typical of; includes `sand`. */
  sandTypical: readonly SandPaletteId[];
  soil: SoilPaletteId;
  /** Every soil palette the homeland is typical of; includes `soil`. */
  soilTypical: readonly SoilPaletteId[];
}

/** A nation's homeland tree-mix lean (NATION-TERRAIN). */
export interface NationTerrainTrees {
  /** Lowland broadleaf weight multiplier (1 = the mixed temperate lowland). */
  broadleaf: number;
  /** Extra conifer (upland) weight 0..1, so pine stands reach the lowland too. */
  conifer: number;
  /** Forest amount offset -1..1 (negative: open prairie and savanna). */
  forest: number;
  /** Warm homeland palms 0..1: 0 keeps a cold coast free of palms. */
  palms: number;
}

/** A nation's homeland water lean: multipliers against the requested amount (1 = neutral). */
export interface NationTerrainWater {
  /** River amount multiplier, so a wet homeland keeps more streams and falls. */
  rivers: number;
  /** Ground wetness multiplier (1 = neutral): a wet jungle or a dry savanna. */
  wetness: number;
}

/**
 * NATION-TERRAIN (owner 2026-11-18): the landscape a nation's homeland leans to. One shared table in the nation
 * content data, read by the map editor (tile/grass/palette tooltips) and by the world generator (a bias, never a
 * rule). BIOME-GRASS: future savanna/jungle/forest grass plant ids join `cover`; the cover registry picks them up.
 */
export interface NationTerrainAffinity {
  /** Grass and meadow cover kinds its land grows (catalog `plant:*` ids); editor tooltips and cover favouring. */
  cover: readonly string[];
  /** Ground materials its land shows (editor tile association). */
  ground: readonly TerrainGroundMaterial[];
  palette: NationTerrainPalette;
  trees: NationTerrainTrees;
  /** Render-only ground variants its land shows (editor variant association). */
  variants: readonly TerrainGroundVariant[];
  water: NationTerrainWater;
}

/** A playable nation. `settlers` nations have their own settler models; the others are building-first. */
export interface NationEntry extends ContentEntryBase<"nation"> {
  nation: {
    settlers: boolean;
    /** Homeland landscape affinity; absent keeps the temperate defaults. */
    terrainAffinity?: NationTerrainAffinity;
  };
}
