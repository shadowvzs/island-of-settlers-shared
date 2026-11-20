import { MAX_PLAYER_LEVEL } from "../catalog/balance/levels.ts";
import { fieldPath, indexPath } from "../validation/index.ts";
import { AUTOSAVE_MINUTES_RANGE, FIXED_LEVEL_MAP_ROLES, MIN_PLAYER_LEVEL } from "./constants.ts";
import {
  fogOfWarEnabled, type GameSettings, hasHomeIsland, type LevelRule, optionalFeatureEnabled, type RuleIslandRole
} from "./game-settings.ts";
import {
  gameSettingsShapeIssues, isGameSettings, isMapRules, isSimRules, mapRulesShapeIssues, type ShapeIssue,
  simRulesShapeIssues
} from "./game-settings-shape.ts";
import type { MapRules } from "./map-rules.ts";

/**
 * Validation issues of game settings, pinned sim rules and map rules (plan §5.1, §5.3). `code` is the stable
 * message key, `path` points at the field and `params` fill the English template; errors block a save, warnings
 * never do. Issues come in a fixed order: shape first, then the value rules in the order written here.
 */
export const GAME_SETTINGS_ISSUE_MESSAGES = {
  afterMapHomeWithoutHome: { en: "A finished map cannot land at home: the game starts at the campaign selection." },
  autosaveMinutesOutOfRange: { en: "{path}: automatic saving every {minutes} minutes is outside {min}–{max}." },
  campaignNotOffered: { en: "{path}: campaign {campaignId} is not an offered campaign." },
  explorationWithoutFog: { en: "Exploring expeditions have no effect while fog of war is off." },
  fixedLevelOutOfRange: { en: "{path}: level {level} is outside {minLevel}–{maxLevel}." },
  invalidField: { en: "{path}: invalid value." },
  mapCatchUpSkipOnHome: { en: "Home maps always catch up; only other maps may skip offline catch-up." },
  mapFixedLevelRole: { en: "A fixed level is allowed on campaign and adventure maps only." },
  xpOffLevelsEarned: { en: "Experience is off while levels are earned: every player keeps the current level." }
} as const;

export type GameSettingsIssueCode = keyof typeof GAME_SETTINGS_ISSUE_MESSAGES;
export type GameSettingsIssueSeverity = "error" | "warning";

export interface GameSettingsIssue {
  code: GameSettingsIssueCode;
  params: Readonly<Record<string, string | number>>;
  path: string;
  severity: GameSettingsIssueSeverity;
}

/** What the validator may know about the deployment; absent knowledge skips the check that needs it. */
export interface GameSettingsValidationContext {
  /** Ids of the Ready, offered campaigns (the server filters unknown ids anyway). */
  offeredCampaignIds?: ReadonlySet<string>;
}

const issue = (
  severity: GameSettingsIssueSeverity, code: GameSettingsIssueCode, path: string,
  params: Readonly<Record<string, string | number>> = {}
): GameSettingsIssue => ({ code, params, path, severity });

const shapeErrors = (issues: readonly ShapeIssue[]) =>
  issues.map(shapeIssue => issue("error", "invalidField", shapeIssue.path));

const isPlayerLevel = (level: number) => level >= MIN_PLAYER_LEVEL && level <= MAX_PLAYER_LEVEL;

const fixedLevelIssues = (rule: LevelRule | undefined, path: string): GameSettingsIssue[] => {
  if (rule?.kind !== "fixed" || isPlayerLevel(rule.level)) return [];
  const params = { level: rule.level, maxLevel: MAX_PLAYER_LEVEL, minLevel: MIN_PLAYER_LEVEL };
  return [issue("error", "fixedLevelOutOfRange", fieldPath(path, "level"), params)];
};

const landingIssues = (settings: GameSettings): GameSettingsIssue[] => {
  if (settings.afterMap !== "home" || hasHomeIsland(settings)) return [];
  return [issue("error", "afterMapHomeWithoutHome", "afterMap")];
};

const savingIssues = ({ saving }: GameSettings): GameSettingsIssue[] => {
  const minutes = saving?.autosaveMinutes;
  const [min, max] = AUTOSAVE_MINUTES_RANGE;
  if (minutes === undefined || (minutes >= min && minutes <= max)) return [];
  return [issue("error", "autosaveMinutesOutOfRange", "saving.autosaveMinutes", { max, min, minutes })];
};

const campaignIssues = (settings: GameSettings, offered: ReadonlySet<string> | undefined): GameSettingsIssue[] => {
  if (!offered) return [];
  const issues: GameSettingsIssue[] = [];
  (settings.start.campaignIds ?? []).forEach((campaignId, index) => {
    if (offered.has(campaignId)) return;
    issues.push(issue("warning", "campaignNotOffered", indexPath("start.campaignIds", index), { campaignId }));
  });
  return issues;
};

const experienceIssues = ({ progression }: GameSettings): GameSettingsIssue[] => {
  if (progression.experience || progression.levels.kind !== "earned") return [];
  return [issue("warning", "xpOffLevelsEarned", "progression.experience")];
};

/** Exploring is on while fog of war is off: the switch has no effect (D4, rev H7). */
const explorationIssues = (settings: GameSettings): GameSettingsIssue[] => {
  if (fogOfWarEnabled(settings) || !optionalFeatureEnabled(settings, "explorationExpeditions")) return [];
  return [issue("warning", "explorationWithoutFog", "features.explorationExpeditions")];
};

/** The value rules of well-shaped settings, errors and warnings in a fixed order. */
export const validateGameSettings = (
  settings: GameSettings, context: GameSettingsValidationContext = {}
): GameSettingsIssue[] => [
  ...landingIssues(settings),
  ...fixedLevelIssues(settings.progression.levels, "progression.levels"),
  ...savingIssues(settings),
  ...campaignIssues(settings, context.offeredCampaignIds),
  ...experienceIssues(settings),
  ...explorationIssues(settings)
];

/** Any value (API body, local file): shape errors alone when malformed, else the value rules. */
export const checkGameSettings = (
  value: unknown, context: GameSettingsValidationContext = {}
): GameSettingsIssue[] => {
  if (!isGameSettings(value)) return shapeErrors(gameSettingsShapeIssues(value));
  return validateGameSettings(value, context);
};

/** Pinned rules of a save or an `adoptGameRules` payload. */
export const checkSimRules = (value: unknown): GameSettingsIssue[] => {
  if (!isSimRules(value)) return shapeErrors(simRulesShapeIssues(value));
  return fixedLevelIssues(value.level, "level");
};

/** The value rules of a map's own rules for the map kind `role` (kind-forbidden options are errors). */
export const validateMapRules = (rules: MapRules, role: RuleIslandRole): GameSettingsIssue[] => {
  const issues: GameSettingsIssue[] = [];
  if (rules.offlineCatchUp === "skip" && role === "home")
    issues.push(issue("error", "mapCatchUpSkipOnHome", "offlineCatchUp"));
  if (rules.level && !FIXED_LEVEL_MAP_ROLES.includes(role)) issues.push(issue("error", "mapFixedLevelRole", "level"));
  return [...issues, ...fixedLevelIssues(rules.level, "level")];
};

/** Any value (`MapScenario.rules` in a map header): shape errors alone when malformed, else the value rules. */
export const checkMapRules = (value: unknown, role: RuleIslandRole): GameSettingsIssue[] => {
  if (!isMapRules(value)) return shapeErrors(mapRulesShapeIssues(value));
  return validateMapRules(value, role);
};

export const hasGameSettingsErrors = (issues: readonly GameSettingsIssue[]) =>
  issues.some(entry => entry.severity === "error");

/** The issue's English message with `{name}` placeholders filled. */
export const formatGameSettingsIssue = (entry: GameSettingsIssue) => {
  const values: Readonly<Record<string, string | number>> = { ...entry.params, path: entry.path };
  return GAME_SETTINGS_ISSUE_MESSAGES[entry.code].en
    .replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder));
};
