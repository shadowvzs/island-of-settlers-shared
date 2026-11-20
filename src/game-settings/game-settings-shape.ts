import {
  arrayOf, boolean, type Check, type CheckFields, checkValue, conforms, discriminatedUnion, enumOf, integer, literal,
  objectOf, optional, string, union, type ValidationIssue
} from "../validation/index.ts";
import {
  AFTER_MAP_LANDINGS, CONNECTIVITIES, GAME_FEATURE_KEYS, GAME_SETTINGS_LIMITS, GAME_SETTINGS_VERSION,
  ONLINE_FEATURE_KEYS, OPTIONAL_GAME_FEATURE_KEYS, PUBLISHED_STARTER_HOME_MAP, SIM_FEATURE_KEYS, START_PLACES,
  TITLE_BACKGROUND_FILE, TITLE_MUSIC_FILE
} from "./constants.ts";
import type { GameSettings } from "./game-settings.ts";
import type { MapRules } from "./map-rules.ts";
import type { SimRules } from "./sim-rules.ts";

/**
 * Structural checks for stored game settings, pinned sim rules and map rules (API bodies, local files, saves, map
 * headers), built on the shared validation kit: objects are strict and every failing path is one issue. Value
 * rules (level range, landing against start place, map kind) live in game-settings-issues.ts.
 */
const IDENTIFIER = /^[A-Za-z0-9_.:-]+$/;
const identifier = string({ maxLength: GAME_SETTINGS_LIMITS.identifierLength, minLength: 1, pattern: IDENTIFIER });
const revision = string({ maxLength: GAME_SETTINGS_LIMITS.revisionLength, minLength: 1, pattern: IDENTIFIER });

const titleFile = (pattern: RegExp) =>
  string({ maxLength: GAME_SETTINGS_LIMITS.titleFileLength, minLength: 1, pattern });
const titleScreen = objectOf({
  background: optional(titleFile(TITLE_BACKGROUND_FILE)), music: optional(titleFile(TITLE_MUSIC_FILE))
});

const fieldsOf = (keys: readonly string[], check: Check): CheckFields =>
  Object.fromEntries(keys.map(key => [key, check]));

const fixedLevelFields: CheckFields = { level: integer() };
const levelRule = discriminatedUnion("kind", { earned: {}, fixed: fixedLevelFields });
const settingsFeatureSwitches: CheckFields = {
  ...fieldsOf(GAME_FEATURE_KEYS, boolean), ...fieldsOf(OPTIONAL_GAME_FEATURE_KEYS, optional(boolean))
};

const gameSettingsCheck = objectOf({
  afterMap: enumOf(AFTER_MAP_LANDINGS),
  connectivity: enumOf(CONNECTIVITIES),
  features: objectOf(settingsFeatureSwitches),
  fogOfWar: optional(boolean),
  menuBeforePlay: optional(boolean),
  online: objectOf(fieldsOf(ONLINE_FEATURE_KEYS, boolean)),
  playerTroopsSightOnly: optional(boolean),
  progression: objectOf({ experience: boolean, levels: levelRule, rewards: optional(boolean), talents: boolean }),
  saving: optional(objectOf({ autosave: boolean, autosaveMinutes: optional(integer()), slots: boolean })),
  start: objectOf({
    campaignIds: optional(arrayOf(identifier, GAME_SETTINGS_LIMITS.campaignIds)),
    homeMap: optional(union(literal(PUBLISHED_STARTER_HOME_MAP), objectOf({ mapId: identifier }))),
    place: enumOf(START_PLACES)
  }),
  titleScreen: optional(titleScreen),
  version: literal(GAME_SETTINGS_VERSION)
});

const simRulesCheck = objectOf({
  ...fieldsOf(SIM_FEATURE_KEYS, boolean),
  catchUp: enumOf(["run", "skip"]),
  experience: boolean,
  fogOfWar: boolean,
  homeIsland: boolean,
  level: levelRule,
  playerTroopsSightOnly: optional(boolean),
  revision,
  rewards: boolean,
  talents: boolean
});

const mapRulesCheck = objectOf({
  experience: optional(literal("none")),
  features: optional(objectOf(fieldsOf(SIM_FEATURE_KEYS, optional(literal("off"))))),
  level: optional(discriminatedUnion("kind", { fixed: fixedLevelFields })),
  offlineCatchUp: optional(literal("skip")),
  talents: optional(literal("none"))
});

export type ShapeIssue = ValidationIssue;

export const gameSettingsShapeIssues = (value: unknown): ShapeIssue[] => checkValue(gameSettingsCheck, value);
export const simRulesShapeIssues = (value: unknown): ShapeIssue[] => checkValue(simRulesCheck, value);
export const mapRulesShapeIssues = (value: unknown): ShapeIssue[] => checkValue(mapRulesCheck, value);

export const isGameSettings = (value: unknown): value is GameSettings => conforms(gameSettingsCheck, value);
export const isSimRules = (value: unknown): value is SimRules => conforms(simRulesCheck, value);
export const isMapRules = (value: unknown): value is MapRules => conforms(mapRulesCheck, value);
