import { secondsToTicks, TICK_MS } from "../../time/constants.ts";
import type { ScriptEventKind } from "../catalog/events.ts";
import type { QuestDeadline } from "../types/quests.ts";
import type { QuestInstanceState, QuestRunState } from "../types/run-state.ts";
import type { MapScript } from "../types/script.ts";
import { questDependency } from "./conditions.ts";
import { EMPTY_FRAME, type ScriptEngineCore } from "./core.ts";
import { evaluateExpr } from "./expressions.ts";
import { campaignHomeReward } from "./home-rewards.ts";
import {
  claimedQuestState, decideQuestClaim, type QuestClaimDecision, type QuestClaimRequest
} from "./quest-claims.ts";
import { queueSequence } from "./cinematics.ts";
import { conditionObjectiveProgress } from "./quest-conditions.ts";
import { activationBaseline, NO_QUEST_FACTS } from "./quests.ts";
import { isRearmable } from "./repeat-windows.ts";

/**
 * Quest state machine (design §4.10): inactive → active → succeeded → claimed (hidden: automatically, live only) →
 * active again when the repeat window opens; active → failed (failure, deadline, `failQuest`) → `onFailure` → active
 * again only with `retryAfterFail` (visible: the player's "try again"; hidden: on the next evaluation). This module
 * owns the transitions, deadlines and claim bookkeeping, and starts the quest action lists as quest-owned runs.
 */

const MINUTE_MS = 60_000;

export type QuestList = "onActivate" | "onSuccess" | "onFailure";

/** Starts a quest action list as a run (implemented by the engine). */
export type StartQuestList = (questId: string, list: QuestList) => void;

export const initialQuestState = (): QuestInstanceState => ({
  activatedScriptTick: null, activatedTick: null, activatedUtc: null, claimCount: 0, failures: 0, lastClaims: [],
  lastWindow: null, state: "inactive"
});

export const initialQuests = (script: MapScript): QuestRunState =>
  Object.fromEntries(script.quests.quests.map(quest => [quest.id, initialQuestState()]));

export const questFactsOf = (core: ScriptEngineCore) => core.port.questFacts ?? NO_QUEST_FACTS;

const setQuest = (core: ScriptEngineCore, questId: string, next: QuestInstanceState, event: ScriptEventKind | null) => {
  const from = core.state.quests[questId]?.state ?? null;
  core.state.quests[questId] = next;
  if (from !== next.state) core.trace?.({ from, kind: "quest", questId, to: next.state });
  core.markDependency(questDependency(questId));
  if (!event) return;
  core.emit({ kind: event, responses: { quest: { type: "string", value: questId } }, values: { quest: questId } });
};

/** Activation: fresh script/game ticks and counter baseline; `activatedUtc` keeps the first activation (grids). */
export const activateQuest = (core: ScriptEngineCore, questId: string, start: StartQuestList) => {
  const quest = core.state.quests[questId];
  const definition = core.lookup.questById.get(questId);
  if (!quest || !definition || quest.state === "active" || quest.state === "retired") return;
  const { baseline: _old, ...rest } = quest;
  const baseline = activationBaseline(definition.objective, questFactsOf(core));
  setQuest(core, questId, {
    ...rest, activatedScriptTick: core.state.scriptTick, activatedTick: core.port.gameTick(),
    activatedUtc: quest.activatedUtc ?? core.port.gameNow(), ...(baseline === undefined ? {} : { baseline }),
    state: "active"
  }, "questActivated");
  if (definition.startSequence) queueSequence(core, definition.startSequence.id);
  start(questId, "onActivate");
};

/**
 * Claims a quest (the recorded claim command, or a hidden quest's automatic claim): readiness or skip, window,
 * cost (taken through the port), then `onSuccess`. A campaign replay pays one third of the home reward (§9.5).
 */
export const claimQuest = (
  core: ScriptEngineCore, questId: string, start: StartQuestList, request: QuestClaimRequest = { skip: false }
): QuestClaimDecision => {
  const definition = core.lookup.questById.get(questId);
  if (!definition) return { ok: false, reason: "notActive" };
  const now = core.port.gameNow();
  const decision = decideQuestClaim(core.script.quests, core.state.quests, definition, questFactsOf(core), request,
    now, objective => conditionObjectiveProgress(core, objective));
  if (!decision.ok) return decision;
  if (decision.cost.length && !core.port.payQuestCost?.(decision.cost)) return { ok: false, reason: "costShort" };
  setQuest(core, questId, claimedQuestState(definition, core.state.quests[questId]!, now, request.skip),
    "questClaimed");
  if (!request.skip) start(questId, "onSuccess");
  const status = core.port.campaignMapStatus?.();
  if (!status || !decision.homeReward) return decision;
  return { ...decision, homeReward: campaignHomeReward(decision.homeReward, status) };
};

/** Objective met. A hidden quest claims itself at once unless `autoClaim` is off (catch-up, design §7.4). */
export const succeedQuest = (core: ScriptEngineCore, questId: string, start: StartQuestList, autoClaim = true) => {
  const quest = core.state.quests[questId];
  if (quest?.state !== "active") return;
  setQuest(core, questId, { ...quest, state: "succeeded" }, "questSucceeded");
  const sequence = core.lookup.questById.get(questId)?.completeSequence;
  if (sequence) queueSequence(core, sequence.id);
  if (autoClaim && core.lookup.questById.get(questId)?.visibility === "hidden") claimQuest(core, questId, start);
};

export const failQuest = (core: ScriptEngineCore, questId: string, start: StartQuestList) => {
  const quest = core.state.quests[questId];
  if (quest?.state !== "active") return;
  setQuest(core, questId, { ...quest, failures: quest.failures + 1, state: "failed" }, "questFailed");
  start(questId, "onFailure");
};

/** "Try again": a failed quest with `retryAfterFail` becomes active with a fresh activation. */
export const retryQuest = (core: ScriptEngineCore, questId: string, start: StartQuestList) => {
  const quest = core.state.quests[questId];
  const definition = core.lookup.questById.get(questId);
  if (quest?.state !== "failed" || !definition?.repeat.retryAfterFail) return false;
  activateQuest(core, questId, start);
  return true;
};

/** `resetQuest`: back to inactive with a fresh activation (claim history kept). */
export const resetQuest = (core: ScriptEngineCore, questId: string) => {
  const quest = core.state.quests[questId];
  if (!quest || quest.state === "retired") return;
  const { baseline: _baseline, ...rest } = quest;
  setQuest(core, questId, { ...rest, activatedScriptTick: null, activatedTick: null, state: "inactive" }, null);
};

const dateAfterActivationMs = (deadline: Extract<QuestDeadline, { kind: "dateAfterActivation" }>) =>
  ((deadline.days * 24 + deadline.hours) * 60 + deadline.minutes) * MINUTE_MS;

const deadlineReached = (core: ScriptEngineCore, deadline: QuestDeadline, quest: QuestInstanceState) => {
  switch (deadline.kind) {
    case "playTime":
      return core.state.scriptTick - (quest.activatedScriptTick ?? core.state.scriptTick)
        >= secondsToTicks(deadline.seconds);
    case "gameTime":
      return (core.port.gameTick() - (quest.activatedTick ?? core.port.gameTick())) * TICK_MS
        >= deadline.seconds * 1000;
    case "date": {
      const at = evaluateExpr(core, EMPTY_FRAME, deadline.at);
      return typeof at === "number" && core.port.gameNow() >= at;
    }
    case "dateAfterActivation":
      return core.port.gameNow() >= (quest.activatedUtc ?? core.port.gameNow()) + dateAfterActivationMs(deadline);
  }
};

/** Date-bound deadline as `gameNow` UTC ms (quest digests); null for play time (frozen offline) or none. */
export const deadlineUtc = (core: ScriptEngineCore, deadline: QuestDeadline | null, quest: QuestInstanceState) => {
  if (!deadline || quest.activatedUtc === null) return null;
  if (deadline.kind === "gameTime") return quest.activatedUtc + deadline.seconds * 1000;
  if (deadline.kind === "dateAfterActivation") return quest.activatedUtc + dateAfterActivationMs(deadline);
  if (deadline.kind !== "date") return null;
  const at = evaluateExpr(core, EMPTY_FRAME, deadline.at);
  return typeof at === "number" ? at : null;
};

/**
 * Fails active quests whose deadline passed. `playTime` deadlines read the script clock and are skipped when
 * `datesOnly` (the single end-of-catch-up check, design §7.4).
 */
export const checkDeadlines = (core: ScriptEngineCore, start: StartQuestList, datesOnly: boolean) => {
  for (const definition of core.script.quests.quests) {
    const quest = core.state.quests[definition.id];
    const deadline = definition.deadline;
    if (quest?.state !== "active" || !deadline || (datesOnly && deadline.kind === "playTime")) continue;
    if (deadlineReached(core, deadline, quest)) failQuest(core, definition.id, start);
  }
};

/** Re-arms claimed repeating quests whose window opened (one-second cadence). */
export const rearmQuests = (core: ScriptEngineCore, start: StartQuestList) => {
  const now = core.port.gameNow();
  for (const definition of core.script.quests.quests) {
    const quest = core.state.quests[definition.id];
    if (quest && isRearmable(definition.repeat, quest, now)) activateQuest(core, definition.id, start);
  }
};

/** Quest actions of the catalogue (§5.2.6) mapped onto the transitions. */
export const applyQuestAction = (core: ScriptEngineCore, op: string, questId: string, start: StartQuestList) => {
  if (op === "activateQuest") activateQuest(core, questId, start);
  else if (op === "completeQuest") succeedQuest(core, questId, start);
  else if (op === "failQuest") failQuest(core, questId, start);
  else if (op === "resetQuest") resetQuest(core, questId);
};
