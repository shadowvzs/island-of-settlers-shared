import { BALANCE } from "./data.ts";
import { QUEST_COLONY_MATERIAL_LEVEL, RESOURCE_TIER_MINIMUM_LEVEL, RESOURCE_TIERS } from "./materials.ts";

const QUESTS = BALANCE.quests;

/** One daily quest per day (owner 2026-10-20: it pays goods too, so XP and goods per day stay modest). */
export const DAILY_QUEST_COUNT = QUESTS.dailyCount;
/**
 * Goods a daily quest pays besides experience (owner 2026-10-20): coins like a level-up plus a small fixed share,
 * and a bundle of the newest building material the player's level unlocks (what the home island cannot make
 * itself, needed for upgrades). Below QUEST_COLONY_MATERIAL_LEVEL it pays plain planks or stone instead.
 */
export const QUEST_REWARD_COINS_BASE = QUESTS.rewardCoinsBase;
export const QUEST_REWARD_COINS_PER_LEVEL = QUESTS.rewardCoinsPerLevel;
export const QUEST_REWARD_MATERIAL_BASE = QUESTS.rewardMaterialBase;
/** One more material item every this many levels. */
export const QUEST_REWARD_MATERIAL_LEVELS = QUESTS.rewardMaterialLevels;
/** Medium buildings' wares join the quests from this level, large buildings' from the next. */
export const MEDIUM_QUEST_LEVEL = QUESTS.mediumLevel;
export const BIG_QUEST_LEVEL = QUESTS.bigLevel;
/** Basic wares come in bigger batches than crafted or heavy ones. */
export const QUEST_WARE_BATCH = QUESTS.wareBatch;
export const QUEST_TOOL_BATCH = QUESTS.toolBatch;
export const QUEST_EXPERIENCE_SHARE = QUESTS.experienceShare;
export const QUEST_MINIMUM_EXPERIENCE = QUESTS.minimumExperience;
/** Wares no daily quest asks for. */
export const QUEST_EXCLUDED_WARES: ReadonlySet<string> = new Set(QUESTS.excludedWares);
/** New disaster-relief donations exclude weapons, armor and currency; ordinary tools remain eligible. */
export const RELIEF_EXCLUDED_DONATIONS: ReadonlySet<string> = new Set(QUESTS.excludedDonations);
/** Wares a relief donation never carries: the excluded quest wares and the excluded donations. */
export const RELIEF_FORBIDDEN_WARES: ReadonlySet<string> =
  new Set([...QUESTS.excludedDonations, ...QUESTS.excludedWares]);
/** The finite supply task of each tutorial chapter (index = chapter - 1). */
export const TUTORIAL_RESERVE_WARES = QUESTS.tutorialReserveWares;

const STONE_QUEST_WARES: ReadonlySet<string> = new Set(QUESTS.stoneMaterialWares);

/** The newest resource pair the player's level unlocks: plain planks and stone below the colony level. */
const newestMaterialPair = (level: number) => {
  if (level < QUEST_COLONY_MATERIAL_LEVEL) return RESOURCE_TIERS[0]!;
  return [...RESOURCE_TIERS].reverse().find(pair => level >= RESOURCE_TIER_MINIMUM_LEVEL[pair.tier])
    ?? RESOURCE_TIERS[0]!;
};

/** Which material of the level's pair a quest of `ware` pays: stone for stone and mining quests, else planks. */
const questMaterialKind = (ware: string): "planks" | "stone" => STONE_QUEST_WARES.has(ware) ? "stone" : "planks";

/** The material kind a generated quest reward pays (what a signed-in claim asks the server for). */
export const questRewardMaterialKind = (reward: Readonly<Record<string, number>>): "planks" | "stone" =>
  RESOURCE_TIERS.some(pair => pair.stone in reward) ? "stone" : "planks";

/** A level's quest material: its pair's planks and stone and the amount. */
export const questMaterialAt = (level: number) => {
  const pair = newestMaterialPair(level);
  return { amount: QUEST_REWARD_MATERIAL_BASE + Math.floor(level / QUEST_REWARD_MATERIAL_LEVELS),
    planks: pair.planks, stone: pair.stone };
};

/** The coins of a daily quest at the player's level. */
export const questCoins = (level: number) => QUEST_REWARD_COINS_BASE + QUEST_REWARD_COINS_PER_LEVEL * level;

/** Goods of a daily quest set when it is generated: coins and the level's material bundle. */
export const dailyQuestGoods = (level: number, ware: string): Record<string, number> => {
  const material = questMaterialAt(level);
  return { coins: questCoins(level), [material[questMaterialKind(ware)]]: material.amount };
};
