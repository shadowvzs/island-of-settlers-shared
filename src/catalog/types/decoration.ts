import type { ContentEntryBase } from "./entry.ts";

/**
 * Where a decoration model may be used (owner 2026-11-10): `shop` purchasable and placed by players,
 * `editor` placeable in the map editor palette, `building` used by building models (e.g. Japanese bamboo).
 */
export type DecorationUse = "shop" | "editor" | "building";
export type DecorationFinish = "limestone" | "granite" | "marble" | "native";
/** Release cohorts whose verified art made the item purchasable (receipts in the decoration reports). */
export type DecorationReleaseGate = "decoration" | "ornamentalPlant" | "plantCompletion";

/** Canonical ornamental plant asset of a plant decoration: species, structure variant and presentation. */
export interface DecorationPlant {
  form: "roadside" | "standalone";
  /** A palette changes instance colour, never the structural geometry identity. */
  palette: "default" | "yellow" | "orange";
  potted: boolean;
  /** Ornamental species id of the plant model recipes (`render-common/road-plant-catalog.ts`). */
  species: string;
  variant: 0 | 1 | 2;
}

/**
 * A placeable decoration model; `key` is the persisted content id. Every finish of `variants.finish` is one
 * inventory item `roadDecoration:{key}:{finish}` with its own custody, sold at `price` gems.
 */
export interface DecorationEntry extends ContentEntryBase<"decoration"> {
  decoration: {
    /** Acquisition limit counts held plus placed; returns transfer existing custody and cannot be lost. */
    maxHeld: number;
    nation: string;
    plant?: DecorationPlant;
    price: number;
    releaseGate?: DecorationReleaseGate;
    /** Purchasable in the gem shop now (never without the `shop` use). */
    shopAvailable: boolean;
    uses: readonly DecorationUse[];
  };
  variants: { finish: readonly DecorationFinish[] };
}
