import type { ContentEntryBase } from "./entry.ts";

/**
 * A building type (`building:<key>`); `code` is the persisted `BuildingType` id. The core entry holds the names
 * (nation names in `text.variants`), the building panel tab (`category`), family, tags, level axis, icon and
 * actor block; costs, production, levels and geometry are added by the building lanes (CAT7/CAT8) as sidecars.
 */
export interface BuildingEntry extends ContentEntryBase<"building"> {
  building: {
    /** False for the headquarters (founded with the island, never offered for construction) and retired types. */
    placeable: boolean;
  };
  code: number;
}
