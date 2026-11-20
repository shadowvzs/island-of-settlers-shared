import {
  DEFAULT_AUTOSAVE_MINUTES, ONLINE_FEATURE_KEYS, type SETTING_DEPENDENCY_IDS, SIM_FEATURE_KEYS
} from "./constants.ts";
import {
  fogOfWarEnabled, type GameSettings, hasHomeIsland, menuBeforePlayStored, type OnlineFeatureKey, rewardsEnabled,
  type SimFeatureKey
} from "./game-settings.ts";

/**
 * The flat switches' dependency rules (plan §5.5, rev I22; owner answers to §19 of revision 3). Every switch is
 * stored once and stays independent; a combination that is unsafe or meaningless shows the dependent switch
 * disabled with its reason while the stored value is kept. This one pure helper serves the admin page, the editors'
 * badges, validation and the runtime, so they can never disagree.
 */
export type SettingDependencyId = typeof SETTING_DEPENDENCY_IDS[number];

/** The switches of the admin page (plan §5.5 order); `afterMapHome` is the "Home" option of "After a map". */
export type SettingKey =
  | "afterMapHome" | "autosave" | "connectivity" | "experience" | "fogOfWar" | "homeIsland" | "levels"
  | "menuBeforePlay" | "playerTroopsSightOnly" | "rewards" | "slots" | "talents" | OnlineFeatureKey | SimFeatureKey;

export interface SettingAvailability {
  /** False: the admin cannot change the switch here; the stored value is kept. */
  enabled: boolean;
  /** With `enabled: false`: true = the switch is forced on; absent = it is unavailable (off). */
  forced?: boolean;
  reason?: SettingDependencyId;
}

export interface EffectiveSaving {
  autosave: boolean;
  autosaveMinutes: number;
  slots: boolean;
}

/** The English reason each rule shows beside its disabled switch (GM-I18N translates the admin page). */
export const SETTING_DEPENDENCY_REASONS: Readonly<Record<SettingDependencyId, { en: string }>> = Object.freeze({
  D1: { en: "Online games with a home island save automatically: the server verifies one continuous save, catches "
    + "up time away and pays rewards from it." },
  D1b: { en: "Online campaigns with rewards save automatically and have no Save/Load slots: loading an older save "
    + "could claim the same rewards again." },
  D2: { en: "Loading an older save would roll back verified progress, the wallet, market orders and claimed rewards." },
  D3: { en: "The only way to keep progress while automatic saving is off." },
  D4: { en: "Nothing to explore while fog of war is off." },
  D5: { en: "Needs a home island." },
  D6: { en: "Needs online mode." },
  D7: { en: "Market goods move to and from the home island." },
  D8: { en: "There is no home island to sail to." },
  D9: { en: "Without a home island the game menu is always shown." },
  D10: { en: "Offline games always start from the game menu: it holds Continue, Load and New game." }
});

const AVAILABLE: SettingAvailability = Object.freeze({ enabled: true });
const forcedOn = (reason: SettingDependencyId): SettingAvailability => ({ enabled: false, forced: true, reason });
const unavailable = (reason: SettingDependencyId): SettingAvailability => ({ enabled: false, reason });

const ONLINE_KEYS: ReadonlySet<SettingKey> = new Set(ONLINE_FEATURE_KEYS);
const HOME_FEATURE_KEYS: ReadonlySet<SettingKey> = new Set(SIM_FEATURE_KEYS);

/**
 * D1/D2 (online with a home) and D1b (online without a home, rewards on): a rollback through a Save/Load slot
 * could reach online value, so automatic saving is forced on and slots are unavailable. Null when slots are safe.
 */
const rollbackRule = (settings: GameSettings): "home" | "rewards" | null => {
  if (settings.connectivity !== "online") return null;
  if (hasHomeIsland(settings)) return "home";
  return rewardsEnabled(settings) ? "rewards" : null;
};

const autosaveAvailability = (settings: GameSettings): SettingAvailability => {
  const rule = rollbackRule(settings);
  if (rule === "home") return forcedOn("D1");
  return rule === "rewards" ? forcedOn("D1b") : AVAILABLE;
};

const slotsAvailability = (settings: GameSettings): SettingAvailability => {
  const rule = rollbackRule(settings);
  if (rule === "home") return unavailable("D2");
  if (rule === "rewards") return unavailable("D1b");
  return settings.saving?.autosave === false ? forcedOn("D3") : AVAILABLE;
};

const onlineFeatureAvailability = (settings: GameSettings, key: SettingKey): SettingAvailability => {
  if (settings.connectivity === "offline") return unavailable("D6");
  return key === "market" && !hasHomeIsland(settings) ? unavailable("D7") : AVAILABLE;
};

const homeFeatureAvailability = (settings: GameSettings, key: SettingKey): SettingAvailability => {
  if (!hasHomeIsland(settings)) return unavailable("D5");
  return key === "explorationExpeditions" && !fogOfWarEnabled(settings) ? unavailable("D4") : AVAILABLE;
};

/**
 * D9/D10: the game menu is the only way into a game without a home island (campaign selection) and holds the
 * offline game's Continue, Load and New game, so it is forced on there; online with a home the admin decides.
 */
const menuBeforePlayAvailability = (settings: GameSettings): SettingAvailability => {
  if (!hasHomeIsland(settings)) return forcedOn("D9");
  return settings.connectivity === "offline" ? forcedOn("D10") : AVAILABLE;
};

/** Whether the admin may change `key` under the other stored switches, and why not (rules D1–D10, D1b). */
export const settingAvailability = (settings: GameSettings, key: SettingKey): SettingAvailability => {
  if (key === "autosave") return autosaveAvailability(settings);
  if (key === "slots") return slotsAvailability(settings);
  if (key === "menuBeforePlay") return menuBeforePlayAvailability(settings);
  if (ONLINE_KEYS.has(key)) return onlineFeatureAvailability(settings, key);
  if (HOME_FEATURE_KEYS.has(key)) return homeFeatureAvailability(settings, key);
  if (key === "afterMapHome" && !hasHomeIsland(settings)) return unavailable("D8");
  return AVAILABLE;
};

/** A switch's effective value: forced on, unavailable (off) or the stored value. */
const effectiveSwitch = (availability: SettingAvailability, stored: boolean) =>
  availability.enabled ? stored : availability.forced === true;

/** The saving the runtime applies (D1, D1b, D2, D3 resolved): today's game gives `{ true, 2, false }`. */
export const effectiveSaving = (settings: GameSettings): EffectiveSaving => {
  const stored = settings.saving;
  return {
    autosave: effectiveSwitch(autosaveAvailability(settings), stored?.autosave ?? true),
    autosaveMinutes: stored?.autosaveMinutes ?? DEFAULT_AUTOSAVE_MINUTES,
    slots: effectiveSwitch(slotsAvailability(settings), stored?.slots ?? false)
  };
};

/** Whether the game menu (title page) shows before play: the stored switch, forced on by D9 and D10. */
export const showsMenuBeforePlay = (settings: GameSettings) =>
  effectiveSwitch(menuBeforePlayAvailability(settings), menuBeforePlayStored(settings));
