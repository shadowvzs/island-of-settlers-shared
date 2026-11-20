import { entriesOfKind, entryByKey } from "./loader.ts";
import type { DecorationEntry, DecorationFinish } from "./types/decoration.ts";
import type { ItemEntry } from "./types/item.ts";
import type { OfferEntry } from "./types/offer.ts";

/** Every active decoration in catalog order (structures first, then plant items). */
export const decorationEntries = (): readonly DecorationEntry[] => entriesOfKind("decoration");

/** The decoration of a persisted content id; undefined for an unknown id. */
export const decorationEntry = (key: string): DecorationEntry | undefined => entryByKey("decoration", key);

/** Inventory item id of one finish (persisted in wallets, custody records and command logs). */
export const decorationItemId = (key: string, finish: DecorationFinish) => `roadDecoration:${key}:${finish}`;

/** Gem shop offer id of one finish (persisted in ledger details). */
export const decorationOfferId = (key: string, finish: DecorationFinish) => `road-decoration-${key}-${finish}`;

/** Personal consumables (choose nation, commander recovery) in catalog order. */
export const itemEntries = (): readonly ItemEntry[] => entriesOfKind("item");

/** The consumable of a persisted item key. */
export const itemEntry = (key: string): ItemEntry | undefined => entryByKey("item", key);

/** Gem shop ware bundles in shop order. */
export const offerEntries = (): readonly OfferEntry[] => entriesOfKind("offer");
