import { type RoadDecorationItemId, roadDecorationItemIdsReleasedBy } from "./road-decoration-items.ts";
import type { RoadPlantId } from "./road-plant-catalog.ts";
import { type PlantDecorationAsset, plantDecorationContentId } from "./road-plant-items.ts";

/** Exact owner-authorized remaining cohort captured 2026-11-05 (catalog release gate `plantCompletion`). */
export const PLANT_COMPLETION_ITEM_ID_SET = roadDecorationItemIdsReleasedBy("plantCompletion");
export const PLANT_COMPLETION_ITEM_IDS: readonly RoadDecorationItemId[] = [...PLANT_COMPLETION_ITEM_ID_SET];
export const isPlantCompletionAsset = (asset: PlantDecorationAsset) =>
  PLANT_COMPLETION_ITEM_ID_SET.has(`roadDecoration:${plantDecorationContentId(asset)}:native`);

export type PlantCompletionModelFamily = "catalog-flowering" | "catalog-willow" | "catalog-columnar" |
  "catalog-palm" | "catalog-orchard" | "catalog-shrub" | "catalog-flower" | "catalog-bonsai";

const MODEL_FAMILY_BY_SPECIES: Readonly<Record<RoadPlantId, PlantCompletionModelFamily>> = {
  "cherry-blossom": "catalog-flowering", "white-cherry": "catalog-flowering",
  "pink-peach": "catalog-flowering", "white-peach": "catalog-flowering",
  "double-peach": "catalog-flowering", "red-maple": "catalog-flowering",
  "compact-willow": "catalog-willow", "silver-willow": "catalog-willow",
  "golden-willow": "catalog-willow", "narrow-willow": "catalog-willow",
  "columnar-cypress": "catalog-columnar", "italian-poplar": "catalog-columnar",
  "juniper-spire": "catalog-columnar", "date-palm": "catalog-palm",
  "fan-palm": "catalog-palm", "dwarf-coconut": "catalog-palm",
  "olive-standard": "catalog-orchard", "orange-standard": "catalog-orchard",
  "acacia-standard": "catalog-orchard", "italian-stone-pine": "catalog-orchard",
  "bonsai-pine": "catalog-bonsai", "bonsai-juniper": "catalog-bonsai",
  "bonsai-maple": "catalog-bonsai", "bonsai-azalea": "catalog-bonsai",
  boxwood: "catalog-shrub", "golden-boxwood": "catalog-shrub", "round-boxwood": "catalog-shrub",
  "round-myrtle": "catalog-shrub", myrtle: "catalog-shrub", azalea: "catalog-flower",
  "white-rose": "catalog-flower", "red-rose": "catalog-flower", lavender: "catalog-flower",
  rosemary: "catalog-flower", hibiscus: "catalog-flower", hydrangea: "catalog-flower", marigold: "catalog-flower"
};

/** Botanical routing is separate from native acceptance and purchase exposure. */
export const plantCompletionModelFamily = (asset: PlantDecorationAsset): PlantCompletionModelFamily | undefined =>
  isPlantCompletionAsset(asset) ? MODEL_FAMILY_BY_SPECIES[asset.species] : undefined;

/** Exact201 models passed native near-art review and actual-model icon export; publication follows runtime proof. */
export const PLANT_COMPLETION_NATIVE_ACCEPTED = true;
