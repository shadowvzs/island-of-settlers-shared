import { MAX_PLAYER_LEVEL } from "../catalog/balance/levels.ts";
import {
  type AFTER_MAP_LANDINGS, type CONNECTIVITIES, DEFAULT_AUTOSAVE_MINUTES, type GAME_FEATURE_KEYS, GAME_SETTINGS_VERSION,
  type GAME_SETTINGS_PRESET_IDS, ONLINE_FEATURE_KEYS, type OPTIONAL_GAME_FEATURE_KEYS,
  type PUBLISHED_STARTER_HOME_MAP, type RULE_ISLAND_ROLES,
  type SIM_FEATURE_KEYS, type START_PLACES
} from "./constants.ts";

/**
 * The game settings: one document per deployment, edited on the admin page (plan §5.1). They decide the play mode,
 * the multiplayer features, progression, where the player starts and where a finished map lands. The simulation
 * never reads this document: it reads the pinned `SimRules` subset (sim-rules.ts) through `effectiveRules`.
 */
export type Connectivity = typeof CONNECTIVITIES[number];
export type StartPlace = typeof START_PLACES[number];
export type AfterMapLanding = typeof AFTER_MAP_LANDINGS[number];
export type OnlineFeatureKey = typeof ONLINE_FEATURE_KEYS[number];
export type GameFeatureKey = typeof GAME_FEATURE_KEYS[number];
export type OptionalGameFeatureKey = typeof OPTIONAL_GAME_FEATURE_KEYS[number];
export type SimFeatureKey = typeof SIM_FEATURE_KEYS[number];
export type GameSettingsPresetId = typeof GAME_SETTINGS_PRESET_IDS[number];
/** Structurally equal to the client's `IslandRole` (`shared/settlement/island-role.ts`). */
export type RuleIslandRole = typeof RULE_ISLAND_ROLES[number];

/** `earned`: the account level; `fixed`: everyone counts as `level`. */
export type LevelRule = { kind: "earned" } | { kind: "fixed"; level: number };
export type HomeMapSource = typeof PUBLISHED_STARTER_HOME_MAP | { mapId: string };

export type OnlineFeatures = Record<OnlineFeatureKey, boolean>;
/** Version-1 switches are required; later ones are optional and absent means on (today's game). */
export type GameFeatures = Record<GameFeatureKey, boolean> & Partial<Record<OptionalGameFeatureKey, boolean>>;

export interface GameProgression {
  /** XP is earned. */
  experience: boolean;
  levels: LevelRule;
  /** Quest/claim/campaign rewards. Absent: on with a home island, off without one (Q8, Q-G2). */
  rewards?: boolean;
  /** Talent ranks apply. */
  talents: boolean;
}

/**
 * The save switches (plan §5.5, rev I22). Absent = today: automatic saving every 2 minutes, no Save/Load slots.
 * Not simulated: never part of `SimRules`, so changing them pins nothing and changes no hash (rev I11).
 */
export interface GameSaving {
  /** Interval and key-event saves; off = only the technical triggers (tab hide, page hide, travel). */
  autosave: boolean;
  /** The interval in minutes (`AUTOSAVE_MINUTES_RANGE`); absent = `DEFAULT_AUTOSAVE_MINUTES`. */
  autosaveMinutes?: number;
  /** Save/Load slots on the title page and in game. */
  slots: boolean;
}

/**
 * Title page files chosen by the admin (owner 2026-11-12): file names only, always inside the build's `title/`
 * folder. Absent: the conventional names (`title-background.*`, `title-music.*`).
 */
export interface TitleScreenFiles {
  background?: string;
  music?: string;
}

export interface GameStart {
  /** place "campaignSelect": campaigns offered (absent = every Ready, offered campaign). */
  campaignIds?: string[];
  /** place "home": the starter map (online: the published starter pointer). */
  homeMap?: HomeMapSource;
  place: StartPlace;
}

export interface GameSettings {
  /** Where a finished (won) campaign map lands. "home" requires start.place "home". */
  afterMap: AfterMapLanding;
  /**
   * Game semantics, not server presence (rev I1). "online": offline catch-up runs (always, on the online home: Q6,
   * rev G11) and the server's features apply when a server answers; it also runs from the browser alone (today's
   * guest path). "offline": every `online` feature is off, catch-up skips, no sign-in, lease or verified save.
   * A standalone build plays whatever its bundled settings say (none = online, today's game).
   */
  connectivity: Connectivity;
  /** Single-player features (trade = the NPC trade office, rev G9); a map may narrow them. */
  features: GameFeatures;
  /**
   * Fog of war (owner 2026-11-12). Absent = on (today's game). Off: the island starts revealed and exploration
   * expeditions are unavailable whatever their switch (nothing to reveal).
   */
  fogOfWar?: boolean;
  /**
   * Show the game menu (title page) before play (owner 2026-11-13). Absent = on. Off: an online game with a home
   * island boots straight into the island; without a home or offline the menu always shows (D9, D10). Not simulated.
   */
  menuBeforePlay?: boolean;
  /** Features that need other players or the server; ignored (off) while offline. No catch-up toggle (rev G11). */
  online: OnlineFeatures;
  /**
   * Player troops act only on enemies the player knows (seen or under a hit alert; owner 2026-11-13). Absent = on
   * (A13 phase 3). Off: player soldiers acquire and keep targets as before phase 3. Computer troops always act on
   * knowledge only (D-AI1) and civilians flee only from seen raiders either way. Simulated (`SimRules`).
   */
  playerTroopsSightOnly?: boolean;
  progression: GameProgression;
  /** Save switches; absent = today (automatic saving every 2 minutes, no slots). */
  saving?: GameSaving;
  start: GameStart;
  /** Title page background and music file names; absent = the conventional names. Not simulated. */
  titleScreen?: TitleScreenFiles;
  version: typeof GAME_SETTINGS_VERSION;
}

/** A stored settings document with the revision id the server (or the local store) issued for it. */
export interface GameSettingsRevision {
  revision: string;
  settings: GameSettings;
}

const freezeSettings = (settings: GameSettings): GameSettings => {
  Object.freeze(settings.features);
  Object.freeze(settings.online);
  Object.freeze(settings.progression.levels);
  Object.freeze(settings.progression);
  if (settings.saving) Object.freeze(settings.saving);
  Object.freeze(settings.start);
  if (settings.titleScreen) Object.freeze(settings.titleScreen);
  return Object.freeze(settings);
};

const ALL_ONLINE_FEATURES: OnlineFeatures = { chat: true, friends: true, guilds: true, market: true, shop: true };
const ALL_GAME_FEATURES: GameFeatures = { adventures: true, colonies: true, settlementExpeditions: true, trade: true };

/** Exactly today's game: online, every feature on, earned levels, home start, sail home after a map. */
export const DEFAULT_ONLINE_SETTINGS: GameSettings = freezeSettings({
  afterMap: "home",
  connectivity: "online",
  features: { ...ALL_GAME_FEATURES },
  online: { ...ALL_ONLINE_FEATURES },
  progression: { experience: true, levels: { kind: "earned" }, talents: true },
  start: { homeMap: "publishedStarter", place: "home" },
  version: GAME_SETTINGS_VERSION
});

/** Offline settlement: as online, but no server features, catch-up skips; automatic saving plus slots. */
const OFFLINE_SETTLEMENT_SETTINGS: GameSettings = freezeSettings({
  afterMap: "home",
  connectivity: "offline",
  features: { ...ALL_GAME_FEATURES },
  online: { ...ALL_ONLINE_FEATURES },
  progression: { experience: true, levels: { kind: "earned" }, talents: true },
  saving: { autosave: true, autosaveMinutes: DEFAULT_AUTOSAVE_MINUTES, slots: true },
  start: { homeMap: "publishedStarter", place: "home" },
  version: GAME_SETTINGS_VERSION
});

/** Story: no home, campaigns only, everyone at the maximum level, nothing earned or paid; manual slots only. */
const STORY_SETTINGS: GameSettings = freezeSettings({
  afterMap: "exitChoice",
  connectivity: "offline",
  features: { ...ALL_GAME_FEATURES },
  online: { ...ALL_ONLINE_FEATURES },
  progression: {
    experience: false, levels: { kind: "fixed", level: MAX_PLAYER_LEVEL }, rewards: false, talents: false
  },
  saving: { autosave: false, slots: true },
  start: { place: "campaignSelect" },
  version: GAME_SETTINGS_VERSION
});

export const GAME_SETTINGS_PRESETS: Readonly<Record<GameSettingsPresetId, GameSettings>> = Object.freeze({
  offlineSettlement: OFFLINE_SETTLEMENT_SETTINGS,
  onlineSettlement: DEFAULT_ONLINE_SETTINGS,
  story: STORY_SETTINGS
});

/** An editable deep copy (presets and defaults are frozen). */
export const cloneGameSettings = (settings: GameSettings): GameSettings => ({
  ...settings,
  features: { ...settings.features },
  online: { ...settings.online },
  progression: { ...settings.progression, levels: { ...settings.progression.levels } },
  ...(settings.saving && { saving: { ...settings.saving } }),
  start: {
    ...settings.start,
    ...(settings.start.campaignIds && { campaignIds: [...settings.start.campaignIds] }),
    ...(typeof settings.start.homeMap === "object" && { homeMap: { ...settings.start.homeMap } })
  },
  ...(settings.titleScreen && { titleScreen: { ...settings.titleScreen } })
});

/** Fog of war: the explicit switch, else on (today's game). */
export const fogOfWarEnabled = (settings: GameSettings) => settings.fogOfWar ?? true;

/** The player troop sight rule: the explicit switch, else on (A13 phase 3). */
export const playerTroopsSightOnlyEnabled = (settings: GameSettings) => settings.playerTroopsSightOnly ?? true;

/** The stored "game menu before play" switch: absent means on (stored settings older than the switch). */
export const menuBeforePlayStored = (settings: GameSettings) => settings.menuBeforePlay ?? true;

/** An optional feature switch: absent means on (today's game). */
export const optionalFeatureEnabled = (settings: GameSettings, key: OptionalGameFeatureKey) =>
  settings.features[key] ?? true;

/** True when the deployment has a home island (the mother base); false = play without a home. */
export const hasHomeIsland = (settings: GameSettings) => settings.start.place === "home";

/** Rewards: the explicit switch, else on with a home island and off without one (Q8; Q-G2 keeps it switchable). */
export const rewardsEnabled = (settings: GameSettings) => settings.progression.rewards ?? hasHomeIsland(settings);

/**
 * The online features actually available: every one is off while offline (the master switch, D6), and the player
 * market is off without a home island (D7: market goods move to and from the home island). The shop stays on
 * without a home and sells account-wallet items only.
 */
export const effectiveOnlineFeatures = (settings: GameSettings): OnlineFeatures => {
  const online = settings.connectivity === "online";
  const features = {} as OnlineFeatures;
  for (const key of ONLINE_FEATURE_KEYS) features[key] = online && settings.online[key];
  features.market &&= hasHomeIsland(settings);
  return features;
};
