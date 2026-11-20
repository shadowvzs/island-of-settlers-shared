import type { CampaignRewardEntry } from "../types/rewards.ts";
import type { QuestRewards } from "../types/quests.ts";
import type { DeclaredHomeReward } from "../types/script.ts";
import { repeatWindow } from "./repeat-windows.ts";

/**
 * Home rewards outside the plain quest claim (TRG6): the campaign replay rule (trigger design §9.5, owner round 5
 * item 8, round 6 item 44) and the occurrence keys of declared trigger rewards (§4.14). Pure and shared, so the
 * client shows exactly what the server's claim route recomputes.
 */

/** Per-account status of a campaign map (C-plan campaign progress). */
export type CampaignMapStatus = "available" | "completed" | "notAvailable";

const REPLAY_SHARE_DIVISOR = 3;

/** One third, rounded half up (`1 → 0`, `5 → 2`, `10 → 3`). */
export const replayAmount = (amount: number) => Math.floor(amount / REPLAY_SHARE_DIVISOR + 0.5);

/**
 * The home reward of a claim on a campaign map: in full until the map is completed, then one third of every
 * numeric entry on every replay; non-numeric rewards (decorations, soldiers, settlers, building unlocks) are not
 * paid again and goods that round to 0 are left out.
 */
export const campaignHomeReward = (reward: QuestRewards, status: CampaignMapStatus): QuestRewards => {
  if (status !== "completed") return reward;
  return {
    buildingUnlocks: [],
    coins: replayAmount(reward.coins),
    decorations: [],
    gems: replayAmount(reward.gems),
    goods: reward.goods.map(line => ({ ...line, amount: replayAmount(line.amount) })).filter(line => line.amount > 0),
    xp: replayAmount(reward.xp)
  };
};

const NUMERIC_REPLAY_KINDS: ReadonlySet<CampaignRewardEntry["kind"]> = new Set(["coins", "gems", "ware", "xp"]);

/** The same replay rule for declared reward lines (RewardPicker entries). */
export const campaignRewardEntries = (
  entries: readonly CampaignRewardEntry[], status: CampaignMapStatus
): CampaignRewardEntry[] => {
  if (status !== "completed") return [...entries];
  return entries.flatMap(entry => {
    if (!NUMERIC_REPLAY_KINDS.has(entry.kind) || !("amount" in entry)) return [];
    const amount = replayAmount(entry.amount);
    return amount > 0 ? [{ ...entry, amount }] : [];
  });
};

/** What the run state remembers of a declared reward's grants. */
export interface GrantedHomeReward {
  count: number;
  /** `gameNow` of the first grant: anchors interval windows (fixed grid from the first activation). */
  firstUtc: number;
  lastWindow: number | null;
}

/**
 * The occurrence key the engine chooses for a grant at `now` (never the author's expressions): `once` → "0";
 * `window` → the grid window index (one grant per window); `counter` → the next free index below the maximum.
 * Null when this grant is not allowed (already granted, same window, or above the maximum).
 */
export const nextHomeRewardOccurrence = (
  reward: DeclaredHomeReward, granted: GrantedHomeReward | undefined, now: number
): string | null => {
  const occurrence = reward.occurrence;
  if (occurrence.kind === "once") return granted ? null : "0";
  if (occurrence.kind === "counter") {
    const index = granted?.count ?? 0;
    return index < occurrence.maxOccurrences ? String(index) : null;
  }
  const window = repeatWindow(occurrence.repeat, now, granted?.firstUtc ?? now);
  if (window === null) return granted ? null : "0";
  const last = granted?.lastWindow ?? null;
  return last !== null && window <= last ? null : String(window);
};

/** The remembered grants after a grant with occurrence `occurrence` at `now`. */
export const recordHomeRewardGrant = (
  granted: GrantedHomeReward | undefined, occurrence: string, now: number, windowed: boolean
): GrantedHomeReward => ({
  count: (granted?.count ?? 0) + 1,
  firstUtc: granted?.firstUtc ?? now,
  lastWindow: windowed ? Number(occurrence) : granted?.lastWindow ?? null
});
