import type { CampaignWareAmount } from "../../campaign/campaign-model.ts";
import type { RewardEntry } from "../../catalog/types/reward.ts";
import type { ScriptRef } from "./refs.ts";

/** One RewardPicker line, validated with the catalog (`validateRewardEntries`). */
export type CampaignRewardEntry = RewardEntry;

/** Goods lists keep bare ware keys (catalog plan §5.1). */
export type ScriptGoodsLine = CampaignWareAmount;

/** A soldier line of an action (enemy wave): catalog troop type, amount and an optional 0-based rank. */
export interface ScriptSoldierLine {
  amount: number;
  rank?: number;
  type: ScriptRef<"content">;
}
