import type { ContentEntryBase } from "./entry.ts";

/** A gem shop ware bundle; `key` is the persisted offer id (`logs-100`), the category its shop tab. */
export interface OfferEntry extends ContentEntryBase<"offer"> {
  offer: {
    amount: number;
    /** Price in gems. */
    price: number;
    /** Construction material bundles carry their resource tier (always available, priced per tier). */
    resourceTier?: number;
    /** Ware key of the bundle. */
    ware: string;
  };
}
