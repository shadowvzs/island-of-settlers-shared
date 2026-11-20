import { BuildingType } from "../building-types.ts";

/**
 * Campaign authoring constants (campaign/campaign-implementation-plan-2026-11-09.md, lane C1). Pure and
 * worker-safe: the client, the editor and the API share these values; no other campaign file holds a magic number.
 */
export const CAMPAIGN_FALLBACK_LANGUAGE = "en";
/** Languages a Ready campaign is expected to fill; others may be added freely. */
export const CAMPAIGN_DEFAULT_LANGUAGES: readonly string[] = ["en", "hu"];

export const CAMPAIGN_PUBLICATION_STATES = ["draft", "ready"] as const;
export const CAMPAIGN_DIFFICULTIES = ["normal", "hard", "veryHard"] as const;
export const CAMPAIGN_SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export const CAMPAIGN_WEATHERS = ["clear", "rain", "snow"] as const;
/** The three trainable foot troops (cavalry is retired, HORSE-RETIREMENT-01). */
export const CAMPAIGN_SOLDIER_TYPES = ["shield", "heavy", "archer"] as const;
export const CAMPAIGN_UNIT_FILTERS = ["any", "soldier", "commander"] as const;
export const CAMPAIGN_QUEST_REPEAT_MODES = ["once", "afterFail", "always"] as const;
/** Story images are WebP only (owner 2026-11-09: compressed to at most 1024 px / ~300 KB on upload). */
export const CAMPAIGN_IMAGE_MIME_TYPE = "image/webp";
export const CAMPAIGN_IMAGE_MAX_EDGE = 1024;
export const CAMPAIGN_IMAGE_MAX_BYTES = 300 * 1024;

/** The campaign bundle shipped in every client build (CAMP-BUNDLE): its index format and bounds. */
export const CAMPAIGN_BUNDLE_VERSION = 1;
export const CAMPAIGN_BUNDLE_INDEX_FILE = "index.json";
export const CAMPAIGN_BUNDLE_MAX_CAMPAIGNS = 64;
export const CAMPAIGN_BUNDLE_MAX_IMAGES = 2048;
export const CAMPAIGN_BUNDLE_LICENCE_LENGTH = 200;

/** Owner edge case 7: a required map setting, default 100; waves above it spawn only up to the cap. */
export const DEFAULT_MAX_ENEMY_SOLDIERS = 100;
/**
 * Never blacklisted (R37): the landing harbour and the Storehouse carry landing and logistics. The HQ is moot,
 * because a campaign map has no player HQ (R4).
 */
export const CAMPAIGN_PROTECTED_BUILDING_TYPES: readonly number[] = [BuildingType.Harbour, BuildingType.Storehouse];
/**
 * The Commander's Lodge is controlled only by `CampaignMap.lodgeAllowed` (single source of truth, C7a): it never
 * appears in `disabledBuildings`; `campaignScenarioRules` bans it on the runtime map when the flag is off.
 */
export const CAMPAIGN_LODGE_BUILDING_TYPE: number = BuildingType.CommandersLodge;
/** Item 38 advisory: shipped troop points below this share of the enemy force points warn the author. */
export const CAMPAIGN_MIN_TROOP_POINT_SHARE = 0.5;

/** Region library (CIN0): stable ids `region-<n>`, never reused after a deletion. */
export const CAMPAIGN_REGION_ID_PREFIX = "region-";
/** Editor overlay colour of a region without its own (border + translucent fill; owner: blue). */
export const CAMPAIGN_REGION_DEFAULT_COLOR = "#2f7cf6";

/** The implicit exit of every map: a victory without a named exit (built-in rules, `endMap(victory)`). */
export const CAMPAIGN_DEFAULT_EXIT = "victory";
/** What a recorded or reported exit may look like (the server's `exit_id` column check): an id of 1–64 characters. */
export const CAMPAIGN_EXIT_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;
/** Named map exits (BR0): stable ids `exit-<n>` from `CampaignMap.nextExitNumber`, never reused. */
export const CAMPAIGN_EXIT_ID_PREFIX = "exit-";
/** Campaign graph edges (BR0): stable ids `edge-<n>` from `Campaign.nextEdgeNumber`, never reused. */
export const CAMPAIGN_EDGE_ID_PREFIX = "edge-";

/** Structural limits: they bound stored documents, not gameplay. */
export const CAMPAIGN_LIMITS = Object.freeze({
  cargoLines: 200,
  claimEffects: 20,
  decorationLines: 50,
  disabledBuildings: 100,
  /** Edges of one campaign graph per listed map (`maps × edgesPerMap` in total). */
  edgesPerMap: 4,
  /** Named exits of one map besides the implicit `victory`. */
  exitsPerMap: 8,
  identifierLength: 64,
  maps: 100,
  maxAmount: 1_000_000,
  maxBuildingLevel: 10,
  maxCount: 10_000,
  /** Soldier ranks 0..maxSoldierRank (three rank portraits per troop type). */
  maxSoldierRank: 2,
  maxDurationSeconds: 7 * 24 * 3600,
  musicLength: 128,
  nameLength: 120,
  prerequisites: 50,
  presetLevels: 512,
  quests: 200,
  regions: 200,
  statisticsQuestEntries: 500,
  textLength: 8000,
  translations: 32,
  unlockConditions: 20
});
