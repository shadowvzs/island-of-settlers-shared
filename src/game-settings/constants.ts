/**
 * Game-settings constants (docs/plans/game-modes-map-rules-plan-2026-11-12.md §5, lane GS0). Pure and
 * worker-safe: the client, the admin page and the API share these values.
 */
export const GAME_SETTINGS_VERSION = 1;

export const CONNECTIVITIES = ["online", "offline"] as const;
export const START_PLACES = ["home", "campaignSelect"] as const;
export const AFTER_MAP_LANDINGS = ["home", "campaignSelect", "exitChoice"] as const;
/** The literal `start.homeMap` value that follows the server's published starter pointer. */
export const PUBLISHED_STARTER_HOME_MAP = "publishedStarter";

/** Features that need other players or the server: off while offline, never simulated (rev G9). */
export const ONLINE_FEATURE_KEYS = ["market", "chat", "friends", "guilds", "shop"] as const;
/** Single-player features: simulated, part of `SimRules`, and a map may switch them off. */
export const GAME_FEATURE_KEYS = ["trade", "colonies", "adventures", "settlementExpeditions"] as const;
/**
 * Single-player features added after settings version 1 (owner 2026-11-12, Q7): optional in a stored settings
 * document (absent = on, today's game), always present in `SimRules`, and a map may switch them off.
 */
export const OPTIONAL_GAME_FEATURE_KEYS = ["explorationExpeditions"] as const;
/** Every simulated feature switch: the keys of `SimRules` and of `MapRules.features`. */
export const SIM_FEATURE_KEYS = [...GAME_FEATURE_KEYS, ...OPTIONAL_GAME_FEATURE_KEYS] as const;

/** What an island is to the player; equal to the client's `IslandRole` and to `MapScenario.kind`. */
export const RULE_ISLAND_ROLES = ["home", "colony", "adventure", "campaign"] as const;
/** Roles whose map file may fix a level: campaign may widen, adventure may only lower (rev G10). */
export const FIXED_LEVEL_MAP_ROLES: readonly string[] = ["campaign", "adventure"];

export const MIN_PLAYER_LEVEL = 1;

/** The revision of saves that pinned no rules: today's behaviour (plan §6, §12.1). */
export const LEGACY_RULES_REVISION = "legacy";
/** Offline revisions are `local:<sha256 of the canonical settings>`; the server never accepts them (§12.2). */
export const LOCAL_RULES_REVISION_PREFIX = "local:";

export const GAME_SETTINGS_LIMITS = Object.freeze({
  campaignIds: 200,
  identifierLength: 64,
  revisionLength: 80,
  /** A title screen file name (plan, owner request "title page background + music by convention"). */
  titleFileLength: 80
});

/**
 * Title page files (owner 2026-11-12): plain file names inside the conventional `title/` folder of the build, no
 * path separators. Video wins over an image; missing files are skipped silently by the client.
 */
export const TITLE_BACKGROUND_FILE = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(webm|mp4|webp|jpg|jpeg|png)$/;
export const TITLE_MUSIC_FILE = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(ogg|mp3)$/;

/** Automatic saving interval: today's 2 minutes when absent; the admin may choose 1–60 (plan §5.5). */
export const DEFAULT_AUTOSAVE_MINUTES = 2;
export const AUTOSAVE_MINUTES_RANGE = Object.freeze([1, 60] as const);
/** Save/Load slots per mode (plan §5.6). */
export const SAVE_SLOT_LIMIT = 10;

/**
 * The dependency rules of the flat switches (plan §5.5, owner answers to §19 of revision 3: D1b; D9 and D10: the
 * game menu before play, owner 2026-11-13).
 */
export const SETTING_DEPENDENCY_IDS = ["D1", "D1b", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10"] as const;

/** The admin page's presets (plan §5.1). */
export const GAME_SETTINGS_PRESET_IDS = ["onlineSettlement", "offlineSettlement", "story"] as const;
