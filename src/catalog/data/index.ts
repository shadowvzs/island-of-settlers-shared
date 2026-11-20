import { applyEntryDefaults, type EntryDefaults } from "../defaults.ts";
import type { ContentKind } from "../types/refs.ts";
import type { CatalogDataFile } from "../validate/index.ts";
import animals from "./animals.json" with { type: "json" };
import bandits from "./bandits.json" with { type: "json" };
import birds from "./birds.json" with { type: "json" };
import boats from "./boats.json" with { type: "json" };
import butterflies from "./butterflies.json" with { type: "json" };
import { BUILDING_FILES } from "./buildings/index.ts";
import categories from "./categories.json" with { type: "json" };
import commanders from "./commanders.json" with { type: "json" };
import critters from "./critters.json" with { type: "json" };
import defaults from "./defaults.json" with { type: "json" };
import plantDecorations from "./decorations/plants.json" with { type: "json" };
import structureDecorations from "./decorations/structures.json" with { type: "json" };
import deposits from "./deposits.json" with { type: "json" };
import fish from "./fish.json" with { type: "json" };
import items from "./items.json" with { type: "json" };
import music from "./music.json" with { type: "json" };
import nations from "./nations.json" with { type: "json" };
import offers from "./offers.json" with { type: "json" };
import plants from "./plants.json" with { type: "json" };
import settlers from "./settlers.json" with { type: "json" };
import shells from "./shells.json" with { type: "json" };
import ships from "./ships.json" with { type: "json" };
import sounds from "./sounds.json" with { type: "json" };
import soldiers from "./soldiers.json" with { type: "json" };
import stones from "./stones.json" with { type: "json" };
import trees from "./trees.json" with { type: "json" };
import wares from "./wares.json" with { type: "json" };
import whales from "./whales.json" with { type: "json" };

/**
 * The core catalog files, loaded eagerly: small entries only (ids, texts, icons, categories, families, tags,
 * small rules). Heavy per-entry data lives in lazily loaded sidecar files referenced by path.
 */
export const CORE_CATEGORIES: unknown = categories;

const FILE_DEFAULTS = defaults as Readonly<Record<string, EntryDefaults>>;
/** One data file; the model/sidecar references its entries share come from `defaults.json` (keyed by file). */
const dataFile = (file: string, kind: ContentKind, entries: unknown): CatalogDataFile =>
  ({ entries: applyEntryDefaults(entries, FILE_DEFAULTS[file]), file, kind });

export const CORE_DATA_FILES: readonly CatalogDataFile[] = [
  dataFile("nations.json", "nation", nations),
  dataFile("wares.json", "ware", wares),
  dataFile("decorations/structures.json", "decoration", structureDecorations),
  dataFile("decorations/plants.json", "decoration", plantDecorations),
  dataFile("items.json", "item", items),
  dataFile("offers.json", "offer", offers),
  dataFile("trees.json", "tree", trees),
  dataFile("stones.json", "stone", stones),
  dataFile("plants.json", "plant", plants),
  dataFile("shells.json", "shell", shells),
  dataFile("deposits.json", "deposit", deposits),
  dataFile("animals.json", "animal", animals),
  dataFile("critters.json", "critter", critters),
  dataFile("fish.json", "fish", fish),
  dataFile("whales.json", "whale", whales),
  dataFile("birds.json", "bird", birds),
  dataFile("butterflies.json", "butterfly", butterflies),
  dataFile("settlers.json", "settler", settlers),
  dataFile("soldiers.json", "soldier", soldiers),
  dataFile("commanders.json", "commander", commanders),
  dataFile("ships.json", "ship", ships),
  dataFile("boats.json", "boat", boats),
  ...BUILDING_FILES,
  dataFile("bandits.json", "bandit", bandits),
  dataFile("sounds.json", "sound", sounds),
  dataFile("music.json", "music", music)
];
