import { adventureLootGoods } from "./adventure-rewards.ts";
import { COLONY_LIFETIME_MS } from "./expeditions.ts";
import { levelUpReward, MAX_PLAYER_LEVEL } from "./levels.ts";
import { BUILDING_MATERIAL_ORDER, materialMinimumLevel } from "./materials.ts";
import { reliefQuestMaxAmount, reliefQuestWares } from "./quest-wares.ts";
import {
  DAILY_QUEST_COUNT, questMaterialAt, QUEST_REWARD_COINS_BASE, QUEST_REWARD_COINS_PER_LEVEL
} from "./quests.ts";
import { maxTalentShare, TALENT_RESET_GEMS } from "./talents.ts";

const levels = () => Array.from({ length: MAX_PLAYER_LEVEL }, (_, index) => index + 1);

/**
 * Everything the server economy decides from the game balance (phase B), as served by
 * `GET /v1/economy/game-catalog`: level-up rewards, the daily quest coin formula and material, adventure loot,
 * talent bonus caps, material unlock levels, relief quest limits and the talent reset price. The API computes it
 * once from this module; there is no generated copy.
 */
export const createEconomyCatalog = () => ({
  /** Coins and wares of a won adventure per difficulty, before the loot talent (D4 ledger credits). */
  adventureLoot: { easy: adventureLootGoods("easy"), hard: adventureLootGoods("hard"),
    medium: adventureLootGoods("medium") },
  /** Real-time lifetime of a conquered colony: the server's colony expiry timer (D4.4). */
  colonyLifetimeMs: COLONY_LIFETIME_MS,
  dailyQuestCount: DAILY_QUEST_COUNT,
  levelRewards: levels().map(level => ({ level, ...levelUpReward(level) })),
  /** Player level that unlocks each construction material (gem shop offers sell a ware from its level). */
  materialMinimumLevels: Object.fromEntries(BUILDING_MATERIAL_ORDER.map(ware => [ware, materialMinimumLevel(ware)])),
  questCoins: { base: QUEST_REWARD_COINS_BASE, perLevel: QUEST_REWARD_COINS_PER_LEVEL },
  /** Quest material per player level (index = level - 1): its pair's planks and stone and the amount. */
  questMaterial: levels().map(level => questMaterialAt(level)),
  reliefQuest: { maxAmount: reliefQuestMaxAmount(), wares: reliefQuestWares() },
  /** Talent shares at full ranks: the most a claimed quest or loot bonus may add. */
  talentBonusMax: { adventureLoot: maxTalentShare("adventureLoot"), questRewards: maxTalentShare("questRewards") },
  talentResetGems: TALENT_RESET_GEMS,
  version: 3
});

export type EconomyCatalog = ReturnType<typeof createEconomyCatalog>;
