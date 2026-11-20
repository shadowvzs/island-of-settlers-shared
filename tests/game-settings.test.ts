import assert from "node:assert/strict";
import test from "node:test";

import { MAX_PLAYER_LEVEL } from "../src/catalog/balance/levels.ts";
import { GAME_FEATURE_KEYS, LEGACY_RULES_REVISION, ONLINE_FEATURE_KEYS } from "../src/game-settings/constants.ts";
import { effectiveRules, resolveEffectiveLevel } from "../src/game-settings/effective-rules.ts";
import {
  cloneGameSettings, DEFAULT_ONLINE_SETTINGS, effectiveOnlineFeatures, GAME_SETTINGS_PRESETS, type GameSettings,
  menuBeforePlayStored, playerTroopsSightOnlyEnabled, rewardsEnabled, type RuleIslandRole
} from "../src/game-settings/game-settings.ts";
import {
  checkGameSettings, checkMapRules, checkSimRules, formatGameSettingsIssue, type GameSettingsIssue,
  hasGameSettingsErrors, validateGameSettings
} from "../src/game-settings/game-settings-issues.ts";
import { isGameSettings, isMapRules, isSimRules } from "../src/game-settings/game-settings-shape.ts";
import type { MapRules } from "../src/game-settings/map-rules.ts";
import {
  isLocalRulesRevision, LEGACY_SIM_RULES, localRulesRevision, type SimRules, toSimRules
} from "../src/game-settings/sim-rules.ts";

const ROLES: readonly RuleIslandRole[] = ["home", "colony", "adventure", "campaign"];
const codes = (issues: readonly GameSettingsIssue[]) =>
  issues.map(issue => `${issue.severity}:${issue.code}@${issue.path}`);
const settingsWith = (change: (settings: GameSettings) => void): GameSettings => {
  const settings = cloneGameSettings(DEFAULT_ONLINE_SETTINGS);
  change(settings);
  return settings;
};
const simWith = (overrides: Partial<SimRules>): SimRules => ({ ...LEGACY_SIM_RULES, ...overrides });
/** A JSON copy with one path replaced (or removed when `value` is undefined). */
const patched = (document: unknown, path: readonly string[], value: unknown) => {
  const copy = JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
  const parent = path.slice(0, -1).reduce((node, key) => node[key] as Record<string, unknown>, copy);
  const key = path[path.length - 1]!;
  if (value === undefined) delete parent[key];
  else parent[key] = value;
  return copy;
};

test("defaults reproduce today's game: online, everything on, earned levels, home start", () => {
  assert.deepEqual(DEFAULT_ONLINE_SETTINGS, {
    afterMap: "home",
    connectivity: "online",
    features: { adventures: true, colonies: true, settlementExpeditions: true, trade: true },
    online: { chat: true, friends: true, guilds: true, market: true, shop: true },
    progression: { experience: true, levels: { kind: "earned" }, talents: true },
    start: { homeMap: "publishedStarter", place: "home" },
    version: 1
  });
  assert.deepEqual(checkGameSettings(DEFAULT_ONLINE_SETTINGS), []);
  assert.equal(rewardsEnabled(DEFAULT_ONLINE_SETTINGS), true);
  assert.deepEqual(effectiveOnlineFeatures(DEFAULT_ONLINE_SETTINGS), DEFAULT_ONLINE_SETTINGS.online);
});

test("legacy sim rules are the default settings' rules and change nothing on any island role", () => {
  assert.deepEqual(LEGACY_SIM_RULES, {
    adventures: true, catchUp: "run", colonies: true, experience: true, explorationExpeditions: true, fogOfWar: true,
    homeIsland: true, level: { kind: "earned" }, revision: LEGACY_RULES_REVISION, rewards: true,
    settlementExpeditions: true, talents: true, trade: true
  });
  assert.deepEqual(LEGACY_SIM_RULES, toSimRules(DEFAULT_ONLINE_SETTINGS, LEGACY_RULES_REVISION));
  for (const role of ROLES) {
    const rules = effectiveRules(LEGACY_SIM_RULES, undefined, role);
    assert.deepEqual(rules, {
      adventures: true, catchUp: role === "campaign" ? "skip" : "run", colonies: true, experience: true,
      explorationExpeditions: true, fogOfWar: true, level: { kind: "earned" }, playerTroopsSightOnly: true,
      rewards: true, settlementExpeditions: true, talents: true, trade: true
    }, role);
    assert.equal(resolveEffectiveLevel(rules.level, 17), 17);
  }
});

test("defaults, presets and legacy rules are frozen; clones are editable and equal", () => {
  assert.throws(() => { (DEFAULT_ONLINE_SETTINGS.features as { trade: boolean }).trade = false; }, TypeError);
  assert.throws(() => { (LEGACY_SIM_RULES as { trade: boolean }).trade = false; }, TypeError);
  for (const preset of Object.values(GAME_SETTINGS_PRESETS)) {
    assert.ok(Object.isFrozen(preset) && Object.isFrozen(preset.progression.levels));
    const clone = cloneGameSettings(preset);
    assert.deepEqual(clone, preset);
    clone.features.trade = !clone.features.trade;
    assert.notDeepEqual(clone, preset);
  }
});

test("presets validate; offline settlement skips catch-up; story plays without a home and pays nothing", () => {
  for (const preset of Object.values(GAME_SETTINGS_PRESETS)) assert.deepEqual(checkGameSettings(preset), []);
  assert.equal(GAME_SETTINGS_PRESETS.onlineSettlement, DEFAULT_ONLINE_SETTINGS);
  const offline = toSimRules(GAME_SETTINGS_PRESETS.offlineSettlement, "r1");
  assert.deepEqual(offline, { ...LEGACY_SIM_RULES, catchUp: "skip", revision: "r1" });
  assert.deepEqual(toSimRules(GAME_SETTINGS_PRESETS.story, "r2"), {
    adventures: true, catchUp: "skip", colonies: true, experience: false, explorationExpeditions: true,
    fogOfWar: true, homeIsland: false, level: { kind: "fixed", level: MAX_PLAYER_LEVEL }, revision: "r2",
    rewards: false,
    settlementExpeditions: true, talents: false, trade: true
  });
});

test("layering: settings decide the sim rules; rewards derive from the home unless explicit", () => {
  const noHome = settingsWith(settings => { settings.start = { place: "campaignSelect" }; });
  assert.equal(rewardsEnabled(noHome), false);
  assert.equal(toSimRules(noHome, "r").homeIsland, false);
  noHome.progression.rewards = true;
  assert.equal(toSimRules(noHome, "r").rewards, true);
  const homeNoRewards = settingsWith(settings => { settings.progression.rewards = false; });
  assert.equal(toSimRules(homeNoRewards, "r").rewards, false);
  for (const key of GAME_FEATURE_KEYS) {
    const rules = toSimRules(settingsWith(settings => { settings.features[key] = false; }), "r");
    assert.deepEqual(rules, { ...LEGACY_SIM_RULES, [key]: false, revision: "r" }, key);
  }
  const fixed = toSimRules(settingsWith(settings => {
    settings.progression = { experience: false, levels: { kind: "fixed", level: 12 }, talents: false };
  }), "r");
  assert.deepEqual([fixed.level, fixed.experience, fixed.talents], [{ kind: "fixed", level: 12 }, false, false]);
});

test("offline switches every online feature off and never touches the single-player features", () => {
  const offline = settingsWith(settings => { settings.connectivity = "offline"; });
  for (const key of ONLINE_FEATURE_KEYS) assert.equal(effectiveOnlineFeatures(offline)[key], false, key);
  const noChat = settingsWith(settings => { settings.online.chat = false; });
  assert.deepEqual(effectiveOnlineFeatures(noChat), { ...DEFAULT_ONLINE_SETTINGS.online, chat: false });
  assert.deepEqual(toSimRules(noChat, LEGACY_RULES_REVISION), LEGACY_SIM_RULES);
  assert.equal(toSimRules(offline, "r").trade, true);
});

test("without a home island the player market is off and the other online features stay (D7)", () => {
  const noHome = settingsWith(settings => {
    settings.afterMap = "exitChoice";
    settings.start = { place: "campaignSelect" };
  });
  assert.deepEqual(effectiveOnlineFeatures(noHome), { ...DEFAULT_ONLINE_SETTINGS.online, market: false });
  assert.equal(noHome.online.market, true, "the stored value is kept");
});

test("local revisions are deterministic, key-order independent and change with the settings", () => {
  const reordered = JSON.parse(JSON.stringify(DEFAULT_ONLINE_SETTINGS, Object.keys(DEFAULT_ONLINE_SETTINGS).reverse()
    .concat(Object.keys(DEFAULT_ONLINE_SETTINGS.features), Object.keys(DEFAULT_ONLINE_SETTINGS.online),
      Object.keys(DEFAULT_ONLINE_SETTINGS.progression), Object.keys(DEFAULT_ONLINE_SETTINGS.start), "kind"))
  ) as GameSettings;
  assert.deepEqual(reordered, DEFAULT_ONLINE_SETTINGS);
  const revision = localRulesRevision(DEFAULT_ONLINE_SETTINGS);
  assert.match(revision, /^local:[0-9a-f]{64}$/);
  assert.equal(localRulesRevision(reordered), revision);
  assert.notEqual(localRulesRevision(GAME_SETTINGS_PRESETS.story), revision);
  assert.equal(isLocalRulesRevision(revision), true);
  assert.equal(isLocalRulesRevision(LEGACY_RULES_REVISION), false);
  assert.equal(isSimRules(toSimRules(DEFAULT_ONLINE_SETTINGS, revision)), true);
});

test("map overrides only switch off: each narrowing applies, and nothing a map says switches a feature on", () => {
  const allNarrowed: MapRules = {
    experience: "none",
    features: { adventures: "off", colonies: "off", settlementExpeditions: "off", trade: "off" },
    talents: "none"
  };
  for (const key of GAME_FEATURE_KEYS) {
    const rules = effectiveRules(LEGACY_SIM_RULES, { features: { [key]: "off" } }, "colony");
    for (const other of GAME_FEATURE_KEYS) assert.equal(rules[other], other !== key, `${key}/${other}`);
  }
  const narrowed = effectiveRules(LEGACY_SIM_RULES, allNarrowed, "home");
  assert.deepEqual(narrowed, {
    adventures: false, catchUp: "run", colonies: false, experience: false, explorationExpeditions: true,
    fogOfWar: true, level: { kind: "earned" }, playerTroopsSightOnly: true, rewards: true,
    settlementExpeditions: false, talents: false, trade: false
  });
  const allOff = simWith({
    adventures: false, colonies: false, experience: false, rewards: false, settlementExpeditions: false,
    talents: false, trade: false
  });
  for (const role of ROLES) {
    for (const map of [undefined, {}, allNarrowed]) {
      const rules = effectiveRules(allOff, map, role);
      const switches = [rules.adventures, rules.colonies, rules.experience, rules.rewards,
        rules.settlementExpeditions, rules.talents, rules.trade];
      assert.deepEqual(switches, switches.map(() => false), role);
    }
  }
  assert.equal(effectiveRules(simWith({ rewards: false }), allNarrowed, "campaign").rewards, false);
});

test("catch-up: offline skips everything, campaign maps never run, a map skip never applies to the home", () => {
  const skip: MapRules = { offlineCatchUp: "skip" };
  const expected: Record<RuleIslandRole, [string, string]> = {
    adventure: ["run", "skip"], campaign: ["skip", "skip"], colony: ["run", "skip"], home: ["run", "run"]
  };
  for (const role of ROLES) {
    const online = [effectiveRules(LEGACY_SIM_RULES, undefined, role), effectiveRules(LEGACY_SIM_RULES, skip, role)];
    assert.deepEqual(online.map(rules => rules.catchUp), expected[role], role);
    assert.equal(effectiveRules(simWith({ catchUp: "skip" }), undefined, role).catchUp, "skip", role);
  }
});

test("fixed map level: campaign maps may widen or lower; home and colony maps ignore it", () => {
  const mapLevel = (level: number): MapRules => ({ level: { kind: "fixed", level } });
  const earned = effectiveRules(LEGACY_SIM_RULES, mapLevel(40), "campaign").level;
  assert.deepEqual(earned, { kind: "fixed", level: 40 });
  assert.equal(resolveEffectiveLevel(earned, 3), 40);
  assert.equal(resolveEffectiveLevel(earned, 70), 40);
  const simFixed = simWith({ level: { kind: "fixed", level: 10 } });
  assert.deepEqual(effectiveRules(simFixed, mapLevel(40), "campaign").level, { kind: "fixed", level: 40 });
  assert.deepEqual(effectiveRules(simFixed, mapLevel(4), "campaign").level, { kind: "fixed", level: 4 });
  assert.deepEqual(effectiveRules(simFixed, undefined, "campaign").level, { kind: "fixed", level: 10 });
  for (const role of ["home", "colony"] as const) {
    assert.deepEqual(effectiveRules(LEGACY_SIM_RULES, mapLevel(40), role).level, { kind: "earned" }, role);
    assert.deepEqual(effectiveRules(simFixed, mapLevel(40), role).level, { kind: "fixed", level: 10 }, role);
  }
});

test("fixed map level on adventure maps only lowers: never above the account or settings level", () => {
  const mapLevel = (level: number): MapRules => ({ level: { kind: "fixed", level } });
  const capped = effectiveRules(LEGACY_SIM_RULES, mapLevel(20), "adventure").level;
  assert.deepEqual(capped, { kind: "capped", level: 20 });
  assert.equal(resolveEffectiveLevel(capped, 35), 20);
  assert.equal(resolveEffectiveLevel(capped, 20), 20);
  assert.equal(resolveEffectiveLevel(capped, 7), 7);
  const simFixed = simWith({ level: { kind: "fixed", level: 10 } });
  assert.deepEqual(effectiveRules(simFixed, mapLevel(40), "adventure").level, { kind: "fixed", level: 10 });
  assert.deepEqual(effectiveRules(simFixed, mapLevel(4), "adventure").level, { kind: "fixed", level: 4 });
  assert.deepEqual(effectiveRules(LEGACY_SIM_RULES, undefined, "adventure").level, { kind: "earned" });
});

test("resolved levels: earned passes the account level through; fixed and capped clamp to the level range", () => {
  assert.equal(resolveEffectiveLevel({ kind: "earned" }, 33), 33);
  assert.equal(resolveEffectiveLevel({ kind: "fixed", level: MAX_PLAYER_LEVEL + 5 }, 1), MAX_PLAYER_LEVEL);
  assert.equal(resolveEffectiveLevel({ kind: "fixed", level: 0 }, 9), 1);
  assert.equal(resolveEffectiveLevel({ kind: "capped", level: 0 }, 9), 1);
});

test("the resolver is pure: equal inputs give equal results and the inputs stay untouched", () => {
  const sim = simWith({ level: { kind: "fixed", level: 10 }, trade: false });
  const map: MapRules = { features: { colonies: "off" }, level: { kind: "fixed", level: 5 }, talents: "none" };
  const before = JSON.stringify([sim, map]);
  assert.deepEqual(effectiveRules(sim, map, "adventure"), effectiveRules(sim, map, "adventure"));
  assert.equal(JSON.stringify([sim, map]), before);
});

test("settings guard: every field has a passing and a failing fixture; objects are strict", () => {
  const good = JSON.parse(JSON.stringify(GAME_SETTINGS_PRESETS.story)) as GameSettings;
  good.start = { campaignIds: ["campaign-1"], homeMap: { mapId: "map-7" }, place: "campaignSelect" };
  assert.equal(isGameSettings(good), true);
  assert.equal(isGameSettings(DEFAULT_ONLINE_SETTINGS), true);
  const failing: readonly [string[], unknown][] = [
    [["version"], 2], [["version"], undefined], [["connectivity"], "lan"], [["afterMap"], "desktop"],
    [["online"], undefined], [["online", "market"], 1], [["online", "chat"], undefined],
    [["online", "friends"], "yes"], [["online", "guilds"], null], [["online", "shop"], 0],
    [["online", "offlineCatchUp"], true], [["features", "trade"], "off"], [["features", "colonies"], undefined],
    [["features", "adventures"], 1], [["features", "settlementExpeditions"], null], [["features", "pvp"], true],
    [["progression", "experience"], "none"], [["progression", "talents"], undefined],
    [["progression", "rewards"], "auto"], [["progression", "levels"], "earned"],
    [["progression", "levels"], { kind: "fixed" }], [["progression", "levels"], { kind: "fixed", level: 2.5 }],
    [["progression", "levels"], { kind: "earned", level: 3 }], [["progression", "levels"], { kind: "capped" }],
    [["start", "place"], "colony"], [["start", "place"], undefined], [["start", "homeMap"], "starter"],
    [["start", "homeMap"], { mapId: "" }], [["start", "homeMap"], { mapId: "a b" }],
    [["start", "campaignIds"], "campaign-1"], [["start", "campaignIds"], [7]], [["start", "slot"], 1],
    [["mode"], "story"], [["titleScreen"], { background: "../title.png" }], [["titleScreen"], { background: "a.ogg" }],
    [["titleScreen"], { music: "sub/title-music.ogg" }], [["titleScreen"], { music: "title.png" }], [["titleScreen"], "x"],
    [["menuBeforePlay"], "on"], [["menuBeforePlay"], 1], [["menuBeforePlay"], null],
    [["playerTroopsSightOnly"], "on"], [["playerTroopsSightOnly"], 0], [["playerTroopsSightOnly"], null]
  ];
  for (const [path, value] of failing) {
    const document = patched(good, path, value);
    assert.equal(isGameSettings(document), false, path.join("."));
    const issues = checkGameSettings(document);
    assert.ok(issues.length > 0 && issues.every(issue => issue.code === "invalidField"), path.join("."));
    assert.ok(issues.some(issue => issue.path.startsWith(path[0]!)), `${path.join(".")}: ${codes(issues)}`);
  }
  for (const value of [null, undefined, 1, "settings", [], [good]]) assert.equal(isGameSettings(value), false);
  assert.equal(isGameSettings(patched(good, ["progression", "rewards"], undefined)), true);
  assert.equal(isGameSettings(patched(good, ["start", "homeMap"], "publishedStarter")), true);
  const titled = patched(good, ["titleScreen"], { background: "harbour-dawn.webm", music: "theme.ogg" });
  assert.equal(isGameSettings(titled), true);
  assert.deepEqual(cloneGameSettings(titled as GameSettings).titleScreen, titled.titleScreen);
  for (const value of [true, false, undefined]) {
    const switched = patched(good, ["menuBeforePlay"], value);
    assert.equal(isGameSettings(switched), true, `menuBeforePlay ${value}`);
    assert.equal(cloneGameSettings(switched as GameSettings).menuBeforePlay, value);
    const sighted = patched(good, ["playerTroopsSightOnly"], value);
    assert.equal(isGameSettings(sighted), true, `playerTroopsSightOnly ${value}`);
    assert.equal(cloneGameSettings(sighted as GameSettings).playerTroopsSightOnly, value);
  }
});

test("player troop sight rule: absent reads as on and pins nothing; only off is pinned and resolved", () => {
  const older = JSON.parse(JSON.stringify(DEFAULT_ONLINE_SETTINGS)) as GameSettings;
  assert.equal("playerTroopsSightOnly" in older, false);
  assert.equal(playerTroopsSightOnlyEnabled(older), true);
  for (const preset of Object.values(GAME_SETTINGS_PRESETS)) assert.equal(playerTroopsSightOnlyEnabled(preset), true);
  // On (absent or explicit) gives exactly today's rules document and local revision: no hash changes.
  const explicitOn = settingsWith(settings => { settings.playerTroopsSightOnly = true; });
  assert.deepEqual(toSimRules(explicitOn, "r"), toSimRules(DEFAULT_ONLINE_SETTINGS, "r"));
  assert.equal("playerTroopsSightOnly" in toSimRules(DEFAULT_ONLINE_SETTINGS, "r"), false);
  assert.equal(localRulesRevision(explicitOn), localRulesRevision(DEFAULT_ONLINE_SETTINGS));
  const off = settingsWith(settings => { settings.playerTroopsSightOnly = false; });
  const pinned = toSimRules(off, "r");
  assert.equal(pinned.playerTroopsSightOnly, false);
  assert.equal(isSimRules(pinned), true);
  assert.notEqual(localRulesRevision(off), localRulesRevision(DEFAULT_ONLINE_SETTINGS));
  // No map or role changes it.
  for (const role of ROLES) {
    assert.equal(effectiveRules(pinned, { experience: "none" }, role).playerTroopsSightOnly, false, role);
    assert.equal(effectiveRules(LEGACY_SIM_RULES, undefined, role).playerTroopsSightOnly, true, role);
  }
});

test("game menu before play: defaults, presets and settings stored before the switch read as on", () => {
  for (const preset of Object.values(GAME_SETTINGS_PRESETS)) {
    assert.equal(preset.menuBeforePlay, undefined);
    assert.equal(menuBeforePlayStored(preset), true);
  }
  const older = JSON.parse(JSON.stringify(DEFAULT_ONLINE_SETTINGS)) as GameSettings;
  assert.equal("menuBeforePlay" in older, false);
  assert.equal(isGameSettings(older), true);
  assert.equal(menuBeforePlayStored(older), true);
  assert.equal(menuBeforePlayStored({ ...older, menuBeforePlay: false }), false);
  assert.equal(menuBeforePlayStored({ ...older, menuBeforePlay: true }), true);
});

test("sim rules and map rules guards: passing and failing fixtures per field", () => {
  assert.equal(isSimRules(LEGACY_SIM_RULES), true);
  for (const value of [true, false]) assert.equal(isSimRules(simWith({ playerTroopsSightOnly: value })), true);
  const simFailing: readonly [string, unknown][] = [
    ["adventures", 1], ["catchUp", "pause"], ["colonies", undefined], ["experience", "none"], ["homeIsland", null],
    ["level", { kind: "capped", level: 3 }], ["level", { kind: "fixed", level: "3" }], ["revision", ""],
    ["revision", 7], ["rewards", undefined], ["settlementExpeditions", "off"], ["talents", "none"], ["trade", 0],
    ["market", true], ["playerTroopsSightOnly", "off"], ["playerTroopsSightOnly", 0]
  ];
  for (const [key, value] of simFailing) {
    assert.equal(isSimRules(patched(LEGACY_SIM_RULES, [key], value)), false, key);
    const issues = codes(checkSimRules(patched(LEGACY_SIM_RULES, [key], value)));
    assert.ok(issues.length === 1 && issues[0]!.startsWith(`error:invalidField@${key}`), `${key}: ${issues}`);
  }
  assert.deepEqual(codes(checkSimRules(simWith({ level: { kind: "fixed", level: 0 } }))),
    ["error:fixedLevelOutOfRange@level.level"]);
  assert.deepEqual(checkSimRules(simWith({ level: { kind: "fixed", level: MAX_PLAYER_LEVEL } })), []);

  const fullMap: MapRules = {
    experience: "none", features: { adventures: "off", colonies: "off", settlementExpeditions: "off", trade: "off" },
    level: { kind: "fixed", level: 12 }, offlineCatchUp: "skip", talents: "none"
  };
  for (const map of [{}, { features: {} }, fullMap]) assert.equal(isMapRules(map), true);
  const mapFailing: readonly unknown[] = [
    null, [], { experience: "all" }, { experience: true }, { features: { trade: "on" } },
    { features: { trade: true } }, { features: { colonies: "inherit" } }, { features: { adventures: false } },
    { features: { settlementExpeditions: "skip" } }, { features: { market: "off" } }, { level: { kind: "earned" } },
    { level: { kind: "fixed" } }, { level: 12 }, { offlineCatchUp: "run" }, { talents: "all" }, { rewards: true }
  ];
  for (const map of mapFailing) {
    assert.equal(isMapRules(map), false, JSON.stringify(map));
    assert.ok(hasGameSettingsErrors(checkMapRules(map, "campaign")), JSON.stringify(map));
  }
});

test("settings validation: ordered errors and warnings with stable codes and English messages", () => {
  const broken = settingsWith(settings => {
    settings.start = { campaignIds: ["known", "gone"], place: "campaignSelect" };
    settings.progression = { experience: false, levels: { kind: "fixed", level: MAX_PLAYER_LEVEL + 1 }, talents: true };
  });
  const issues = validateGameSettings(broken, { offeredCampaignIds: new Set(["known"]) });
  assert.deepEqual(codes(issues), [
    "error:afterMapHomeWithoutHome@afterMap",
    "error:fixedLevelOutOfRange@progression.levels.level",
    "warning:campaignNotOffered@start.campaignIds[1]"
  ]);
  assert.equal(hasGameSettingsErrors(issues), true);
  assert.equal(formatGameSettingsIssue(issues[1]!),
    `progression.levels.level: level ${MAX_PLAYER_LEVEL + 1} is outside 1–${MAX_PLAYER_LEVEL}.`);
  assert.equal(formatGameSettingsIssue(issues[2]!), "start.campaignIds[1]: campaign gone is not an offered campaign.");
  assert.deepEqual(codes(validateGameSettings(broken)).filter(code => code.includes("campaignNotOffered")), []);

  const frozenLevels = settingsWith(settings => { settings.progression.experience = false; });
  const warnings = checkGameSettings(frozenLevels);
  assert.deepEqual(codes(warnings), ["warning:xpOffLevelsEarned@progression.experience"]);
  assert.equal(hasGameSettingsErrors(warnings), false);
  const noFog = settingsWith(settings => { settings.fogOfWar = false; });
  assert.deepEqual(codes(checkGameSettings(noFog)), ["warning:explorationWithoutFog@features.explorationExpeditions"]);
  const noFogNoExploring = settingsWith(settings => {
    settings.fogOfWar = false;
    settings.features.explorationExpeditions = false;
  });
  assert.deepEqual(checkGameSettings(noFogNoExploring), []);
  for (const level of [1, MAX_PLAYER_LEVEL]) {
    const fixed = settingsWith(settings => { settings.progression.levels = { kind: "fixed", level }; });
    assert.deepEqual(checkGameSettings(fixed), [], String(level));
  }
  for (const afterMap of ["campaignSelect", "exitChoice"] as const) {
    assert.deepEqual(checkGameSettings(settingsWith(settings => { settings.afterMap = afterMap; })), [], afterMap);
  }
});

test("map rules validation: kind-forbidden options are errors (home skip, fixed level off campaign/adventure)", () => {
  const skip: MapRules = { offlineCatchUp: "skip" };
  const level: MapRules = { level: { kind: "fixed", level: 12 } };
  assert.deepEqual(codes(checkMapRules(skip, "home")), ["error:mapCatchUpSkipOnHome@offlineCatchUp"]);
  for (const role of ["colony", "adventure", "campaign"] as const) assert.deepEqual(checkMapRules(skip, role), []);
  for (const role of ["home", "colony"] as const)
    assert.deepEqual(codes(checkMapRules(level, role)), ["error:mapFixedLevelRole@level"], role);
  for (const role of ["adventure", "campaign"] as const) assert.deepEqual(checkMapRules(level, role), [], role);
  assert.deepEqual(codes(checkMapRules({ level: { kind: "fixed", level: MAX_PLAYER_LEVEL + 1 } }, "campaign")),
    ["error:fixedLevelOutOfRange@level.level"]);
  assert.deepEqual(codes(checkMapRules({ ...skip, level: { kind: "fixed", level: 0 } }, "home")), [
    "error:mapCatchUpSkipOnHome@offlineCatchUp", "error:mapFixedLevelRole@level",
    "error:fixedLevelOutOfRange@level.level"
  ]);
  for (const role of ROLES) assert.deepEqual(checkMapRules({ features: { trade: "off" }, talents: "none" }, role), []);
});

test("exploration and fog switches: absent = today, exploration needs fog, a map may narrow exploration", () => {
  assert.equal(LEGACY_SIM_RULES.explorationExpeditions, true);
  assert.equal(LEGACY_SIM_RULES.fogOfWar, true);
  assert.equal(isGameSettings(DEFAULT_ONLINE_SETTINGS), true);
  const noExplore = settingsWith(settings => { settings.features.explorationExpeditions = false; });
  assert.equal(isGameSettings(noExplore), true);
  assert.deepEqual(toSimRules(noExplore, "r"), { ...LEGACY_SIM_RULES, explorationExpeditions: false, revision: "r" });
  const noFog = settingsWith(settings => { settings.fogOfWar = false; });
  assert.equal(isGameSettings(noFog), true);
  const noFogRules = toSimRules(noFog, "r");
  assert.deepEqual(noFogRules, { ...LEGACY_SIM_RULES, fogOfWar: false, revision: "r" });
  assert.equal(isSimRules(noFogRules), true);
  for (const role of ROLES) {
    const rules = effectiveRules(noFogRules, undefined, role);
    assert.deepEqual([rules.fogOfWar, rules.explorationExpeditions, rules.settlementExpeditions], [false, false, true]);
  }
  const narrowed = effectiveRules(LEGACY_SIM_RULES, { features: { explorationExpeditions: "off" } }, "home");
  assert.deepEqual([narrowed.explorationExpeditions, narrowed.settlementExpeditions], [false, true]);
  assert.equal(isMapRules({ features: { explorationExpeditions: "off" } }), true);
  assert.equal(isSimRules({ ...LEGACY_SIM_RULES, fogOfWar: undefined }), false);
  assert.equal(isGameSettings({ ...DEFAULT_ONLINE_SETTINGS, fogOfWar: "no" }), false);
});
