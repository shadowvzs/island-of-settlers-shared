/** The map script engine (design §6, lane TRG2): pure, deterministic, worker- and server-safe. */
export { conditionDependencies, evaluateCondition, regionDependency } from "./conditions.ts";
export type { EvalFrame, ScriptEngineCore, ScriptLookup } from "./core.ts";
export { ScriptEngine, type ScriptEngineMode } from "./engine.ts";
export { playerFilterMatches } from "./event-matching.ts";
export { createEvalScope, evaluateExpr, resolveActors } from "./expressions.ts";
export { canonicalJson, hashCanonical, hashScriptRunState } from "./hash.ts";
export {
  campaignHomeReward, type CampaignMapStatus, campaignRewardEntries, nextHomeRewardOccurrence, replayAmount
} from "./home-rewards.ts";
export {
  buildIslandQuestDigest, createScriptIslandLifecycle, type ScriptIslandController, type ScriptIslandLifecycleOptions,
  type ScriptIslandSession
} from "./island-lifecycle.ts";
export {
  createNullWorldPort, type ScriptActionRequest, type ScriptActionResult, type ScriptEvalScope, type ScriptEvalValue,
  type ScriptLogCode, type ScriptLogEntry, type ScriptWorldPort
} from "./ports.ts";
export {
  PROXIMITY_EVENT_KINDS, PROXIMITY_MOVING_RADIUS_MAX, PROXIMITY_STATIC_RADIUS_MAX, type ProximityEventKind,
  type ProximityWatchEntry, proximityWatchEntries, watchesBridgeSteps
} from "./proximity-watch.ts";
export {
  claimedQuestState, decideQuestClaim, hasQuestCost, type QuestClaimDecision, type QuestClaimRefusal,
  type QuestClaimRequest, questClaimExperience
} from "./quest-claims.ts";
export {
  activationBaseline, eligibleQuestIds, isProgressComplete, isQuestEligible, isQuestFinished, isQuestSkippable,
  NO_QUEST_FACTS, objectiveCounterKey, objectiveProgress, type QuestFacts, type QuestProgress, questGroupsById
} from "./quests.ts";
export {
  buildRegionCellLists, isWildlifeSubject, REGION_EVENT_KINDS, type RegionCellLists, watchedRegions,
  type WildlifeCatalogLookup, wildlifePinnedRegionIds
} from "./region-watch.ts";
export { isClaimable, isRearmable, recordClaim, repeatWindow } from "./repeat-windows.ts";
export { nextRandom, randomBetween } from "./rng.ts";
export { createScriptRunState, migrateScriptRunState, type ScriptRunStateOptions } from "./run-state.ts";
export { SCRIPT_EVENT_KIND_INDEX, SCRIPT_EVENT_KINDS } from "./subscriptions.ts";
export type { ScriptTraceEntry, ScriptTraceSink } from "./trace.ts";
export {
  type HighlightUntil, type ResolvedUiTarget, type ScriptAudioEffect, type ScriptMailEffect, type ScriptUiEffect,
  type ScriptUiHighlight,
  UI_EFFECT_OPS, UI_EFFECT_OUTBOX_LIMIT
} from "./ui-effects.ts";
export { compareHandles, handleKey, sortedHandles } from "./values.ts";
