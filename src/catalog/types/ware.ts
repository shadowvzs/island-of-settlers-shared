import type { ContentEntryBase } from "./entry.ts";

/** Where the API accepts a ware: ledger grants/rewards, island stock moves, player-to-player trades. */
export type EconomyScope = "ledger" | "stock" | "trade";

/**
 * A ware. Countable wares have `text.plural` (ICU one/other); mass nouns and names that are already plural
 * have none. Tools carry the `tool` tag; hand carts (`notCarried`) are never carried as goods.
 * A ware has exactly one category (`ware.food` = meat, fish, bread; `ware.drink` = beer and the nation drinks;
 * `ware.foodChain` = their ingredients); a second use is a tag: `weapon` on dual-use tools, `money` on coins.
 */
export interface WareEntry extends ContentEntryBase<"ware"> {
  ware: {
    /** Lower-case spellings `resolveWareId` also accepts ("timber" → logs). */
    aliases?: readonly string[];
    /** Relative cargo box size by weight and bulk (logs 3 … ore 16); a box holds five times this many units. */
    boxSize: number;
    economy: Readonly<Record<EconomyScope, boolean>>;
    /** Light ingredients cradled in front with the two-hand support rig. */
    handCarried?: true;
  };
}
