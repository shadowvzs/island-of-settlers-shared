import type { AdventureDifficultyRule, ExpeditionDifficulty } from "../types/balance.ts";
import { BALANCE } from "./data.ts";

const { adventures, colonies, monument } = BALANCE;

/** A conquered colony is freed this long after its conquest (real days on the game clock, ageing while closed). */
export const COLONY_LIFETIME_MS = colonies.lifetimeDays * 24 * 60 * 60 * 1000;
/**
 * Primarily open field fights with sparse defences (owner decision 2026-10-15): camp sizes and the rank mix per
 * difficulty, so the reward points stay 15 / 33.5 / 69.75 (no enemy hero since 2026-10-13).
 */
export const ADVENTURE_DIFFICULTIES: Readonly<Record<ExpeditionDifficulty, AdventureDifficultyRule>> =
  adventures.difficulties;
/** Adventures offered at once; a new set appears after each finished adventure. */
export const ADVENTURE_OFFERS = adventures.offers;
/** One adventure island at a time; it never uses a colony slot. */
export const ADVENTURE_LIMIT = adventures.limit;
/**
 * A completed Monument on the home island (owner 2026-11-10): +25 % on every player experience gain (rounded down
 * per gain) and three tier-3 melee harbour defenders at every new colony and campaign landing. One Monument at
 * most; the bonus never stacks.
 */
export const MONUMENT_EXPERIENCE_BONUS_PERCENT = monument.experienceBonusPercent;
export const MONUMENT_START_DEFENDERS = monument.startDefenders;
/** Tier 3 of the three-rank scheme (recruit 0, soldier 1, centurion 2). */
export const MONUMENT_DEFENDER_RANK = monument.defenderRank;
