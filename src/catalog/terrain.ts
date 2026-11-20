/**
 * Terrain vocabularies shared by the nation content data and the map editor (NATION-TERRAIN, owner 2026-11-18).
 * The palette ids name render-only tint families (GROUND-PALETTE); the ground materials and variants are the
 * map editor's tile choices. Values are persisted or stored in nation data, so they never change.
 */
export const SAND_PALETTES = ["tan", "white", "golden", "grey", "red", "black", "pink"] as const;
export const SOIL_PALETTES = ["brown", "terraRossa", "laterite", "darkBrown", "loess", "chalk", "ash"] as const;
/** Bare rock colour family: grey, red sandstone, golden, cream limestone, dark basalt. */
export const ROCK_PALETTES = ["grey", "redSandstone", "golden", "limestone", "basalt"] as const;

export type SandPaletteId = (typeof SAND_PALETTES)[number];
export type SoilPaletteId = (typeof SOIL_PALETTES)[number];
export type RockPaletteId = (typeof ROCK_PALETTES)[number];

/** Ground splat materials a homeland landscape typically shows (map editor tile association). */
export const TERRAIN_GROUND_MATERIALS = [
  "grass", "lushGrass", "forestFloor", "dirt", "sand", "rock", "snow", "gravel", "mineGravel"
] as const;

export type TerrainGroundMaterial = (typeof TERRAIN_GROUND_MATERIALS)[number];

/** Render-only ground variants (GROUND-PALETTE step 2), in paint-channel order; tilled soil last. */
export const TERRAIN_GROUND_VARIANTS = [
  "coarse-stones", "moss", "swamp-mud", "cracked-earth", "tilled-soil"
] as const;

export type TerrainGroundVariant = (typeof TERRAIN_GROUND_VARIANTS)[number];
