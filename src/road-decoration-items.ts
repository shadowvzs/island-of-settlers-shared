import {
  type DecorationEntry, decorationEntries, type DecorationFinish, decorationItemId, decorationOfferId,
  type DecorationReleaseGate, type DecorationUse
} from "./catalog/index.ts";
import type { AccountNation } from "./contracts.ts";
import type { PlantDecorationAsset } from "./road-plant-items.ts";

/**
 * Decoration inventory items: a view over the content catalog's `decoration:*` entries (one item per finish).
 * Shared by inventory, verified world commands and shop receipts; the catalog is the only definition.
 */
export type RoadDecorationContentId = string;
export type RoadDecorationFinish = DecorationFinish;
export type DecorationShopCategory = "arches" | "plants" | "trees" | "lanterns" | "columns";
export type RoadDecorationItemId = `roadDecoration:${RoadDecorationContentId}:${RoadDecorationFinish}`;
export type { DecorationUse };
export interface RoadDecorationItemDefinition {
  offerId: string;
  price: number;
  /** Acquisition limit counts held plus placed; returns transfer existing custody and cannot be lost. */
  maxHeld: number;
  decoration: RoadDecorationContentId;
  finish: RoadDecorationFinish;
  nation: AccountNation;
  /** English source name (the catalog's `text.name.en`). */
  name: string;
  category: DecorationShopCategory;
  /** Staged assets are recognized for saved custody/rendering but cannot be newly sold or granted. */
  shopAvailable: boolean;
  /** Where the model may be used; without `shop` the item is never sold. */
  uses: readonly DecorationUse[];
  plant?: Readonly<PlantDecorationAsset>;
}
type DecorationItems = Readonly<Record<RoadDecorationItemId, RoadDecorationItemDefinition>>;

const CATEGORY_PREFIX = "decoration.";

const toPlantAsset = ({ decoration }: DecorationEntry): Readonly<PlantDecorationAsset> | undefined => {
  const plant = decoration.plant;
  if (!plant) return undefined;
  return Object.freeze({ ...plant, harvestable: false, species: plant.species as PlantDecorationAsset["species"] });
};

const toItems = (entry: DecorationEntry) => {
  const plant = toPlantAsset(entry);
  const { maxHeld, nation, price, shopAvailable, uses } = entry.decoration;
  return entry.variants.finish.map(finish => [decorationItemId(entry.key, finish), Object.freeze({
    category: entry.category.slice(CATEGORY_PREFIX.length) as DecorationShopCategory, decoration: entry.key,
    finish, maxHeld, name: entry.text.name.en, nation: nation as AccountNation, offerId: decorationOfferId(entry.key, finish),
    ...(plant ? { plant } : {}), price, shopAvailable, uses
  })] as const);
};

const itemsOf = (entries: readonly DecorationEntry[]): DecorationItems =>
  Object.freeze(Object.fromEntries(entries.flatMap(toItems)));

export const ROAD_DECORATION_ITEM_DEFINITIONS: DecorationItems = itemsOf(decorationEntries());

export const decorationUses = (item: Pick<RoadDecorationItemDefinition, "uses">): readonly DecorationUse[] =>
  item.uses;

export const isRoadDecorationItemId = (id: unknown): id is RoadDecorationItemId =>
  typeof id === "string" && Object.hasOwn(ROAD_DECORATION_ITEM_DEFINITIONS, id);
export const getRoadDecorationItem = (id: unknown) =>
  isRoadDecorationItemId(id) ? ROAD_DECORATION_ITEM_DEFINITIONS[id] : undefined;
/** The map editor palette offers the item (independent of its shop availability). */
export const isEditorDecorationItem = (item: Pick<RoadDecorationItemDefinition, "uses">) =>
  decorationUses(item).includes("editor");

/** Items of the decorations carrying a catalog tag (`original`, `addition`, `climber`, `column`, `plant`, …). */
export const roadDecorationItemsTagged = (tag: string): DecorationItems =>
  itemsOf(decorationEntries().filter(entry => entry.tags.includes(tag)));

/** Item ids a release cohort made purchasable (verified art, icons, runtime LOD and custody). */
export const roadDecorationItemIdsReleasedBy = (gate: DecorationReleaseGate): ReadonlySet<RoadDecorationItemId> =>
  new Set(Object.keys(itemsOf(decorationEntries().filter(entry => entry.decoration.releaseGate === gate)))
    .map(id => id as RoadDecorationItemId));
