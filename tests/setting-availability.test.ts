import assert from "node:assert/strict";
import test from "node:test";

import {
  ONLINE_FEATURE_KEYS, SETTING_DEPENDENCY_IDS, SIM_FEATURE_KEYS
} from "../src/game-settings/constants.ts";
import {
  cloneGameSettings, DEFAULT_ONLINE_SETTINGS, GAME_SETTINGS_PRESETS, type GameSettings
} from "../src/game-settings/game-settings.ts";
import { checkGameSettings } from "../src/game-settings/game-settings-issues.ts";
import { isGameSettings } from "../src/game-settings/game-settings-shape.ts";
import {
  effectiveSaving, SETTING_DEPENDENCY_REASONS, settingAvailability, type SettingKey, showsMenuBeforePlay
} from "../src/game-settings/setting-availability.ts";
import { localRulesRevision } from "../src/game-settings/sim-rules.ts";

const settingsWith = (change: (settings: GameSettings) => void): GameSettings => {
  const settings = cloneGameSettings(DEFAULT_ONLINE_SETTINGS);
  change(settings);
  return settings;
};
const noHome = (settings: GameSettings) => {
  settings.start = { place: "campaignSelect" };
  settings.afterMap = "exitChoice";
};
const offline = (settings: GameSettings) => { settings.connectivity = "offline"; };
const ALL_KEYS: readonly SettingKey[] = ["afterMapHome", "autosave", "connectivity", "experience", "fogOfWar",
  "homeIsland", "levels", "menuBeforePlay", "playerTroopsSightOnly", "rewards", "slots", "talents",
  ...ONLINE_FEATURE_KEYS, ...SIM_FEATURE_KEYS];

test("today's settings: every switch is available except the slots (D2) and automatic saving (D1)", () => {
  const disabled: Partial<Record<SettingKey, object>> = {
    autosave: { enabled: false, forced: true, reason: "D1" }, slots: { enabled: false, reason: "D2" }
  };
  for (const key of ALL_KEYS)
    assert.deepEqual(settingAvailability(DEFAULT_ONLINE_SETTINGS, key), disabled[key] ?? { enabled: true }, key);
  assert.deepEqual(effectiveSaving(DEFAULT_ONLINE_SETTINGS), { autosave: true, autosaveMinutes: 2, slots: false });
});

test("D1/D2: online with a home forces automatic saving and keeps no slots, whatever is stored", () => {
  const stored = settingsWith(settings => {
    settings.saving = { autosave: false, autosaveMinutes: 7, slots: true };
  });
  assert.deepEqual(settingAvailability(stored, "autosave"), { enabled: false, forced: true, reason: "D1" });
  assert.deepEqual(settingAvailability(stored, "slots"), { enabled: false, reason: "D2" });
  assert.deepEqual(effectiveSaving(stored), { autosave: true, autosaveMinutes: 7, slots: false });
  assert.deepEqual(stored.saving, { autosave: false, autosaveMinutes: 7, slots: true }, "stored value kept");
});

test("online without a home and without rewards saves like offline (owner answer §19.1)", () => {
  const manual = settingsWith(settings => { noHome(settings); settings.saving = { autosave: false, slots: false }; });
  assert.deepEqual(settingAvailability(manual, "autosave"), { enabled: true });
  assert.deepEqual(settingAvailability(manual, "slots"), { enabled: false, forced: true, reason: "D3" });
  assert.deepEqual(effectiveSaving(manual), { autosave: false, autosaveMinutes: 2, slots: true });
  const both = settingsWith(settings => { noHome(settings); settings.saving = { autosave: true, slots: true }; });
  assert.deepEqual(effectiveSaving(both), { autosave: true, autosaveMinutes: 2, slots: true });
});

test("D1b: online without a home but rewards on: automatic saving forced, slots unavailable", () => {
  const rewards = settingsWith(settings => {
    noHome(settings);
    settings.progression.rewards = true;
    settings.saving = { autosave: false, slots: true };
  });
  assert.deepEqual(settingAvailability(rewards, "autosave"), { enabled: false, forced: true, reason: "D1b" });
  assert.deepEqual(settingAvailability(rewards, "slots"), { enabled: false, reason: "D1b" });
  assert.deepEqual(effectiveSaving(rewards), { autosave: true, autosaveMinutes: 2, slots: false });
  const offlineRewards = settingsWith(settings => {
    noHome(settings);
    offline(settings);
    settings.progression.rewards = true;
  });
  assert.deepEqual(settingAvailability(offlineRewards, "slots"), { enabled: true }, "offline rewards stay local");
});

test("D3: automatic saving off forces the slots on, offline with or without a home", () => {
  for (const home of [true, false]) {
    const settings = settingsWith(next => {
      offline(next);
      if (!home) noHome(next);
      next.saving = { autosave: false, slots: false };
    });
    assert.deepEqual(settingAvailability(settings, "slots"), { enabled: false, forced: true, reason: "D3" });
    assert.deepEqual(settingAvailability(settings, "autosave"), { enabled: true });
    assert.equal(effectiveSaving(settings).slots, true);
  }
  const timed = settingsWith(next => {
    offline(next);
    next.saving = { autosave: true, autosaveMinutes: 5, slots: false };
  });
  assert.deepEqual(effectiveSaving(timed), { autosave: true, autosaveMinutes: 5, slots: false });
});

test("D4: fog of war off makes exploring expeditions unavailable", () => {
  const fogOff = settingsWith(settings => { settings.fogOfWar = false; });
  assert.deepEqual(settingAvailability(fogOff, "explorationExpeditions"), { enabled: false, reason: "D4" });
  assert.deepEqual(settingAvailability(fogOff, "settlementExpeditions"), { enabled: true });
});

test("D5: without a home every home-bound feature is unavailable (before D4)", () => {
  const settings = settingsWith(next => { noHome(next); next.fogOfWar = false; });
  for (const key of SIM_FEATURE_KEYS)
    assert.deepEqual(settingAvailability(settings, key), { enabled: false, reason: "D5" });
  assert.deepEqual(settingAvailability(settings, "fogOfWar"), { enabled: true }, "fog off without a home");
});

test("D6: offline makes every online feature unavailable (before D7)", () => {
  const settings = settingsWith(next => { offline(next); noHome(next); });
  for (const key of ONLINE_FEATURE_KEYS)
    assert.deepEqual(settingAvailability(settings, key), { enabled: false, reason: "D6" });
});

test("D7: without a home the market is unavailable; the shop and the social features stay", () => {
  const settings = settingsWith(noHome);
  for (const key of ONLINE_FEATURE_KEYS) {
    const expected = key === "market" ? { enabled: false, reason: "D7" } : { enabled: true };
    assert.deepEqual(settingAvailability(settings, key), expected, key);
  }
});

test("D8: without a home the landing 'Home' is unavailable", () => {
  assert.deepEqual(settingAvailability(settingsWith(noHome), "afterMapHome"), { enabled: false, reason: "D8" });
  assert.deepEqual(settingAvailability(DEFAULT_ONLINE_SETTINGS, "afterMapHome"), { enabled: true });
});

test("D9/D10: the game menu is forced on without a home and offline; online with a home the switch decides", () => {
  const stored = [undefined, true, false] as const;
  const withMenu = (value: boolean | undefined, ...changes: ((settings: GameSettings) => void)[]) =>
    settingsWith(settings => {
      if (value !== undefined) settings.menuBeforePlay = value;
      changes.forEach(change => change(settings));
    });
  assert.deepEqual(stored.map(value => showsMenuBeforePlay(withMenu(value))), [true, true, false]);
  for (const value of stored) {
    assert.deepEqual(settingAvailability(withMenu(value), "menuBeforePlay"), { enabled: true });
    assert.deepEqual(settingAvailability(withMenu(value, noHome), "menuBeforePlay"),
      { enabled: false, forced: true, reason: "D9" });
    assert.deepEqual(settingAvailability(withMenu(value, offline), "menuBeforePlay"),
      { enabled: false, forced: true, reason: "D10" });
    assert.deepEqual(settingAvailability(withMenu(value, offline, noHome), "menuBeforePlay"),
      { enabled: false, forced: true, reason: "D9" });
    for (const changes of [[noHome], [offline], [offline, noHome]])
      assert.equal(showsMenuBeforePlay(withMenu(value, ...changes)), true);
  }
  assert.equal(SETTING_DEPENDENCY_REASONS.D9.en, "Without a home island the game menu is always shown.");
  // A stored "off" stays valid where the menu is forced on (the stored value is kept).
  assert.equal(isGameSettings(withMenu(false)), true);
  assert.deepEqual(checkGameSettings(withMenu(false, noHome)).filter(issue => issue.path.startsWith("menu")), []);
});

test("every rule has an English reason; independent switches are never disabled", () => {
  for (const id of SETTING_DEPENDENCY_IDS) assert.ok(SETTING_DEPENDENCY_REASONS[id].en.length > 10, id);
  const offlineNoHome = settingsWith(next => { offline(next); noHome(next); });
  for (const key of ["connectivity", "homeIsland", "experience", "levels", "playerTroopsSightOnly", "talents",
    "rewards"] as const)
    assert.deepEqual(settingAvailability(offlineNoHome, key), { enabled: true }, key);
});

test("presets: offline settlement = timed + slots, story = manual slots; both validate", () => {
  assert.deepEqual(effectiveSaving(GAME_SETTINGS_PRESETS.offlineSettlement),
    { autosave: true, autosaveMinutes: 2, slots: true });
  assert.deepEqual(effectiveSaving(GAME_SETTINGS_PRESETS.story), { autosave: false, autosaveMinutes: 2, slots: true });
  assert.equal(GAME_SETTINGS_PRESETS.onlineSettlement.saving, undefined);
  for (const preset of Object.values(GAME_SETTINGS_PRESETS)) assert.deepEqual(checkGameSettings(preset), []);
});

test("saving shape and range: optional, strict, minutes 1–60", () => {
  const withSaving = (saving: unknown) => ({ ...JSON.parse(JSON.stringify(DEFAULT_ONLINE_SETTINGS)), saving });
  assert.equal(isGameSettings(withSaving({ autosave: true, slots: false })), true);
  assert.equal(isGameSettings(withSaving({ autosave: "yes", slots: false })), false);
  assert.equal(isGameSettings(withSaving({ autosave: true, extra: 1, slots: false })), false);
  for (const [minutes, errors] of [[1, 0], [60, 0], [0, 1], [61, 1]] as const) {
    const issues = checkGameSettings(withSaving({ autosave: true, autosaveMinutes: minutes, slots: false }));
    assert.equal(issues.filter(issue => issue.code === "autosaveMinutesOutOfRange").length, errors, String(minutes));
  }
});

test("local revisions hash only the simulated subset (rev I11): saving and online switches pin nothing new", () => {
  const base = localRulesRevision(GAME_SETTINGS_PRESETS.offlineSettlement);
  const unsimulated = cloneGameSettings(GAME_SETTINGS_PRESETS.offlineSettlement);
  unsimulated.saving = { autosave: false, slots: true };
  unsimulated.online.chat = false;
  assert.equal(localRulesRevision(unsimulated), base);
  unsimulated.features.trade = false;
  assert.notEqual(localRulesRevision(unsimulated), base);
});
