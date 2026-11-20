import type { ScriptEngineCore } from "./core.ts";
import { nextHomeRewardOccurrence, recordHomeRewardGrant } from "./home-rewards.ts";

/**
 * The declared-reward claim queue (TRG6, design §4.14): `grantHomeReward` pays nothing in the simulation. It appends
 * `{ rewardId, occurrence }` to `pendingHomeClaims` (saved, hashed) with the occurrence the engine chooses; the
 * client submits the queue to the server claim route and drops an entry once the ledger confirmed it.
 */

export const grantHomeReward = (core: ScriptEngineCore, rewardId: string) => {
  const reward = core.script.homeRewards.find(entry => entry.id === rewardId);
  if (!reward) {
    core.log("unknownReference", `reward ${rewardId}`);
    return;
  }
  const granted = core.state.grantedHomeRewards?.[rewardId];
  const now = core.port.gameNow();
  const occurrence = nextHomeRewardOccurrence(reward, granted, now);
  if (occurrence === null) {
    core.log("actionFailed", `grantHomeReward ${rewardId}: occurrence already granted`);
    return;
  }
  const windowed = reward.occurrence.kind === "window";
  core.state.grantedHomeRewards = {
    ...core.state.grantedHomeRewards, [rewardId]: recordHomeRewardGrant(granted, occurrence, now, windowed)
  };
  core.state.pendingHomeClaims.push({ occurrence, rewardId });
};

/** Removes a confirmed claim from the queue; false when it was not queued. */
export const confirmHomeClaim = (core: ScriptEngineCore, rewardId: string, occurrence: string) => {
  const index = core.state.pendingHomeClaims.findIndex(entry =>
    entry.rewardId === rewardId && entry.occurrence === occurrence);
  if (index < 0) return false;
  core.state.pendingHomeClaims.splice(index, 1);
  return true;
};
