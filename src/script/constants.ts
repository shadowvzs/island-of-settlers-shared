import type { MapKind, ScriptRefKind } from "./types/refs.ts";
import type { CellContextKey, EventResponseKey, ScriptFunctionKind, ValueType } from "./types/values.ts";

/**
 * Map script constants (trigger design §4.13). Structural limits bound stored documents and per-tick work, not
 * gameplay. Tick and time conversions use `time/constants.ts`, never literals.
 */
export const SCRIPT_LIMITS = Object.freeze({
  actionsPerList: 200,
  /** Characters of an actor's display name per language (the speaker panel's name plate stays one line). */
  actorDisplayNameLength: 40,
  actorMembers: 24,
  actors: 500,
  arrayLength: 1024,
  cascadeDepth: 8,
  claimHistory: 8,
  eventsPerTrigger: 8,
  firesPerSecond: 20,
  folders: 500,
  forEachMax: 256,
  homeRewardOccurrences: 32,
  homeRewards: 64,
  identifierLength: 64,
  /** Islands one player may hold digests for (home, colonies, adventures, campaign maps). */
  islands: 64,
  maxCount: 1_000_000,
  /** Scenario player slots use factions 0..16 (0 = the human). */
  maxFaction: 16,
  maxPlayerLevel: 1000,
  maxWaitSeconds: 3600,
  multiboardColumns: 8,
  multiboardRows: 64,
  multiboards: 16,
  nameLength: 120,
  nestingDepth: 8,
  parallelRuns: 8,
  questGroups: 64,
  questStepsPerTick: 128,
  quests: 200,
  queuedRuns: 32,
  regions: 200,
  scriptBytes: 1024 * 1024,
  /** Deepest JSON nesting of a stored script (a safe-tree bound above the nesting limits). */
  scriptDepth: 96,
  /** Named slots of one event, action, predicate or function node; placeholder values of one text. */
  slotsPerNode: 32,
  spawnCountMax: 64,
  textLength: 8000,
  timers: 64,
  triggerStepsPerTick: 256,
  triggers: 1000,
  uiAckWaits: 4,
  variables: 500,
  /** Regions of animal-family enter/leave events pinned awake before the validator warns (§6.4). */
  wildlifePinnedRegions: 4
});

export const MAP_KINDS: readonly MapKind[] = Object.freeze(["home", "adventure", "colony", "campaign"]);

export const SCRIPT_REF_KINDS: readonly ScriptRefKind[] = Object.freeze([
  "actor", "content", "exit", "family", "folder", "multiboard", "quest", "region", "reward", "sequence", "shot",
  "speaker", "step", "timer", "trigger", "variable"
]);
/** Catalog references are global: never remapped on import and checked against the content catalog. */
export const GLOBAL_REF_KINDS: readonly ScriptRefKind[] = Object.freeze(["content", "family"]);

export const VALUE_TYPES: readonly ValueType[] = Object.freeze([
  "boolean", "number", "string", "number[]", "string[]", "actor", "actorGroup", "region", "multiboard", "timer",
  "player", "actorType", "ware", "quest", "text"
]);
/** Variable types an author may declare (expression-only types such as `player` are not stored). */
export const VARIABLE_TYPES: readonly ValueType[] = Object.freeze([
  "boolean", "number", "string", "number[]", "string[]", "text", "region", "actor", "actorGroup", "multiboard",
  "timer"
]);
export const ARRAY_ELEMENT_TYPES: Readonly<Partial<Record<ValueType, ValueType>>> = Object.freeze({
  "number[]": "number",
  "string[]": "string"
});

export const ACTOR_RESPONSE_KEYS = Object.freeze([
  "triggeringActor", "targetActor", "killingActor", "enteringActor", "carriedWare", "containerActor", "lastSpawned"
] as const);
/** The value type each event response key yields (`oldValue`/`newValue` follow the changed variable). */
export const RESPONSE_TYPES: Readonly<Record<EventResponseKey, ValueType | null>> = Object.freeze({
  amount: "number",
  building: "actor",
  carriedWare: "actor",
  containerActor: "actor",
  enteringActor: "actor",
  killingActor: "actor",
  lastSpawned: "actor",
  newValue: null,
  oldValue: null,
  outcome: "string",
  quest: "quest",
  region: "region",
  stage: "number",
  targetActor: "actor",
  timer: "timer",
  triggeringActor: "actor",
  triggeringPlayer: "player",
  variable: "string",
  ware: "ware"
});
/** Responses every action list may read: the outcome of the last waited action. */
export const ALWAYS_AVAILABLE_RESPONSES: readonly EventResponseKey[] = Object.freeze(["outcome", "lastSpawned"]);
/** Responses a quest action list may read. */
export const QUEST_LIST_RESPONSES: readonly EventResponseKey[] = Object.freeze(["quest"]);

export const CELL_CONTEXT_TYPES: Readonly<Record<CellContextKey, ValueType | null>> = Object.freeze({
  rowIndex: "number",
  rowItem: null,
  rowLabel: "text",
  rowPlayer: "player"
});

export const MATH_OPERATORS = Object.freeze(["+", "-", "*", "/", "min", "max", "mod"] as const);
export const ROUND_MODES = Object.freeze(["floor", "ceil", "round", "trunc"] as const);
export const COMPARE_OPERATORS = Object.freeze(["==", "!=", "<", "<=", ">", ">="] as const);
export const CELL_FORMATS = Object.freeze(["text", "number", "fraction", "percent", "countdown",
  "iconNumber"] as const);
export const ACTION_OUTCOMES = Object.freeze([
  "done", "actorGone", "targetGone", "unreachable", "interrupted", "timeout", "refused", "blocked", "full"
] as const);
export const QUEST_STATES = Object.freeze(["inactive", "active", "succeeded", "failed", "claimed", "retired"] as const);

/** Variable and loop names: searchable identifiers. */
export const SCRIPT_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
/**
 * Ids of the per-map counters (`trigger-<n>`, `var-<n>`, …), authored quest ids ("farm.wheat", "q-defend") and
 * catalog ids inside references ("animal:deer").
 */
export const SCRIPT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]*$/;
/** Fields of a `QuestText` that are not language codes. */
export const QUEST_TEXT_RESERVED_FIELDS: readonly string[] = Object.freeze(["translationKey", "values"]);
/** Language codes a QuestText may carry ("en", "hu", "pt-BR"). */
export const LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
/** Lingui message id of shipped texts (same convention as the content catalog). */
export const SCRIPT_TRANSLATION_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z0-9_-]+)+$/;
export const SCRIPT_FALLBACK_LANGUAGE = "en";

/**
 * English display names of the looks that are no nation (owner 2026-11-13): what players read for a pirate or
 * bandit actor the map maker has not named. A nation look has no default: its unit keeps its catalog name.
 */
export const ACTOR_LOOK_DEFAULT_NAMES = Object.freeze({ bandits: "Bandit", pirates: "Pirate" } as const);
/** Forms of a catalog name inside a text (`ContentNameForm`). */
export const CONTENT_NAME_FORMS = Object.freeze(["name", "plural", "counted"] as const);
/** The numeric text value that count-dependent catalog names of the same text follow. */
export const QUEST_TEXT_COUNT_VALUE = "count";
/** The amount a count-dependent name stands for when its text has no `count` value: the plain plural. */
export const DEFAULT_PLURAL_COUNT = 2;
/** Nations without their own troop names use this nation's roster. */
export const TROOP_NAME_FALLBACK_NATION = "roman";
export const SCRIPT_DEFAULT_LANGUAGES: readonly string[] = Object.freeze(["en", "hu"]);

/** QU `QuestActionKey`: tutorial/event counters an `actionPerformed` objective may count. */
export const QUEST_ACTION_KEYS: readonly string[] = Object.freeze([
  "plant", "recruit", "survey", "ship", "expedition", "trade-offer", "talent", "tools"
]);
export const QUEST_ACTION_PROMOTE_PATTERN = /^promote:[0-2]$/;
/** Counters catch-up maintains (QU §7.7) that `counterReached` may read; `produce:` and `plant:` take a key. */
export const CATCH_UP_COUNTERS: readonly string[] = Object.freeze(["ship", "tools"]);
export const CATCH_UP_COUNTER_PREFIXES = Object.freeze({ plant: "plant:", produce: "produce:" });

/** Id of the shipped default home quest book and the stable `scriptUid` of its script document. */
export const HOME_DEFAULT_BOOK_ID = "home-default";
export const HOME_DEFAULT_SCRIPT_UID = HOME_DEFAULT_BOOK_ID;
/** Island resources a quest may depend on (`QuestSkipRule`). */
export const QUEST_RESOURCES = Object.freeze(["coal", "fish", "gold", "iron", "ore", "rock", "wildlife"] as const);

/** Quest ids of the generated colony book with fixed rules (§8.1, §8.2). */
export const COLONY_CONQUER_QUEST_ID = "colony.conquer";
export const COLONY_DEFEATED_QUEST_ID = "colony.defeated";
export const COLONY_HOLD_QUEST_ID = "colony.hold";
export const COLONY_HARBOUR_LOST_QUEST_ID = "colony.harbourLost";
export const COLONY_CANCELLED_QUEST_ID = "colony.cancelled";
export const ADVENTURE_WIN_QUEST_ID = "adventure.win";
/** `colony.hold` deadline: the catalog constant `colonyLifetimeMs` = 14 days, locked in the editor in v1. */
export const COLONY_HOLD_DEADLINE = Object.freeze({ days: 14, hours: 0, minutes: 0 });

/** Functions whose results depend on the world environment (header flag `scriptReadsEnvironment`, §6.11). */
export const ENVIRONMENT_FUNCTIONS: readonly ScriptFunctionKind[] = Object.freeze(["hour"]);

/** Soldier ranks are 0-based (three rank portraits per troop type). */
export const SCRIPT_MAX_SOLDIER_RANK = 2;
/** Hours of a clock-hour objective or event. */
export const HOURS_PER_DAY = 24;
/** UTC minutes of a day (calendar repeats store `minuteUtc`). */
export const MINUTES_PER_DAY = 1440;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_MONTH_MAX = 31;
export const DAYS_PER_WEEK = 7;
/** Growth stages of a tree (`treeGrowthStage`). */
export const TREE_GROWTH_STAGE_MAX = 5;
/** Radius of "came near" auto-circles around static targets. */
export const CAME_NEAR_RADIUS_MAX = 8;

/** Closed string lists of catalogue `choice` slots. */
export const ACTOR_GONE_REASONS = Object.freeze(["died", "despawned", "leftMap", "consumed"] as const);
export const DESTRUCTION_CAUSES = Object.freeze(["demolished", "destroyed", "captured"] as const);
export const ACTOR_FADE_THEN = Object.freeze(["keep", "remove"] as const);
export const BUILD_MODES = Object.freeze(["instant", "construct"] as const);
export const COLONY_END_REASONS = Object.freeze(["expired", "lost", "cancelled"] as const);
export const ENEMY_WAVE_ARRIVALS = Object.freeze(["ship", "instant"] as const);
export const HIGHLIGHT_UNTIL = Object.freeze(["clicked", "seconds", "windowClosed"] as const);
export const KILL_ORDERS = Object.freeze(["nearestTo", "oldest", "newest"] as const);
export const MAP_OUTCOMES = Object.freeze(["victory", "defeat"] as const);
export const MOVE_STANCES = Object.freeze(["passive", "defend"] as const);
export const SPEAK_TIMINGS = Object.freeze(["auto", "click"] as const);
export const STORE_ACTOR_MODES = Object.freeze(["replace", "add", "remove"] as const);
export const WEATHER_STATES = Object.freeze(["clear", "rain", "snow"] as const);
/** The levels a computer faction's AI plays at (`setCommanderLevel`; the map's `factionAi` level names them too). */
export const AI_LEVELS = Object.freeze(["easy", "medium", "hard"] as const);
/** What a computer faction's AI does (`setFactionAi`; the map's `factionAi` mode names them too); `none`: no AI. */
export const AI_MODES = Object.freeze(["none", "maintain", "develop"] as const);
/** How a `develop` faction plays (`setFactionAi`; the map's `factionAi` style names them too). */
export const AI_STYLES = Object.freeze(["balanced", "turtle", "aggressive"] as const);
/**
 * The strategic posture a map script gives a computer faction for a time (`setFactionGoal`); `factionPosture` reads
 * it back, or the faction's own posture (the catalog's `AI_POSTURES`: grow, fortify) while no goal runs.
 */
export const AI_GOALS = Object.freeze(["attack", "defend", "expand", "hold"] as const);
export const SEASONS = Object.freeze(["spring", "summer", "autumn", "winter"] as const);
/** The literal a `regionOrEdge` slot accepts besides a region (sail to the map edge). */
export const MAP_EDGE = "mapEdge";
/** Run-time states an actor query may filter by. */
export const ACTOR_STATE_FILTERS = Object.freeze([
  "idle", "moving", "docked", "sailing", "inside", "aboard", "working"
] as const);
/** Query picks that yield one actor (the others yield a group). */
export const SINGLE_ACTOR_PICKS: readonly string[] = Object.freeze(["first", "nearest", "random"]);

/** What a ship's deck capacity counts: units (soldiers, settlers, commander) or ware boxes. */
export const SHIP_LOADS = Object.freeze(["passengers", "boxes"] as const);
/** Content kinds that ride a ship as passengers. */
export const PASSENGER_KINDS = Object.freeze(["soldier", "settler", "commander"] as const);
/** What a trade ship brings (EXT-EVENTS): bought wares, a sale's payment or a refund. */
export const TRADE_DELIVERY_KINDS = Object.freeze(["purchase", "sale", "refund"] as const);

/** "Wait until done" outcome sets of the action catalogue. */
export const WAIT_DONE = Object.freeze(["done"] as const);
export const WAIT_PRESENCE = Object.freeze(["done", "actorGone"] as const);
export const WAIT_MOVE = Object.freeze(["done", "actorGone", "unreachable", "interrupted", "timeout"] as const);
export const WAIT_CONTAINER = Object.freeze(["done", "targetGone", "full", "unreachable", "timeout"] as const);
/** Later lanes of action groups (design §17.3): validated now, a warning says they do not run yet. */
export const LATER_ACTION_LANES = Object.freeze({
  carry: { pending: "TRG5d", since: 2 },
  combat: { pending: "TRG5c", since: 2 },
  containers: { pending: "TRG5b", since: 2 }
} as const);
