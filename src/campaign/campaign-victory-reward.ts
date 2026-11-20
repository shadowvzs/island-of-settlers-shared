import { replayAmount } from "../script/engine/home-rewards.ts";
import type { CampaignMapRewards, CampaignRewardSoldier } from "./campaign-model.ts";

/**
 * The victory reward of a campaign map (C12, plan items 28/35/36). A first completion pays the map's whole reward
 * table; a replay pays one third of the numbers (coins, gems, XP, wares; the TRG7 replay rule) and nothing of the
 * decorations, soldiers or settlers; at most one replay reward per map and UTC day, a later replay that day pays
 * nothing. Pure and shared: the server's claim route and a guest's local claim compute the same payout.
 */

/** How a won attempt is paid: in full, as a replay third, or nothing (today's replay reward is already paid). */
export type CampaignVictoryKind = "capped" | "first" | "replay";

/**
 * The claim's error code while the server has not replayed the cloud-saved run yet (campaign server part 2): the
 * client asks again shortly.
 */
export const CAMPAIGN_VICTORY_PENDING = "CAMPAIGN_VICTORY_PENDING";

export interface CampaignVictoryPayout {
  coins: number;
  /** Decoration items (road decoration ids) and their counts; credited to the account directly. */
  decorations: Record<string, number>;
  gems: number;
  /** Wares (tools included), coins not among them; they sail home on the reward ship. */
  goods: Record<string, number>;
  settlers: number;
  soldiers: CampaignRewardSoldier[];
  xp: number;
}

export const EMPTY_VICTORY_PAYOUT: Readonly<CampaignVictoryPayout> = Object.freeze({
  coins: 0, decorations: {}, gems: 0, goods: {}, settlers: 0, soldiers: [], xp: 0
});

const count = (value: number | undefined) => Number.isSafeInteger(value) && value! > 0 ? value! : 0;

const sumLines = <T>(lines: readonly T[], key: (line: T) => string, amount: (line: T) => number) => {
  const totals: Record<string, number> = {};
  for (const line of lines) {
    const value = count(amount(line));
    if (value) totals[key(line)] = (totals[key(line)] ?? 0) + value;
  }
  return totals;
};

const thirds = (totals: Readonly<Record<string, number>>) => Object.fromEntries(Object.entries(totals)
  .map(([key, value]) => [key, replayAmount(value)] as const).filter(([, value]) => value > 0));

const firstPayout = (rewards: CampaignMapRewards): CampaignVictoryPayout => ({
  coins: count(rewards.coins),
  decorations: sumLines(rewards.decorations, line => line.item, line => line.amount),
  gems: count(rewards.gems),
  goods: sumLines(rewards.goods, line => line.ware, line => line.amount),
  settlers: count(rewards.settlers),
  soldiers: (rewards.soldiers ?? []).filter(line => count(line.amount) > 0).map(line => ({ ...line })),
  xp: count(rewards.xp)
});

/** The payout of a won attempt of `kind`. */
export const campaignVictoryPayout = (rewards: CampaignMapRewards, kind: CampaignVictoryKind): CampaignVictoryPayout => {
  if (kind === "capped") return { ...EMPTY_VICTORY_PAYOUT, decorations: {}, goods: {}, soldiers: [] };
  const full = firstPayout(rewards);
  if (kind === "first") return full;
  return { coins: replayAmount(full.coins), decorations: {}, gems: replayAmount(full.gems), goods: thirds(full.goods),
    settlers: 0, soldiers: [], xp: replayAmount(full.xp) };
};

/**
 * Without a home island only the account wallet can be paid (plan §9.3): gems and XP stay, the home-bound kinds
 * (coins, wares, decorations, settlers, soldiers) are dropped.
 */
export const walletOnlyVictoryPayout = ({ gems, xp }: CampaignVictoryPayout): CampaignVictoryPayout =>
  ({ ...EMPTY_VICTORY_PAYOUT, decorations: {}, gems, goods: {}, soldiers: [], xp });

/** The UTC calendar day (`YYYY-MM-DD`) of a time in ms: the replay cap's day. */
export const victoryDayKey = (time: number) => new Date(time).toISOString().slice(0, 10);

/**
 * The idempotency key of a victory reward: one per map for the first completion, one per map and UTC day for
 * replays (the daily cap is this key's uniqueness).
 */
export const campaignVictoryRef = (mapId: string, kind: Exclude<CampaignVictoryKind, "capped">, day: string) =>
  kind === "first" ? `cv:${mapId}` : `cv:${mapId}:${day}`;

/** The kind of a won attempt: a first completion unless the map was completed when the attempt started. */
export const campaignVictoryKind = (completedAtStart: boolean, replayPaidToday: boolean): CampaignVictoryKind => {
  if (!completedAtStart) return "first";
  return replayPaidToday ? "capped" : "replay";
};

/** True when the payout has nothing to deliver or credit. */
export const isEmptyVictoryPayout = (payout: CampaignVictoryPayout) =>
  !payout.coins && !payout.gems && !payout.xp && !payout.settlers && !payout.soldiers.length &&
  !Object.keys(payout.goods).length && !Object.keys(payout.decorations).length;
