import type { ExpeditionDifficulty } from "../types/balance.ts";
import { BALANCE } from "./data.ts";
import { ADVENTURE_DIFFICULTIES } from "./expeditions.ts";
import { LEVEL_STEPS, MAX_PLAYER_LEVEL } from "./levels.ts";

const { adventures } = BALANCE;

/** Small per-rank weights: a veteran is worth a quarter more, an elite half more. */
export const ADVENTURE_RANK_WEIGHTS = adventures.rankWeights;
/**
 * Difficulty points that fill one level, at anchor levels; linear in between, flat outside. Calibrated on the
 * standard adventures (medium 33.5 points, hard 69.75): about 7.5 medium adventures per level at 20, 22 hard ones
 * at 50 and 100 hard ones from 70; levels above 50 are noticeably harder.
 */
export const ADVENTURE_POINTS_PER_LEVEL = adventures.pointsPerLevel;
export const ADVENTURE_COINS_PER_POINT = adventures.coinsPerPoint;
export const ADVENTURE_WARES_PER_POINT = adventures.waresPerPoint;
/**
 * A conquered colony pays experience only (its reward is the island and its ore): half of what an adventure
 * against the same defenders would pay, so a conquest stays a small bonus.
 */
export const COLONY_CONQUEST_EXPERIENCE_SHARE = adventures.colonyConquestExperienceShare;

/** One hostile unit of an adventure and its rank. */
export interface AdventureEnemyUnit { rank: number }
export interface AdventureForce { units: readonly AdventureEnemyUnit[] }
export interface AdventureLoot { coins: number; wares: Readonly<Record<string, number>> }
export interface AdventureReward extends AdventureLoot { experience: number; points: number }

/** The ranks of one camp: they cycle through the difficulty's ranks. */
export const adventureCampRanks = (size: number, ranks: readonly number[]) =>
  Array.from({ length: size }, (_, index) => ranks[index % ranks.length]!);

/** The canonical enemy force of a difficulty for rewards: every camp unit. */
export const adventureForce = (difficulty: ExpeditionDifficulty): AdventureForce => {
  const { camps, ranks } = ADVENTURE_DIFFICULTIES[difficulty];
  return { units: camps.flatMap(size => adventureCampRanks(size, ranks).map(rank => ({ rank }))) };
};

const unitPoints = (unit: AdventureEnemyUnit) =>
  ADVENTURE_RANK_WEIGHTS[Math.max(0, Math.min(ADVENTURE_RANK_WEIGHTS.length - 1, unit.rank))]!;

/** Difficulty points: every enemy unit weighted by rank. */
export const adventurePoints = (force: AdventureForce) =>
  force.units.reduce((sum, unit) => sum + unitPoints(unit), 0);

/** Points that fill one level at the given player level (piecewise linear between the anchors). */
export const adventurePointsPerLevel = (level: number) => {
  const anchors = ADVENTURE_POINTS_PER_LEVEL;
  const first = anchors[0]!, last = anchors[anchors.length - 1]!;
  if (level <= first[0]) return first[1];
  if (level >= last[0]) return last[1];
  const upper = anchors.findIndex(([anchor]) => anchor >= level);
  const [fromLevel, fromPoints] = anchors[upper - 1]!, [toLevel, toPoints] = anchors[upper]!;
  return fromPoints + (toPoints - fromPoints) * (level - fromLevel) / (toLevel - fromLevel);
};

/** Experience of the player's current level step; the last level reuses the final step. */
const levelStep = (level: number) => LEVEL_STEPS[Math.max(1, Math.min(MAX_PLAYER_LEVEL - 1, level))]!;

/** Experience for a won adventure: its share of the current level, from the real XP curve. */
export const adventureExperience = (points: number, level: number) =>
  Math.max(1, Math.round(points * levelStep(level) / adventurePointsPerLevel(level)));

export const colonyConquestExperience = (points: number, level: number) =>
  Math.max(1, Math.round(adventureExperience(points, level) * COLONY_CONQUEST_EXPERIENCE_SHARE));

/** Coins and a ware bundle; they depend only on the adventure, never on the player's level. */
export const adventureLoot = (points: number): AdventureLoot => ({
  coins: Math.round(points * ADVENTURE_COINS_PER_POINT),
  wares: Object.fromEntries(Object.entries(ADVENTURE_WARES_PER_POINT)
    .map(([ware, perPoint]) => [ware, Math.max(1, Math.round(points * perPoint))]))
});

/** Everything a won adventure pays at the given player level. */
export const adventureReward = (force: AdventureForce, level: number): AdventureReward => {
  const points = adventurePoints(force);
  return { ...adventureLoot(points), experience: adventureExperience(points, level), points };
};

/** How many such adventures fill the level (for tuning and the planner's hint). */
export const adventuresPerLevel = (force: AdventureForce, level: number) =>
  levelStep(level) / adventureExperience(adventurePoints(force), level);

/**
 * Coins and wares the reward ship brings home after a victory (independent of the player's level); `lootBonus` is
 * the adventure loot talent's share, rounded per ware.
 */
export const adventureLootGoods = (difficulty: ExpeditionDifficulty, lootBonus = 0) => {
  const loot = adventureLoot(adventurePoints(adventureForce(difficulty)));
  const goods: Record<string, number> = { coins: loot.coins, ...loot.wares };
  return Object.fromEntries(Object.entries(goods).map(([ware, count]) =>
    [ware, Math.round(count * (1 + lootBonus))])) as { coins: number } & Record<string, number>;
};
