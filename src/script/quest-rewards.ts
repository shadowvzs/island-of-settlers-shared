import type { CampaignSoldierType } from "../campaign/campaign-model.ts";
import type { RewardEntry } from "../catalog/types/reward.ts";
import type { QuestRewards } from "./types/quests.ts";

/**
 * Quest rewards ↔ RewardPicker lines (trigger design §13.6): the validator checks the lines with the catalog, the
 * editor edits them with the shared RewardPicker. Zero currencies are no line.
 */

const positive = (amount: number | undefined) => (amount ?? 0) > 0;

/** The reward lines of a quest reward (currencies first, then goods, decorations, soldiers, settlers, unlocks). */
export const questRewardEntries = (rewards: QuestRewards): RewardEntry[] => [
  ...(positive(rewards.xp) ? [{ amount: rewards.xp, kind: "xp" as const }] : []),
  ...(positive(rewards.coins) ? [{ amount: rewards.coins, kind: "coins" as const }] : []),
  ...(positive(rewards.gems) ? [{ amount: rewards.gems, kind: "gems" as const }] : []),
  ...rewards.goods.map(({ amount, ware }) => ({ amount, kind: "ware" as const, ware })),
  ...rewards.decorations.map(({ amount, item }) => ({ amount, item, kind: "decoration" as const })),
  ...(rewards.soldiers ?? []).map(({ amount, rank, type }) =>
    ({ amount, kind: "soldier" as const, ...(rank === undefined ? {} : { rank }), soldierType: type })),
  ...(positive(rewards.settlers) ? [{ amount: rewards.settlers!, kind: "settlers" as const }] : []),
  ...rewards.buildingUnlocks.map(buildingType => ({ buildingType, kind: "buildingUnlock" as const }))
];

const sumOf = (entries: readonly RewardEntry[], kind: "coins" | "gems" | "settlers" | "xp") => entries
  .reduce((total, entry) => (entry.kind === kind ? total + entry.amount : total), 0);

/** A quest reward from RewardPicker lines; null when no line is left (absent = no reward). */
export const questRewardsFromEntries = (entries: readonly RewardEntry[]): QuestRewards | null => {
  if (!entries.length) return null;
  const soldiers = entries.flatMap(entry => (entry.kind === "soldier" ? [{ amount: entry.amount,
    ...(entry.rank === undefined ? {} : { rank: entry.rank }), type: entry.soldierType as CampaignSoldierType }]
    : []));
  const settlers = sumOf(entries, "settlers");
  return {
    buildingUnlocks: entries.flatMap(entry => (entry.kind === "buildingUnlock" ? [entry.buildingType] : [])),
    coins: sumOf(entries, "coins"),
    decorations: entries.flatMap(entry => (entry.kind === "decoration"
      ? [{ amount: entry.amount, item: entry.item }] : [])),
    gems: sumOf(entries, "gems"),
    goods: entries.flatMap(entry => (entry.kind === "ware" ? [{ amount: entry.amount, ware: entry.ware }] : [])),
    ...(settlers > 0 ? { settlers } : {}),
    ...(soldiers.length ? { soldiers } : {}),
    xp: sumOf(entries, "xp")
  };
};
