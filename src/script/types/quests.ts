import type {
  CampaignDecorationAmount, CampaignRewardSoldier, CampaignWareAmount
} from "../../campaign/campaign-model.ts";
import type { QuestText } from "./quest-text.ts";
import type { ScriptRef } from "./refs.ts";
import type { Condition, ScriptAction } from "./triggers.ts";
import type { Expr } from "./values.ts";

/**
 * The unified quest model (QU0 absorbed, trigger design §4.10). C1 objective kinds stay as sugar; every id inside is
 * a tagged `ScriptRef` and every type a catalog id (rev M4, B3).
 */

export type QuestUnitFilter = "any" | "soldier" | "commander";
export type ActorQuantifier = "any" | "all";

/** The generated colony/adventure rule of a combat objective (§8.1): absent fields keep the C1 meaning. */
export interface ScenarioObjectiveRule {
  /** The rule must hold for every enemy (site or soldier), not for a count of them. */
  all?: boolean;
  /** Game seconds the rule must hold without a break before it counts (authored `claimSeconds`). */
  holdSeconds?: number;
}

/** C1 + QU built-in objective kinds (QU §3.2) and the ACT0 actor kinds (actors plan §2.3). */
export type BuiltInQuestObjective =
  | { kind: "mapStart" }
  | { kind: "areaReached"; region: ScriptRef<"region">; unitFilter: QuestUnitFilter }
  | { building: ScriptRef<"content">; count: number; kind: "buildingCompleted" }
  /** `soldierType: null` counts every troop type. */
  | { count: number; kind: "soldierCount"; soldierType: ScriptRef<"content"> | null; stationed?: boolean }
  | { kind: "defeat" }
  | { kind: "victory" }
  | { hour: number; kind: "clockTime" }
  /**
   * `buildingId: null` is any enemy building; otherwise one authored scenario building id. `all` (with
   * `buildingId: null`): every authored enemy site is captured, the `capture` scenario rule (§8.1).
   */
  | ({ buildingId: number | null; kind: "enemyBuildingDestroyed" } & ScenarioObjectiveRule)
  /** `all`: no enemy soldier is left (`count` is ignored), the `defeat` scenario rule (§8.1). */
  | ({ count: number; kind: "enemiesDefeated" } & ScenarioObjectiveRule)
  | { amount: number; building?: ScriptRef<"content">; kind: "stockLevel"; ware: ScriptRef<"content"> }
  | { kind: "elapsedTime"; seconds: number }
  | { kind: "prerequisitesDone" }
  | { amount: number; kind: "wareProduced"; since: "activation"; ware: ScriptRef<"content"> }
  /** `action` is a QuestActionKey (`plant`, `recruit`, …, `promote:<rank>`). */
  | { action: string; count: number; kind: "actionPerformed"; since: "activation" | "ever" }
  | { actor: ScriptRef<"actor">; kind: "actorReachedRegion"; quantifier: ActorQuantifier; region: ScriptRef<"region"> }
  | { actor: ScriptRef<"actor">; kind: "actorLeftRegion"; quantifier: ActorQuantifier; region: ScriptRef<"region"> }
  | { actor: ScriptRef<"actor">; kind: "actorDied"; quantifier: ActorQuantifier }
  | { actor: ScriptRef<"actor">; kind: "actorGone"; quantifier: ActorQuantifier }
  | { actor: ScriptRef<"actor">; kind: "actorAppeared" };

export type BuiltInQuestObjectiveKind = BuiltInQuestObjective["kind"];

export type QuestObjective =
  | BuiltInQuestObjective
  | { condition: Condition; kind: "condition"; progress: { current: Expr; target: Expr } | null }
  /** Reads a counter catch-up already maintains (rev B2: `ship`, `tools`, `produce:<ware>`, `plant:<family>`). */
  | { counter: string; kind: "counterReached"; since: "activation" | "mapStart"; target: number }
  /** Completed or failed only by actions. */
  | { kind: "scripted" };

export type QuestObjectiveKind = QuestObjective["kind"];

export type QuestDeadline =
  /** Script seconds since activation (C1 timeLimitSeconds): frozen offline. */
  | { kind: "playTime"; seconds: number }
  /** Game seconds since activation, counting offline catch-up too (authored `expirySeconds`, rev M10). */
  | { kind: "gameTime"; seconds: number }
  /** Absolute `gameNow` UTC ms. */
  | { at: Expr; kind: "date" }
  | { days: number; hours: number; kind: "dateAfterActivation"; minutes: number };

/** All windowed repeats sit on a fixed UTC grid (§7.2); calendar fields are UTC (owner round 5). */
export type QuestRepeat =
  | { kind: "once"; retryAfterFail: boolean }
  | { kind: "onCompletion"; maxClaims: number | null; retryAfterFail: boolean }
  | { days: number; hours: number; kind: "interval"; minutes: number; retryAfterFail: boolean }
  | { day?: number; kind: "calendar"; minuteUtc: number; month?: number; retryAfterFail: boolean; weekday?: number };

export type QuestUnlock = { kind: "playerLevel"; level: number };

/** A natural resource of the island that a quest depends on (rock, fish, wildlife or an ore deposit). */
export type QuestResource = "coal" | "fish" | "gold" | "iron" | "ore" | "rock" | "wildlife";

/**
 * When a required quest may be skipped for no reward, so nobody gets stuck (QU §3.1 `skippableWhen`): the island
 * has none of the resource. Optional quests can always be skipped.
 */
export type QuestSkipRule = { kind: "missingResource"; resource: QuestResource };

/** C1 rewards plus building unlocks (home only), settlers and soldiers (map reward only) (QU §3.1). */
export interface QuestRewards {
  buildingUnlocks: number[];
  coins: number;
  decorations: CampaignDecorationAmount[];
  gems: number;
  goods: CampaignWareAmount[];
  settlers?: number;
  soldiers?: CampaignRewardSoldier[];
  xp: number;
}

export interface QuestGroup {
  /** sequential: one active quest at a time, in list order (tutorial); parallel: prerequisites decide. */
  activation: "parallel" | "sequential";
  /** Home books only: claiming the group's last open quest tops XP up to the start of unlock.level + 1. */
  completionTopUp: "nextLevel" | null;
  id: string;
  /** Groups that must be finished first. */
  requiresGroups: string[];
  title: QuestText;
  unlock: QuestUnlock | null;
}

/**
 * A quest of the map script. Display and reward fields that the examples omit are optional (absent = none); a
 * visible quest needs a title (Ready check).
 */
export interface ScriptQuest {
  /**
   * `auto` (default): active once its group, unlock and prerequisites allow (QU §7.3); `action`: only the
   * `activateQuest` action activates it (trigger-driven quests).
   */
  activation?: "action" | "auto";
  completeSequence?: ScriptRef<"sequence">;
  /** Goods taken from the island stock at claim; every map kind (owner 41). */
  cost: CampaignWareAmount[];
  deadline: QuestDeadline | null;
  details?: { benefit: QuestText | null; tips: QuestText | null };
  /** Optional automatic failure, checked after the objective each evaluation. */
  failure: Condition | null;
  groupId?: string | null;
  highlightRegion?: boolean;
  homeReward?: QuestRewards | null;
  id: string;
  imageId?: string | null;
  mapReward?: QuestRewards | null;
  objective: QuestObjective;
  onActivate: ScriptAction[];
  /** Always run automatically at failure (owner round 2, item 6). */
  onFailure: ScriptAction[];
  /** Run at claim (visible) or automatically at success (hidden); replaces C1 claimEffects. */
  onSuccess: ScriptAction[];
  optional?: boolean;
  prerequisites?: ScriptRef<"quest">[];
  repeat: QuestRepeat;
  skippableWhen?: QuestSkipRule | null;
  startSequence?: ScriptRef<"sequence">;
  text?: QuestText;
  title?: QuestText;
  unlock?: QuestUnlock | null;
  visibility: "visible" | "hidden";
}

/** The quest book inside the map script (QU §3.1). */
export interface QuestBook {
  /** Generated global daily pool on this map, or none. */
  daily: "global" | "off";
  /** Minutes after 00:00 UTC at which daily quests reset. */
  dailyResetUtcMinutes: number;
  groups: QuestGroup[];
  /** Stable identity across revisions (e.g. "home-default"); quest ids within it are a save contract. */
  id: string;
  quests: ScriptQuest[];
  revision: number;
  version: 1;
}
