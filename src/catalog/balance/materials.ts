import type { ResourceTier } from "../types/balance.ts";
import { BALANCE } from "./data.ts";

/** One construction material tier: the base softwood/stone (0) and the colony materials 1..4. */
export interface ResourceTierPair {
  logs: string;
  planks: string;
  stone: string;
  tier: ResourceTier;
  wood: string;
}

/** Every material tier in tier order (0 softwood/stone, 1 hardwood/marble, … 4 mahogany/granite). */
export const RESOURCE_TIERS: readonly ResourceTierPair[] = Object.freeze(BALANCE.materials.tiers
  .map(({ logs, planks, stone, tier, wood }) => Object.freeze({ tier, wood, stone, logs, planks })));
/** Discovery pools and construction-material rewards follow the home-island progression. */
export const RESOURCE_TIER_MINIMUM_LEVEL: Readonly<Record<ResourceTier, number>> = Object.freeze(Object.fromEntries(
  BALANCE.materials.tiers.map(({ minimumLevel, tier }) => [tier, minimumLevel])) as Record<ResourceTier, number>);
/** Logs, planks and stone of every tier, in tier order. */
export const BUILDING_MATERIAL_ORDER: readonly string[] = Object.freeze(RESOURCE_TIERS
  .flatMap(pair => [pair.logs, pair.planks, pair.stone]));
/**
 * Sawmill recipes: level one is softwood; each later level adds the next tier and keeps every earlier recipe. Every
 * recipe shares the Sawmill's base cycle; harder woods are slower through `MATERIAL_TIER_TIME_STEP`.
 */
export const SAWMILL_RECIPES: readonly Readonly<{ input: string; output: string }>[] = Object.freeze(RESOURCE_TIERS
  .map(pair => Object.freeze({ output: pair.planks, input: pair.logs })));
/** Colony-only materials join daily quest wares and rewards from this level (owner 2026-10-20). */
export const QUEST_COLONY_MATERIAL_LEVEL = RESOURCE_TIER_MINIMUM_LEVEL[1];

const materialLevels: ReadonlyMap<string, number> = new Map(RESOURCE_TIERS.flatMap(pair =>
  [pair.logs, pair.planks, pair.stone].map(ware => [ware, RESOURCE_TIER_MINIMUM_LEVEL[pair.tier]] as const)));
/** The stone ware of every tier, in tier order (stone, marble, limestone, basalt, granite). */
export const STONE_TIER_WARES: readonly string[] = Object.freeze(RESOURCE_TIERS.map(pair => pair.stone));
/** The colony-only materials: logs, planks and stone of the tiers 1..4, in tier order. */
export const COLONY_MATERIAL_WARES: readonly string[] = Object.freeze(RESOURCE_TIERS.filter(pair => pair.tier > 0)
  .flatMap(pair => [pair.logs, pair.planks, pair.stone]));
const colonyMaterials: ReadonlySet<string> = new Set(COLONY_MATERIAL_WARES);

/** Ordinary wares stay visible; all three advanced materials unlock together with colony discovery. */
export const materialMinimumLevel = (ware: string) => materialLevels.get(ware) ?? 1;
export const isMaterialAvailable = (ware: string, playerLevel: number) =>
  playerLevel >= materialMinimumLevel(ware);

/** Catalog visibility never conceals actual stock imported from a legacy save, cargo or debug action. */
export const isMaterialVisible = (ware: string, playerLevel: number, owned = 0) =>
  owned > 0 || isMaterialAvailable(ware, playerLevel);

/** Daily quests ask for colony-only materials only from QUEST_COLONY_MATERIAL_LEVEL. */
export const isQuestMaterialAvailable = (ware: string, playerLevel: number) =>
  isMaterialAvailable(ware, playerLevel)
    && (playerLevel >= QUEST_COLONY_MATERIAL_LEVEL || !colonyMaterials.has(ware));
