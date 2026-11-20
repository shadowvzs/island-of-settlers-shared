import { ONLINE_FEATURE_KEYS, SIM_FEATURE_KEYS } from "./constants.ts";
import {
  effectiveOnlineFeatures, fogOfWarEnabled, type GameSettings, hasHomeIsland, type LevelRule,
  optionalFeatureEnabled, playerTroopsSightOnlyEnabled, rewardsEnabled, type SimFeatureKey
} from "./game-settings.ts";
import { effectiveSaving, settingAvailability, showsMenuBeforePlay } from "./setting-availability.ts";

/**
 * What a settings change does to the players (plan §13.1, owner Q2): the admin page's confirmation dialog lists
 * these before a save. Pure; compares the effective values (dependency rules D1–D10 applied), so a stored switch
 * that stays disabled never reports a change. The order is fixed (home, mode, game menu, saving, fog, player troop
 * sight, features, rewards, progression) and every id is stable, so the dialog, tests and a later translation key
 * off the id.
 */
export const SETTINGS_CHANGE_MESSAGES = {
  homeRemoved: { en: "Home islands are kept but not used; players start at the campaign selection." },
  campaignOwnStart: {
    en: "Campaign maps start from their own start setup; launch requirements and cargo are ignored."
  },
  homeAdded: { en: "Players start on a home island; campaigns launch from its harbour with cargo." },
  campaignWarnings: { en: "Campaign maps without rewards or launch cargo will show warnings in the editors." },
  otherHomeGamesHidden: { en: "Browser games of the other home setting are kept but not shown." },
  wentOffline: {
    en: "Market, shop, chat, friends and guilds switch off; catch-up stops; players no longer use their cloud "
      + "saves (kept) and play in the browser with the save switches."
  },
  wentOnline: {
    en: "Catch-up of the time away runs at every load; offline browser games are kept but not shown."
  },
  menuBeforePlayOff: { en: "The game menu no longer shows before play; players start straight on their island." },
  menuBeforePlayOn: { en: "Players see the game menu (Continue, Settings) before their island loads." },
  autosaveStopped: { en: "Automatic saving stops; players save into slots." },
  autosaveStarted: { en: "Automatic saving starts (every {minutes} minutes)." },
  autosaveInterval: { en: "Automatic saving runs every {minutes} minutes instead of every {previous}." },
  slotsRemoved: { en: "Save/Load slots disappear; saved slots are kept but cannot be loaded." },
  slotsAdded: { en: "Players can save into Save/Load slots and load them." },
  fogOff: { en: "Exploring expeditions become unavailable; every harbour spot is offered." },
  fogOn: { en: "Fog of war covers unexplored islands again; areas revealed while it was off stay revealed." },
  playerSightOff: {
    en: "Player troops attack enemies they cannot see; computer troops still act only on what they see. New games "
      + "and islands use it, and an island in play switches when it next loads."
  },
  playerSightOn: {
    en: "Player troops act only on enemies they see or that hit them. New games and islands use it, and an island "
      + "in play switches when it next loads."
  },
  featuresOff: {
    en: "Switched off: {features}. Running colonies and adventures finish; no new ones start; open trade offers "
      + "are refunded."
  },
  featuresOn: { en: "Switched on: {features}." },
  onlineFeaturesOff: { en: "Switched off for every player: {features}." },
  onlineFeaturesOn: { en: "Switched on for every player: {features}." },
  rewardsOff: { en: "Quest, claim and campaign rewards are no longer paid." },
  rewardsOn: { en: "Quest, claim and campaign rewards are paid." },
  progressionFrozen: { en: "Levels and talents no longer change." },
  progressionResumed: { en: "Players earn experience, levels and talents again." },
  levelChanged: { en: "Every player counts as level {level}." }
} as const;

export type SettingsChangeId = keyof typeof SETTINGS_CHANGE_MESSAGES;

export interface SettingsChangeConsequence {
  id: SettingsChangeId;
  params: Readonly<Record<string, string | number>>;
}

/** Display names of the feature switches (English; GM-I18N translates the admin page). */
export const FEATURE_SWITCH_NAMES: Readonly<Record<SimFeatureKey | typeof ONLINE_FEATURE_KEYS[number], string>> = {
  adventures: "Adventures",
  chat: "Chat",
  colonies: "Colonies",
  explorationExpeditions: "Exploring expeditions",
  friends: "Friends",
  guilds: "Guilds",
  market: "Market",
  settlementExpeditions: "Settlement expeditions",
  shop: "Shop",
  trade: "Trade office"
};

type Consequences = SettingsChangeConsequence[];
type Collect = (before: GameSettings, after: GameSettings, into: Consequences) => void;

const add = (into: Consequences, id: SettingsChangeId, params: Record<string, string | number> = {}) => {
  into.push({ id, params });
};

const homeChanges: Collect = (before, after, into) => {
  const hadHome = hasHomeIsland(before);
  if (hadHome === hasHomeIsland(after)) return;
  if (hadHome) {
    add(into, "homeRemoved");
    add(into, "campaignOwnStart");
  } else {
    add(into, "homeAdded");
    add(into, "campaignWarnings");
  }
  add(into, "otherHomeGamesHidden");
};

const connectivityChanges: Collect = (before, after, into) => {
  if (before.connectivity === after.connectivity) return;
  add(into, after.connectivity === "offline" ? "wentOffline" : "wentOnline");
};

/** The effective menu switch (D9, D10 applied): also reported when a home or mode change frees a stored "off". */
const menuBeforePlayChanges: Collect = (before, after, into) => {
  const shown = showsMenuBeforePlay(before);
  if (shown === showsMenuBeforePlay(after)) return;
  add(into, shown ? "menuBeforePlayOff" : "menuBeforePlayOn");
};

const autosaveChanges: Collect = (before, after, into) => {
  const previous = effectiveSaving(before);
  const next = effectiveSaving(after);
  if (previous.autosave && !next.autosave) add(into, "autosaveStopped");
  if (!previous.autosave && next.autosave) add(into, "autosaveStarted", { minutes: next.autosaveMinutes });
  if (!previous.autosave || !next.autosave || previous.autosaveMinutes === next.autosaveMinutes) return;
  add(into, "autosaveInterval", { minutes: next.autosaveMinutes, previous: previous.autosaveMinutes });
};

const slotChanges: Collect = (before, after, into) => {
  const hadSlots = effectiveSaving(before).slots;
  if (hadSlots === effectiveSaving(after).slots) return;
  add(into, hadSlots ? "slotsRemoved" : "slotsAdded");
};

const fogChanges: Collect = (before, after, into) => {
  const hadFog = fogOfWarEnabled(before);
  if (hadFog === fogOfWarEnabled(after)) return;
  add(into, hadFog ? "fogOff" : "fogOn");
};

const playerSightChanges: Collect = (before, after, into) => {
  const sightOnly = playerTroopsSightOnlyEnabled(before);
  if (sightOnly === playerTroopsSightOnlyEnabled(after)) return;
  add(into, sightOnly ? "playerSightOff" : "playerSightOn");
};

const storedSimFeature = (settings: GameSettings, key: SimFeatureKey) =>
  key === "explorationExpeditions" ? optionalFeatureEnabled(settings, key) : settings.features[key];

/** A simulated feature as the players get it: its switch, unless a dependency rule (D4, D5) disables it. */
const effectiveSimFeature = (settings: GameSettings, key: SimFeatureKey) =>
  settingAvailability(settings, key).enabled && storedSimFeature(settings, key);

const nameList = (keys: readonly (keyof typeof FEATURE_SWITCH_NAMES)[]) =>
  keys.map(key => FEATURE_SWITCH_NAMES[key]).join(", ");

/**
 * Feature switches that changed on their own (a home or fog change already explains D4/D5, so it is not repeated
 * as a feature list).
 */
const simFeatureChanges: Collect = (before, after, into) => {
  if (hasHomeIsland(before) !== hasHomeIsland(after)) return;
  const changed = SIM_FEATURE_KEYS.filter(key => key !== "explorationExpeditions"
    || fogOfWarEnabled(before) === fogOfWarEnabled(after));
  const off = changed.filter(key => effectiveSimFeature(before, key) && !effectiveSimFeature(after, key));
  const on = changed.filter(key => !effectiveSimFeature(before, key) && effectiveSimFeature(after, key));
  if (off.length) add(into, "featuresOff", { features: nameList(off) });
  if (on.length) add(into, "featuresOn", { features: nameList(on) });
};

/** Online features that changed while the mode stayed (a mode change already lists them). */
const onlineFeatureChanges: Collect = (before, after, into) => {
  if (before.connectivity !== after.connectivity) return;
  const previous = effectiveOnlineFeatures(before);
  const next = effectiveOnlineFeatures(after);
  const off = ONLINE_FEATURE_KEYS.filter(key => previous[key] && !next[key]);
  const on = ONLINE_FEATURE_KEYS.filter(key => !previous[key] && next[key]);
  if (off.length) add(into, "onlineFeaturesOff", { features: nameList(off) });
  if (on.length) add(into, "onlineFeaturesOn", { features: nameList(on) });
};

const rewardChanges: Collect = (before, after, into) => {
  const paid = rewardsEnabled(before);
  if (paid === rewardsEnabled(after)) return;
  add(into, paid ? "rewardsOff" : "rewardsOn");
};

/** Progress changes: XP and talents both on and levels earned = "progressing". */
const progressing = ({ progression }: GameSettings) =>
  progression.experience && progression.talents && progression.levels.kind === "earned";

const fixedLevel = (levels: LevelRule) => levels.kind === "fixed" ? levels.level : null;

const progressionChanges: Collect = (before, after, into) => {
  const wasProgressing = progressing(before);
  if (wasProgressing && !progressing(after)) add(into, "progressionFrozen");
  if (!wasProgressing && progressing(after)) add(into, "progressionResumed");
  const level = fixedLevel(after.progression.levels);
  if (level === null || level === fixedLevel(before.progression.levels)) return;
  add(into, "levelChanged", { level });
};

const COLLECTORS: readonly Collect[] = [
  homeChanges, connectivityChanges, menuBeforePlayChanges, autosaveChanges, slotChanges, fogChanges,
  playerSightChanges, simFeatureChanges, onlineFeatureChanges, rewardChanges, progressionChanges
];

/** The ordered consequences of saving `after` over `before`; empty = nothing the players notice. */
export const settingsChangeConsequences = (before: GameSettings, after: GameSettings): SettingsChangeConsequence[] => {
  const into: Consequences = [];
  for (const collect of COLLECTORS) collect(before, after, into);
  return into;
};

/** The consequence's English text with `{name}` placeholders filled. */
export const formatSettingsChangeConsequence = ({ id, params }: SettingsChangeConsequence) =>
  SETTINGS_CHANGE_MESSAGES[id].en.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    String(params[name] ?? placeholder));
