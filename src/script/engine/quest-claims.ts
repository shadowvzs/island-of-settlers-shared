import type { CampaignWareAmount } from "../../campaign/campaign-model.ts";
import { LEVEL_THRESHOLDS } from "../../catalog/balance/levels.ts";
import type { QuestBook, QuestRewards, ScriptQuest } from "../types/quests.ts";
import type { QuestInstanceState, QuestRunState } from "../types/run-state.ts";
import {
  isLastOpenOfGroup, isProgressComplete, isQuestSkippable, objectiveProgress, type QuestConditionCheck,
  type QuestFacts
} from "./quests.ts";
import { isClaimable, recordClaim } from "./repeat-windows.ts";

/**
 * The claim decision of a quest (TRG6, QU §7.4, trigger design §4.10): readiness or the skip rule, the repeat
 * window, the cost on every map kind (owner 41) and the experience with the group's top-up. Pure; the engine and
 * the home runtime apply the result (state, cost through the recorded claim command, rewards).
 */

export type QuestClaimRefusal = "costShort" | "notActive" | "notClaimable" | "notReady" | "notSkippable";

export interface QuestClaimRequest {
  /** The player's experience before the claim: enables the group top-up (home books). */
  playerExperience?: number;
  skip: boolean;
}

export type QuestClaimDecision =
  | { cost: CampaignWareAmount[]; experience: number; homeReward: QuestRewards | null; ok: true }
  | { ok: false; reason: QuestClaimRefusal };

const isOpen = (state: QuestInstanceState) => state.state === "active" || state.state === "succeeded";

/** Succeeded, or active with the objective met now (live facts, as the tutorial checked at claim). */
const isReady = (quest: ScriptQuest, state: QuestInstanceState, facts: QuestFacts, condition?: QuestConditionCheck) =>
  state.state === "succeeded" || isProgressComplete(objectiveProgress(quest.objective, state, facts, condition));

/** Every cost line is in the island stock (the claim is refused when short, today's delivery rule). */
export const hasQuestCost = (quest: ScriptQuest, facts: QuestFacts) =>
  quest.cost.every(line => facts.stock(facts.questWare(line.ware), null) >= line.amount);

/** The experience a claim pays: the quest's own (0 when skipped), topped up to the next level by a group's end. */
export const questClaimExperience = (
  book: QuestBook, states: QuestRunState, quest: ScriptQuest, request: QuestClaimRequest
) => {
  const own = request.skip ? 0 : quest.homeReward?.xp ?? 0;
  const group = quest.groupId ? book.groups.find(entry => entry.id === quest.groupId) : undefined;
  if (group?.completionTopUp !== "nextLevel" || !group.unlock || request.playerExperience === undefined) return own;
  if (!isLastOpenOfGroup(book, states, quest)) return own;
  const nextLevelStart = LEVEL_THRESHOLDS[group.unlock.level];
  return nextLevelStart === undefined ? own : Math.max(own, nextLevelStart - request.playerExperience);
};

const refusal = (reason: QuestClaimRefusal): QuestClaimDecision => ({ ok: false, reason });

const readinessRefusal = (
  quest: ScriptQuest, state: QuestInstanceState, facts: QuestFacts, request: QuestClaimRequest,
  condition?: QuestConditionCheck
): QuestClaimRefusal | null => {
  if (request.skip) return isQuestSkippable(quest, facts) ? null : "notSkippable";
  return isReady(quest, state, facts, condition) ? null : "notReady";
};

/** Whether (and what) the quest pays when claimed at `now`; nothing is changed. */
export const decideQuestClaim = (
  book: QuestBook, states: QuestRunState, quest: ScriptQuest, facts: QuestFacts, request: QuestClaimRequest,
  now: number, condition?: QuestConditionCheck
): QuestClaimDecision => {
  const state = states[quest.id];
  if (!state || !isOpen(state)) return refusal("notActive");
  const notReady = readinessRefusal(quest, state, facts, request, condition);
  if (notReady) return refusal(notReady);
  if (!isClaimable(quest.repeat, { ...state, state: "succeeded" }, now)) return refusal("notClaimable");
  if (!request.skip && !hasQuestCost(quest, facts)) return refusal("costShort");
  return {
    cost: request.skip ? [] : quest.cost,
    experience: questClaimExperience(book, states, quest, request),
    homeReward: request.skip ? null : quest.homeReward ?? null,
    ok: true
  };
};

/** The claimed state: count, bounded dates, window index and the skip mark. */
export const claimedQuestState = (
  quest: ScriptQuest, state: QuestInstanceState, now: number, skip: boolean
): QuestInstanceState => {
  const { skipped: _skipped, ...claimed } = recordClaim(quest.repeat, { ...state, state: "succeeded" }, now);
  return skip ? { ...claimed, skipped: true } : claimed;
};
