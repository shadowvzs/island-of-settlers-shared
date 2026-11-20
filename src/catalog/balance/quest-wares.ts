import { nationQuestWare } from "../building-data/drinks.ts";
import { buildingsWithRules } from "../building-data/rules.ts";
import { entriesOfKind } from "../loader.ts";
import { MAX_PLAYER_LEVEL } from "./levels.ts";
import { isQuestMaterialAvailable, materialMinimumLevel, SAWMILL_RECIPES } from "./materials.ts";
import { BIG_QUEST_LEVEL, MEDIUM_QUEST_LEVEL, QUEST_EXCLUDED_WARES, RELIEF_EXCLUDED_DONATIONS } from "./quests.ts";

export { nationQuestWare };

type QuestTier = "small" | "medium" | "big";
/** Per size tier: each ware and the lowest level that unlocks a building of that size making it. */
type WarePools = Readonly<Record<QuestTier, ReadonlyMap<string, number>>>;

const SAWMILL_LOGIC = "rule:production.sawmill";
let cachedPools: WarePools | undefined;

/** Mines count as medium buildings; buildings without a tier count as big. */
const questTier = (tier: string | undefined): QuestTier => {
  if (tier === "mines") return "medium";
  return (tier ?? "big") as QuestTier;
};

const addWare = (pool: Map<string, number>, ware: string, unlockLevel: number) => {
  pool.set(ware, Math.min(pool.get(ware) ?? unlockLevel, unlockLevel));
};

const buildWarePools = (): WarePools => {
  const pools: Record<QuestTier, Map<string, number>> = { big: new Map(), medium: new Map(), small: new Map() };
  for (const { rules } of buildingsWithRules()) {
    if (!rules.production) continue;
    const pool = pools[questTier(rules.progressionTier)];
    for (const ware of rules.production.outputs)
      if (!QUEST_EXCLUDED_WARES.has(ware)) addWare(pool, ware, rules.unlockLevel);
  }
  // The shared Sawmill owns all timber recipes; retired specialist mill ids have no rules.
  const sawmill = buildingsWithRules().find(({ rules }) => rules.production?.logic === SAWMILL_LOGIC)!.rules;
  const sawmillPool = pools[questTier(sawmill.progressionTier)];
  for (const recipe of SAWMILL_RECIPES)
    sawmillPool.set(recipe.output, Math.max(sawmill.unlockLevel, materialMinimumLevel(recipe.input)));
  return pools;
};

/** Wares a player can make, by the building size that makes them (static data, built once). */
const questWarePools = () => cachedPools ??= buildWarePools();

/**
 * Wares of these tiers whose building the level has unlocked (owner 2026-10-20: the daily quest asks only for
 * what the player can build), sorted.
 */
const unlockedWares = (pools: readonly ReadonlyMap<string, number>[], level: number) =>
  [...new Set(pools.flatMap(pool => [...pool].filter(([, unlock]) => unlock <= level).map(([ware]) => ware)))]
    .filter(ware => isQuestMaterialAvailable(ware, level)).sort();

/** Production quest wares of a player level. */
export const questWaresForLevel = (level: number) => {
  const pools = questWarePools();
  const tiers = [pools.small];
  if (level >= MEDIUM_QUEST_LEVEL) tiers.push(pools.medium);
  if (level >= BIG_QUEST_LEVEL) tiers.push(pools.big);
  return unlockedWares(tiers, level);
};

/**
 * Wares a delivery (paying) quest may ask for (owner, 2026-10-12): none before level 10 unless relief is available,
 * so early days are production quests only; a tier's wares become deliverable one tier after their production
 * quests arrived (small from level 10, medium from level 20, large never).
 */
export const legacyDeliveryWaresForLevel = (level: number, reliefAvailable = false) => {
  if (level < MEDIUM_QUEST_LEVEL && !reliefAvailable) return [];
  const pools = questWarePools();
  return unlockedWares(level >= BIG_QUEST_LEVEL ? [pools.small, pools.medium] : [pools.small], level);
};

/** New disaster-relief donations exclude weapons, armor and currency; ordinary tools remain eligible. */
export const deliveryWaresForLevel = (level: number, reliefAvailable?: boolean) =>
  (reliefAvailable === false ? [] : legacyDeliveryWaresForLevel(level, reliefAvailable))
    .filter(ware => !RELIEF_EXCLUDED_DONATIONS.has(ware));

/** Every ware a relief quest may ask for, in any nation's drink chain (the server's relief manifest check). */
export const reliefQuestWares = (): readonly string[] =>
  [...new Set(deliveryWaresForLevel(MAX_PLAYER_LEVEL, true).flatMap(ware =>
    entriesOfKind("nation").map(nation => nationQuestWare(ware, nation.key))))].sort();

/** The largest relief donation the server accepts. */
export const reliefQuestMaxAmount = () => Math.floor(MAX_PLAYER_LEVEL / 2) + 5;
