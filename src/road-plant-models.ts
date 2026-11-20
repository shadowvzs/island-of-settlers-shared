import { PLANT_COMPLETION_NATIVE_ACCEPTED, type PlantCompletionModelFamily, plantCompletionModelFamily } from "./road-plant-completion.ts";
import type { PlantDecorationAsset } from "./road-plant-items.ts";

export type OrnamentalModelSpecies = "bonsai-elm" | "flowering-peach" | "maple-tree" | "roadside-shrub" |
  "willow-tree" | "cypress-tree" | PlantCompletionModelFamily;
export type OrnamentalPlantTier = "near" | "far" | "overview";
/** Revised maple C: Minimal's closed shoots/petioles are charged without changing shared scene budgets. */
export const MAPLE_MODEL_TRIANGLE_COST = Object.freeze({ high: 24000, minimal: 8075, far: 2116 });

/** Accepted tree silhouettes use calibrated actual-model renders at small screen sizes. */
export const ornamentalPlantUsesCanonicalIcon = (asset: PlantDecorationAsset | undefined, tier: OrnamentalPlantTier) => {
  if (tier === "overview") return true;
  if (tier !== "far" || !asset) return false;
  const model = ornamentalPlantModel(asset);
  return model === "willow-tree" || model === "catalog-flowering" ||
    model === "catalog-shrub" || model === "catalog-flower";
};

/** Botanical identity is independent of persistent SKU spelling. Never rename saved item IDs. */
export const ornamentalPlantModel = (asset: PlantDecorationAsset): OrnamentalModelSpecies | undefined => {
  if (asset.species === "compact-willow" && asset.form === "standalone" && !asset.potted) return "willow-tree";
  if (asset.species === "columnar-cypress" && asset.form === "roadside" && !asset.potted) return "cypress-tree";
  if (asset.species === "bonsai-maple" && asset.potted) return "bonsai-elm";
  // The accepted mature maple has a broad, low crown: it is not the narrow roadside recipe.
  if (asset.species === "red-maple" && asset.form === "standalone") return "maple-tree";
  if (asset.species === "pink-peach" && asset.form === "standalone" && !asset.potted) return "flowering-peach";
  if (asset.species === "round-boxwood" && asset.variant === 0 ||
    asset.species === "round-myrtle" && asset.variant === 1 ||
    asset.species === "myrtle" && asset.variant === 2) return "roadside-shrub";
  return plantCompletionModelFamily(asset);
};

/** Whole-asset art readiness only; purchase exposure also waits its production/icon verification. */
export const ornamentalPlantArtReady = (asset: PlantDecorationAsset) => {
  const species = ornamentalPlantModel(asset);
  if (species?.startsWith("catalog-")) return PLANT_COMPLETION_NATIVE_ACCEPTED;
  // Cypress E/F and revised Willow B passed owner/root High/Minimal review.
  if (species === "cypress-tree" || species === "willow-tree") return true;
  // Windswept Elm left counterbranches passed the corrected High/Minimal runtime-angle proof.
  if (species === "bonsai-elm") return true;
  return species === "roadside-shrub" || species === "maple-tree" || species === "flowering-peach";
};
