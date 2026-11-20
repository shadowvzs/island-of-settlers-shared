import { entriesOfKind, entryByKey } from "./loader.ts";
import type { EconomyScope, WareEntry } from "./types/ware.ts";

/** Every active ware in catalog order. */
export const wareEntries = (): readonly WareEntry[] => entriesOfKind("ware");

/** The ware of a persisted key; undefined for unknown keys (legacy saves keep them). */
export const wareEntry = (key: string): WareEntry | undefined => entryByKey("ware", key);

const scopedKeys = new Map<EconomyScope, ReadonlySet<string>>();

/** Ware keys the API accepts in one economy scope (ledger grants, island stock, trades). */
export const economyWareKeys = (scope: EconomyScope): ReadonlySet<string> => {
  let keys = scopedKeys.get(scope);
  if (!keys) {
    keys = new Set(wareEntries().filter(entry => entry.ware.economy[scope]).map(entry => entry.key));
    scopedKeys.set(scope, keys);
  }
  return keys;
};

/** True for a real ware key accepted in the scope. */
export const isEconomyWare = (key: unknown, scope: EconomyScope): key is string =>
  typeof key === "string" && economyWareKeys(scope).has(key);

const TOOL_CATEGORY = "ware.tools";
const WEAPON_TAG = "weapon";

let weaponTools: readonly string[] | null = null;
/**
 * Keys of the tool-category wares that are also weapons (axe, bow), in catalog order (owner answer 66): a
 * dual-use ware keeps one category and carries the tags of both uses (`tool` + `weapon`), so tool lists that
 * are built from other groups (shop tabs, trade groups) find it by tag instead of a hard-coded key.
 */
export const weaponToolKeys = (): readonly string[] => (weaponTools ??= Object.freeze(wareEntries()
  .filter(entry => entry.category === TOOL_CATEGORY && entry.tags.includes(WEAPON_TAG)).map(entry => entry.key)));
