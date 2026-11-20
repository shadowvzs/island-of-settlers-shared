import type { ScriptActionKind } from "./catalog/actions.ts";
import type { ScriptEventKind } from "./catalog/events.ts";
import type { BuiltInQuestObjectiveKind } from "./types/quests.ts";
import type { MapKind } from "./types/refs.ts";
import type { UiTargetKind } from "./types/ui.ts";

/**
 * What each map kind hides (trigger design §0 item 1, QU §3.2 table): one document shape for every map kind, and
 * this table refuses the kinds that make no sense there (e.g. victory on a home island).
 */
export interface ScriptScope {
  actions: readonly ScriptActionKind[];
  events: readonly ScriptEventKind[];
  objectives: readonly BuiltInQuestObjectiveKind[];
  uiTargets: readonly UiTargetKind[];
}

const COLONY_EVENTS: readonly ScriptEventKind[] = ["colonyConquered", "colonyDefeated", "colonyAbandoned"];
/** Trading exists only on the home island (owner 2026-10-19): its events can never fire on these map kinds. */
const TRADE_EVENTS: readonly ScriptEventKind[] = ["wareBought", "wareSold", "tradeDeliveryArrived"];
/** A home map has no computer faction (enemy economy AI plan §5.2): these can never fire there. */
const FACTION_EVENTS: readonly ScriptEventKind[] =
  ["factionBuildingStarted", "factionBuildingCompleted", "factionAttackLaunched"];
const NOT_ON_HOME_UI: readonly UiTargetKind[] = ["gemShop"];

export const SCRIPT_SCOPES: Readonly<Record<MapKind, ScriptScope>> = Object.freeze({
  adventure: {
    actions: ["colonyEnd"],
    events: [...COLONY_EVENTS, ...TRADE_EVENTS],
    objectives: ["victory", "defeat"],
    uiTargets: NOT_ON_HOME_UI
  },
  campaign: {
    actions: ["colonyEnd"],
    events: COLONY_EVENTS,
    objectives: ["actionPerformed"],
    uiTargets: [...NOT_ON_HOME_UI, "colonyTracker", "expeditionPlanner"]
  },
  colony: {
    actions: ["endMap"],
    events: ["victoryReached", ...TRADE_EVENTS],
    objectives: ["victory", "defeat"],
    uiTargets: NOT_ON_HOME_UI
  },
  home: {
    // A home map is peaceful: it never has computer faction AI (enemy economy AI plan §5.2).
    actions: ["endMap", "colonyEnd", "setFactionAi", "factionAiPause", "setFactionGoal"],
    events: [...COLONY_EVENTS, ...FACTION_EVENTS, "victoryReached", "playerDefeated"],
    objectives: ["defeat", "victory", "enemyBuildingDestroyed", "clockTime", "elapsedTime", "areaReached"],
    uiTargets: []
  }
});

export const isEventAllowed = (mapKind: MapKind, kind: ScriptEventKind) =>
  !SCRIPT_SCOPES[mapKind].events.includes(kind);
export const isActionAllowed = (mapKind: MapKind, kind: ScriptActionKind) =>
  !SCRIPT_SCOPES[mapKind].actions.includes(kind);
export const isObjectiveAllowed = (mapKind: MapKind, kind: BuiltInQuestObjectiveKind) =>
  !SCRIPT_SCOPES[mapKind].objectives.includes(kind);
export const isUiTargetAllowed = (mapKind: MapKind, kind: UiTargetKind) =>
  !SCRIPT_SCOPES[mapKind].uiTargets.includes(kind);
