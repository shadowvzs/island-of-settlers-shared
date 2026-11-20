import type { RoadPlantId } from "./road-plant-catalog.ts";

/** Pure canonical-asset references only. No geometry, textures, shop exposure or wallet mutation lives here. */
export interface PlantDecorationAsset {
  species: RoadPlantId;
  variant: 0 | 1 | 2;
  potted: boolean;
  form: "roadside" | "standalone";
  /** A palette changes instance colour, never the structural geometry identity. */
  /** Legacy default is red foliage for red-maple; other species retain their authored palette. */
  palette: "default" | "yellow" | "orange";
  harvestable: false;
}
export type PlantDecorationContentId = `plant-${string}-${"roadside" | "standalone"}-${"pot" | "ground"}-${0 | 1 | 2}`;

/** The persisted content id of a plant asset (the catalog decoration key). Never rename saved ids. */
export const plantDecorationContentId = (asset: PlantDecorationAsset): PlantDecorationContentId => {
  let species: string = asset.species;
  if (asset.palette !== "default") species = `${species}-${asset.palette}`;
  return `plant-${species}-${asset.form}-${asset.potted ? "pot" : "ground"}-${asset.variant}`;
};
