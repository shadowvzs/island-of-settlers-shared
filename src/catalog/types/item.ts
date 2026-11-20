import type { ContentEntryBase } from "./entry.ts";

/** A personal consumable (choose nation, commander recovery); its category is the inventory tab. */
export interface ItemEntry extends ContentEntryBase<"item"> {
  item: {
    /** Personal items own independent hold limits; they are not warehouse goods. */
    maxHeld: number;
    /** Gem shop offer id (persisted in ledger details). */
    offerKey: string;
    price: number;
  };
}
