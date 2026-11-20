import { itemEntries, itemEntry } from "./catalog/index.ts";
import { getRoadDecorationItem, ROAD_DECORATION_ITEM_DEFINITIONS } from "./road-decoration-items.ts";

/**
 * Personal items: decoration items and the catalog's `item:*` consumables. They are distinct from island wares
 * and the trade wallet's goods, and each definition owns its own hold limit.
 */
export type PlayerItemId = string;
export interface PlayerItemDefinition {
  maxHeld: number;
  offerId: string;
  price: number;
  /** Sold in the gem shop now (staged decorations are only held, placed and returned). */
  shopAvailable: boolean;
}
export type PlayerInventory = Readonly<Partial<Record<PlayerItemId, number>>>;

const consumableDefinition = (key: string): PlayerItemDefinition | undefined => {
  const entry = itemEntry(key);
  if (!entry || entry.retired) return undefined;
  const { maxHeld, offerKey, price } = entry.item;
  return { maxHeld, offerId: offerKey, price, shopAvailable: true };
};

/** The definition of a personal item id; undefined for an unknown id. */
export const playerItemDefinition = (id: unknown): PlayerItemDefinition | undefined => {
  if (typeof id !== "string") return undefined;
  return getRoadDecorationItem(id) ?? consumableDefinition(id);
};

export const isPlayerItemId = (value: unknown): value is PlayerItemId => playerItemDefinition(value) !== undefined;
export const isPlayerItemAvailableForPurchase = (value: unknown) => playerItemDefinition(value)?.shopAvailable === true;

let byOfferId: ReadonlyMap<string, PlayerItemId> | undefined;
const offerIndex = () => byOfferId ??= new Map([
  ...Object.entries(ROAD_DECORATION_ITEM_DEFINITIONS).map(([id, item]) => [item.offerId, id] as const),
  ...itemEntries().map(entry => [entry.item.offerKey, entry.key] as const)
]);

/** The personal item a gem shop offer id sells, with its definition. */
export const playerItemForOfferId = (offerId: unknown) => {
  const id = typeof offerId === "string" ? offerIndex().get(offerId) : undefined;
  const definition = playerItemDefinition(id);
  return id && definition ? { id, ...definition } : undefined;
};

const consumable = (key: string) => consumableDefinition(key)!;
export const CHOOSE_NATION_PRICE = consumable("chooseNation").price;
export const CHOOSE_NATION_OFFER_ID = consumable("chooseNation").offerId;
export const COMMANDER_RECOVERY_PRICE = consumable("commanderRecovery").price;
export const COMMANDER_RECOVERY_OFFER_ID = consumable("commanderRecovery").offerId;

export const validPlayerInventory = (value: unknown): value is PlayerInventory => {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([id, count]) => {
    const definition = playerItemDefinition(id);
    return definition !== undefined && Number.isSafeInteger(count) && (count as number) > 0
      && (count as number) <= definition.maxHeld;
  });
};
