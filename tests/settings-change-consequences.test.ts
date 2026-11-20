import assert from "node:assert/strict";
import test from "node:test";

import {
  cloneGameSettings, DEFAULT_ONLINE_SETTINGS, GAME_SETTINGS_PRESETS, type GameSettings
} from "../src/game-settings/game-settings.ts";
import {
  formatSettingsChangeConsequence, settingsChangeConsequences
} from "../src/game-settings/settings-change-consequences.ts";

const changed = (base: GameSettings, change: (settings: GameSettings) => void): GameSettings => {
  const settings = cloneGameSettings(base);
  change(settings);
  return settings;
};
const ids = (before: GameSettings, after: GameSettings) =>
  settingsChangeConsequences(before, after).map(entry => entry.id);
const today = DEFAULT_ONLINE_SETTINGS;
const offlineHome = changed(today, settings => { settings.connectivity = "offline"; });

test("an unchanged or invisible change has no consequences", () => {
  assert.deepEqual(ids(today, cloneGameSettings(today)), []);
  // Online with a home: automatic saving is forced (D1), so the stored switch changes nothing for players.
  assert.deepEqual(ids(today, changed(today, settings => {
    settings.saving = { autosave: false, slots: true };
  })), []);
  // Exploring while fog is off (D4) and colonies without a home (D5) stay disabled.
  const noFog = changed(today, settings => { settings.fogOfWar = false; });
  assert.deepEqual(ids(noFog, changed(noFog, settings => { settings.features.explorationExpeditions = false; })), []);
});

test("home removed and added list their consequences in order", () => {
  const story = changed(today, settings => {
    settings.start = { place: "campaignSelect" };
    settings.afterMap = "exitChoice";
  });
  // The market needs a home (D7): it is listed with the online features.
  assert.deepEqual(ids(today, story),
    ["homeRemoved", "campaignOwnStart", "otherHomeGamesHidden", "onlineFeaturesOff", "rewardsOff"]);
  assert.deepEqual(ids(story, today),
    ["homeAdded", "campaignWarnings", "otherHomeGamesHidden", "onlineFeaturesOn", "rewardsOn"]);
});

test("mode changes list the online switch-off and the saving that becomes available", () => {
  assert.deepEqual(ids(today, offlineHome), ["wentOffline"]);
  assert.deepEqual(ids(today, GAME_SETTINGS_PRESETS.offlineSettlement), ["wentOffline", "slotsAdded"]);
  assert.deepEqual(ids(GAME_SETTINGS_PRESETS.offlineSettlement, today), ["wentOnline", "slotsRemoved"]);
});

test("saving switches: stop, start, interval and slots", () => {
  const manual = changed(offlineHome, settings => { settings.saving = { autosave: false, slots: true }; });
  assert.deepEqual(ids(offlineHome, manual), ["autosaveStopped", "slotsAdded"]);
  const timed = changed(offlineHome, settings => {
    settings.saving = { autosave: true, autosaveMinutes: 5, slots: false };
  });
  const consequences = settingsChangeConsequences(manual, timed);
  assert.deepEqual(consequences.map(entry => entry.id), ["autosaveStarted", "slotsRemoved"]);
  assert.equal(formatSettingsChangeConsequence(consequences[0]!), "Automatic saving starts (every 5 minutes).");
  const interval = settingsChangeConsequences(offlineHome, timed);
  assert.deepEqual(interval.map(entry => entry.id), ["autosaveInterval"]);
  assert.equal(formatSettingsChangeConsequence(interval[0]!),
    "Automatic saving runs every 5 minutes instead of every 2.");
});

test("fog, features, online features, rewards and progression", () => {
  assert.deepEqual(ids(today, changed(today, settings => { settings.fogOfWar = false; })), ["fogOff"]);
  const fewer = changed(today, settings => {
    settings.features.trade = false;
    settings.features.colonies = false;
    settings.online.chat = false;
  });
  const consequences = settingsChangeConsequences(today, fewer);
  assert.deepEqual(consequences.map(entry => entry.id), ["featuresOff", "onlineFeaturesOff"]);
  assert.match(formatSettingsChangeConsequence(consequences[0]!), /^Switched off: Trade office, Colonies\./);
  assert.equal(formatSettingsChangeConsequence(consequences[1]!), "Switched off for every player: Chat.");
  assert.deepEqual(ids(fewer, today), ["featuresOn", "onlineFeaturesOn"]);
  const frozen = changed(today, settings => {
    settings.progression = { experience: false, levels: { kind: "fixed", level: 10 }, rewards: false, talents: false };
  });
  assert.deepEqual(ids(today, frozen), ["rewardsOff", "progressionFrozen", "levelChanged"]);
  assert.deepEqual(ids(frozen, today), ["rewardsOn", "progressionResumed"]);
});

test("the player troop sight rule reports both directions after fog, before the features", () => {
  const sightOff = changed(today, settings => { settings.playerTroopsSightOnly = false; });
  const consequences = settingsChangeConsequences(today, sightOff);
  assert.deepEqual(consequences.map(entry => entry.id), ["playerSightOff"]);
  assert.match(formatSettingsChangeConsequence(consequences[0]!), /New games and islands use it/);
  assert.deepEqual(ids(sightOff, today), ["playerSightOn"]);
  // Absent and explicit on are the same rule.
  assert.deepEqual(ids(today, changed(today, settings => { settings.playerTroopsSightOnly = true; })), []);
  const both = changed(sightOff, settings => { settings.fogOfWar = false; settings.features.trade = false; });
  assert.deepEqual(ids(today, both), ["fogOff", "playerSightOff", "featuresOff"]);
});

test("D1b: rewards on while online without a home removes the slots", () => {
  const onlineStory = changed(today, settings => {
    settings.start = { place: "campaignSelect" };
    settings.afterMap = "exitChoice";
    settings.saving = { autosave: false, slots: true };
  });
  const paid = changed(onlineStory, settings => { settings.progression.rewards = true; });
  assert.deepEqual(ids(onlineStory, paid), ["autosaveStarted", "slotsRemoved", "rewardsOn"]);
});

test("the game menu switch is reported by its effective value (D9, D10)", () => {
  const menuOff = changed(today, settings => { settings.menuBeforePlay = false; });
  assert.deepEqual(ids(today, menuOff), ["menuBeforePlayOff"]);
  assert.deepEqual(ids(menuOff, today), ["menuBeforePlayOn"]);
  assert.deepEqual(ids(today, changed(today, settings => { settings.menuBeforePlay = true; })), []);
  // Offline the menu always shows (D10): the stored switch changes nothing there.
  assert.deepEqual(ids(offlineHome, changed(offlineHome, settings => { settings.menuBeforePlay = false; })), []);
  assert.deepEqual(ids(menuOff, changed(menuOff, settings => { settings.connectivity = "offline"; })),
    ["wentOffline", "menuBeforePlayOn"]);
});
