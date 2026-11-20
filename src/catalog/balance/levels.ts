import { BALANCE } from "./data.ts";

const { baseSteps, gemRewardLevel, lastLevel, lateGrowthFrom, lateStepGrowth } = BALANCE.levels;

/** From this level each step is LATE_LEVEL_STEP_GROWTH times the previous one (owner 2026-10-20). */
export const LATE_LEVEL_GROWTH_FROM = lateGrowthFrom;
export const LATE_LEVEL_STEP_GROWTH = lateStepGrowth;

const lateLevelSteps = () => {
  const steps: number[] = [];
  let step = baseSteps[baseSteps.length - 1]!;
  for (let level = LATE_LEVEL_GROWTH_FROM; level <= lastLevel; level++) {
    step = Math.round(step * LATE_LEVEL_STEP_GROWTH / 1000) * 1000;
    steps.push(step);
  }
  return steps;
};

/**
 * Experience needed to reach each level from the previous one (index = level - 1): 100 per level early on, then
 * steep growth; from level 61 every step is ×1.10 of the previous (owner 2026-10-20, talent plan: levels 61–80
 * total ≈ 459M, last step ≈ 49M).
 */
export const LEVEL_STEPS: readonly number[] = Object.freeze([...baseSteps, ...lateLevelSteps()]);
export const MAX_PLAYER_LEVEL = LEVEL_STEPS.length;
/** Total experience at which each level starts (index = level - 1). */
export const LEVEL_THRESHOLDS: readonly number[] = Object.freeze(LEVEL_STEPS.reduce<number[]>(
  (totals, step, index) => [...totals, (index ? totals[index - 1]! : 0) + step], []));
/** Gems join the coin reward from this level on. */
export const GEM_REWARD_LEVEL = gemRewardLevel;

/** The level an experience total reaches. */
export const levelForExperience = (experience: number) => {
  let level = 1;
  while (level < MAX_PLAYER_LEVEL && LEVEL_THRESHOLDS[level]! <= experience) level++;
  return level;
};

/** The level a saved experience total proves (server): malformed totals make no claim beyond level 1. */
export const provenLevelForExperience = (experience: number) => {
  if (!Number.isFinite(experience) || experience < 0) return 1;
  return levelForExperience(experience);
};

/** Experience into the current level, the size of that level, and the fraction done. */
export const levelProgress = (experience: number) => {
  const level = levelForExperience(experience);
  const start = LEVEL_THRESHOLDS[level - 1]!;
  if (level === MAX_PLAYER_LEVEL) return { current: experience - start, fraction: 1, level, needed: 0 };
  const needed = LEVEL_STEPS[level]!;
  return { current: experience - start, fraction: Math.min(1, (experience - start) / needed), level, needed };
};

/** Coins on every level up; gems from GEM_REWARD_LEVEL, growing every five levels. */
export const levelUpReward = (level: number) => ({
  coins: 5 + level * 2,
  gems: level < GEM_REWARD_LEVEL ? 0 : 5 * (1 + Math.floor((level - GEM_REWARD_LEVEL) / 5))
});

/** Experience for finishing a building: bigger plots teach the settlers more. */
export const buildingExperience = (footprint: readonly [number, number]) => {
  const side = Math.max(...footprint);
  if (side <= 4) return 5;
  return side <= 5 ? 10 : 20;
};
