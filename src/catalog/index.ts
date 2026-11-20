/** The content catalog: see README.md. Everything outside `catalog/` imports this module only. */
export { applyProgramOverlay, isProgramOverlay, resolveBuildPrograms } from "./ai/program-overlay.ts";
export { audioEntries, audioEntry, audioPayload, musicEntries, soundEntries } from "./audio.ts";
export {
  banditByMilitaryBuilding, banditEntries, banditEntry, banditMilitaryBuildingCode, isBanditSiteRef
} from "./bandits.ts";
export { buildingByKey, buildingEntries, buildingEntry } from "./buildings.ts";
export { CONTENT_KINDS } from "./constants.ts";
export { CORE_CATEGORIES, CORE_DATA_FILES } from "./data/index.ts";
export {
  decorationEntries, decorationEntry, decorationItemId, decorationOfferId, itemEntries, itemEntry, offerEntries
} from "./decorations.ts";
export { familyMatches, splitContentId, toContentId } from "./family.ts";
export {
  catalogEntries, categoriesOfKind, contentCatalogVersion, entriesInFamily, entriesOfKind, entriesWithTag, entryByCode,
  entryByKey, getContentEntry
} from "./loader.ts";
export { nationTerrainAffinity } from "./nations.ts";
export { fillPathTokens, type PathTokenValues } from "./paths.ts";
export { editorChoice, type EditorPlaceable, editorToolEntries, propEntries, propEntryByCode } from "./props.ts";
export { shipDeckCapacity, shipEntry, shipHull } from "./ships.ts";
export {
  ROCK_PALETTES, SAND_PALETTES, SOIL_PALETTES, TERRAIN_GROUND_MATERIALS, TERRAIN_GROUND_VARIANTS,
  type RockPaletteId, type SandPaletteId, type SoilPaletteId, type TerrainGroundMaterial,
  type TerrainGroundVariant
} from "./terrain.ts";
export { createSidecarLoader, type SidecarImporters } from "./sidecars.ts";
export { entryTokenValues, modelRecipeId, modelRecipeIds } from "./tokens.ts";
export type * from "./types/index.ts";
export {
  commanderEntries, commanderEntry, settlerByJob, settlerEntries, settlerJob, settlerTool, soldierEntries, soldierEntry
} from "./units.ts";
export {
  BUILDING_SIDECARS, type BuildProgramCatalog, buildProgramCatalog, type BuildProgramIssue,
  type BuildProgramIssueKind, buildingRulesOf, type CatalogIssue, type CatalogSource, constructionWares,
  goalPlaysFor, isBuildingPlaceableFor, productionWares, qualifierIssues, type RewardCheckOptions,
  TUNING_SIDECAR_RULES, validateBalance, validateBuildingSidecars, validateBuildPrograms, validateCatalog,
  validateRewardEntries, validateTuningSidecars
} from "./validate/index.ts";
export { economyWareKeys, isEconomyWare, wareEntries, wareEntry, weaponToolKeys } from "./wares.ts";
