import assert from "node:assert/strict";
import test from "node:test";

import { COLONY_LIFETIME_MS } from "../src/catalog/balance/expeditions.ts";
import {
  ARCHIPELAGO_TEXT_KEYS, archipelagoFailureNotices, archipelagoTextValues, colonyBookId, defaultAdventureBook,
  defaultColonyBook, generateAdventureScript, generateColonyScript, runArchipelagoFailure, scenarioRulesOf,
  type ScenarioBookRules
} from "../src/script/archipelago/index.ts";
import {
  ADVENTURE_WIN_QUEST_ID, COLONY_CANCELLED_QUEST_ID, COLONY_CONQUER_QUEST_ID, COLONY_DEFEATED_QUEST_ID,
  COLONY_HARBOUR_LOST_QUEST_ID, COLONY_HOLD_QUEST_ID
} from "../src/script/constants.ts";
import { resolveQuestText } from "../src/script/text/index.ts";
import type { MapScript, ScriptAction } from "../src/script/types/index.ts";
import { validateMapScript } from "../src/script/validate.ts";
import { TICK_HZ, TICK_MS } from "../src/time/constants.ts";
import { createEngine, createFakeWorld, runTicks } from "./script-engine-fixtures.ts";
import { doStep, num, ref, TEST_CATALOG } from "./script-fixtures.ts";

/** Generated colony/adventure books (trigger design §8.1) and the client archipelago executor (§8.2), TRG10. */

const RULES: ScenarioBookRules[] = [
  { claimSeconds: 0, expirySeconds: 0, objective: "defeat", rewardCoins: 0 },
  { claimSeconds: 5, expirySeconds: 0, objective: "defeat", rewardCoins: 7 },
  { claimSeconds: 0.05, expirySeconds: 0.2, objective: "defeat", rewardCoins: 25 },
  { claimSeconds: 30, expirySeconds: 3600, objective: "capture", rewardCoins: 500 },
  { claimSeconds: 12.5, expirySeconds: 86_400, objective: "capture", rewardCoins: 0 }
];

const issues = (script: MapScript, mapKind: "adventure" | "colony") => {
  const result = validateMapScript(script, { catalog: TEST_CATALOG, languages: ["en"], mapKind });
  return [...result.errors, ...result.warnings].map(issue => `${issue.code} ${issue.path}`);
};

const harbourDestroyed = (owner: number) => {
  const building = { family: "building", handle: { generation: 0, id: 4, space: "building" as const }, owner,
    type: "building:harbour" };
  return { actors: { building }, kind: "buildingDestroyed" as const, responses: { building: building.handle },
    values: { cause: "destroyed" } };
};

const startColony = (rules = RULES[0]!) => {
  const world = createFakeWorld();
  const engine = createEngine(generateColonyScript(rules, colonyBookId(9)), world);
  runTicks(engine, world, 20);
  return { engine, state: (id: string) => engine.state.quests[id]!, world };
};

const ops = (world: ReturnType<typeof createFakeWorld>) =>
  world.actions.map(request => `${request.op}:${(request.args.reason as { value?: string } | undefined)?.value ?? ""}`);

test("generated colony and adventure books pass the Ready check for every scenario rule set", () => {
  for (const rules of RULES) {
    assert.deepEqual(issues(generateColonyScript(rules), "colony"), []);
    assert.deepEqual(issues(generateAdventureScript(rules), "adventure"), []);
  }
  assert.equal(generateColonyScript(RULES[0], colonyBookId(12)).quests.id, "colony-12");
  assert.equal(defaultColonyBook().quests.map(quest => quest.id).join(), [COLONY_CONQUER_QUEST_ID,
    COLONY_DEFEATED_QUEST_ID, COLONY_HOLD_QUEST_ID, COLONY_HARBOUR_LOST_QUEST_ID, COLONY_CANCELLED_QUEST_ID].join());
  assert.equal(defaultAdventureBook().quests[0]!.id, ADVENTURE_WIN_QUEST_ID);
});

test("the scenario rules survive the book: objective, claimSeconds, expirySeconds and rewardCoins", () => {
  for (const rules of RULES) {
    assert.deepEqual(scenarioRulesOf(generateColonyScript(rules).quests), rules);
    assert.deepEqual(scenarioRulesOf(generateAdventureScript(rules).quests), rules);
  }
  const conquer = generateColonyScript(RULES[3]).quests.quests[0]!;
  assert.deepEqual(conquer.objective, { all: true, buildingId: null, holdSeconds: 30, kind: "enemyBuildingDestroyed" });
  assert.deepEqual(conquer.deadline, { kind: "gameTime", seconds: 3600 });
  assert.equal(conquer.mapReward?.coins, 500);
  assert.equal(scenarioRulesOf({ ...defaultColonyBook(), quests: [] }), null);
});

test("colony.conquer: the conquest event completes it and activates colony.hold in the same tick", () => {
  const { engine, state, world } = startColony();
  assert.equal(state(COLONY_CONQUER_QUEST_ID).state, "active");
  assert.equal(state(COLONY_HOLD_QUEST_ID).state, "inactive");
  engine.emit({ kind: "colonyConquered", player: 0 });
  const conqueredAt = world.now + TICK_MS;
  runTicks(engine, world, 1);
  assert.equal(state(COLONY_CONQUER_QUEST_ID).state, "succeeded");
  assert.equal(state(COLONY_HOLD_QUEST_ID).state, "active");
  assert.equal(state(COLONY_HOLD_QUEST_ID).activatedUtc, conqueredAt);
});

test("colony.conquer: the authored expiry is a gameTime deadline, checked on the one-second quest cadence", () => {
  const { engine, state, world } = startColony(RULES[3]);
  const activated = state(COLONY_CONQUER_QUEST_ID).activatedTick!;
  const expiryTick = activated + RULES[3]!.expirySeconds * 1000 / TICK_MS;
  runTicks(engine, world, expiryTick - world.tick - 1);
  assert.equal(state(COLONY_CONQUER_QUEST_ID).state, "active");
  runTicks(engine, world, 1);
  assert.equal(state(COLONY_CONQUER_QUEST_ID).state, "failed");
});

test("cadence gap: a sub-second expiry fails at the next second boundary, not on its own tick", () => {
  const { engine, state, world } = startColony(RULES[2]);
  const activated = state(COLONY_CONQUER_QUEST_ID).activatedTick!;
  runTicks(engine, world, RULES[2]!.expirySeconds * 1000 / TICK_MS);
  assert.equal(state(COLONY_CONQUER_QUEST_ID).state, "active");
  runTicks(engine, world, TICK_HZ - (world.tick - activated));
  assert.equal(state(COLONY_CONQUER_QUEST_ID).state, "failed");
  assert.equal(world.tick - activated, TICK_HZ);
});

test("colony.hold: fails at the first quest cadence at or after conqueredAt + the colony lifetime", () => {
  const { engine, state, world } = startColony();
  engine.emit({ kind: "colonyConquered", player: 0 });
  runTicks(engine, world, 1);
  const conqueredAt = state(COLONY_HOLD_QUEST_ID).activatedUtc!;
  const expired = (now: number) => conqueredAt + COLONY_LIFETIME_MS <= now;
  world.now = conqueredAt + COLONY_LIFETIME_MS - TICK_HZ * TICK_MS;
  runTicks(engine, world, TICK_HZ - 1);
  assert.equal(expired(world.now), false);
  assert.equal(state(COLONY_HOLD_QUEST_ID).state, "active");
  runTicks(engine, world, TICK_HZ);
  assert.equal(expired(world.now), true);
  assert.equal(state(COLONY_HOLD_QUEST_ID).state, "failed");
  runTicks(engine, world, 2);
  assert.deepEqual(ops(world), ["colonyEnd:expired", "notify:"]);
});

test("colony.defeated and colony.harbourLost fail by their events; a lost harbour also fails the conquest", () => {
  const defeated = startColony();
  defeated.engine.emit({ kind: "colonyDefeated", player: 0 });
  runTicks(defeated.engine, defeated.world, 2);
  assert.equal(defeated.state(COLONY_DEFEATED_QUEST_ID).state, "failed");
  assert.deepEqual(ops(defeated.world), ["colonyEnd:lost", "notify:"]);

  const enemyHarbour = startColony();
  enemyHarbour.engine.emit(harbourDestroyed(1));
  runTicks(enemyHarbour.engine, enemyHarbour.world, 2);
  assert.equal(enemyHarbour.state(COLONY_HARBOUR_LOST_QUEST_ID).state, "active");

  const lost = startColony();
  lost.engine.emit(harbourDestroyed(0));
  runTicks(lost.engine, lost.world, 40);
  assert.equal(lost.state(COLONY_HARBOUR_LOST_QUEST_ID).state, "failed");
  assert.equal(lost.state(COLONY_CONQUER_QUEST_ID).state, "failed");
  assert.deepEqual(ops(lost.world), ["colonyEnd:lost", "notify:"]);
});

test("adventure.win ends the map as a defeat when its deadline passes", () => {
  const world = createFakeWorld();
  const engine = createEngine(generateAdventureScript(RULES[2]), world);
  runTicks(engine, world, 3 * TICK_HZ);
  assert.equal(engine.state.quests[ADVENTURE_WIN_QUEST_ID]!.state, "failed");
  assert.deepEqual(world.actions.map(request => [request.op, (request.args.outcome as { value: string }).value]),
    [["endMap", "defeat"]]);
});

test("archipelago executor: colonyEnd then notify, in list order, for each archipelago quest", () => {
  const cases = [[COLONY_HOLD_QUEST_ID, "expired", ARCHIPELAGO_TEXT_KEYS.colonyExpired],
    [COLONY_CANCELLED_QUEST_ID, "cancelled", ARCHIPELAGO_TEXT_KEYS.colonyCancelled],
    [COLONY_HARBOUR_LOST_QUEST_ID, "lost", ARCHIPELAGO_TEXT_KEYS.colonyHarbourLost],
    [COLONY_DEFEATED_QUEST_ID, "lost", ARCHIPELAGO_TEXT_KEYS.colonyDefeated]] as const;
  for (const [questId, reason, key] of cases) {
    const log: string[] = [];
    const result = runArchipelagoFailure(defaultColonyBook(), questId, {
      colonyEnd: ended => { log.push(`end:${ended}`); return true; },
      notify: notice => log.push(`notify:${notice.text.translationKey}:${notice.important}`)
    });
    assert.deepEqual(log, [`end:${reason}`, `notify:${key}:true`]);
    assert.deepEqual(result, { ended: reason, notices: 1, unsupported: [] });
  }
});

test("archipelago executor: a colony the server already dropped skips colonyEnd and still shows one notice", () => {
  const notices: string[] = [];
  const result = runArchipelagoFailure(null, COLONY_HOLD_QUEST_ID, {
    colonyEnd: () => false,
    notify: notice => notices.push(resolveQuestText(notice.text,
      { evaluate: archipelagoTextValues({ islandName: "Marble Cay" }), locale: "en" }))
  });
  assert.deepEqual(result, { ended: null, notices: 1, unsupported: [] });
  assert.deepEqual(notices, ["Marble Cay has expired. Its remaining settlers, troops and goods returned home."]);
});

test("archipelago executor: the colony's own book wins; other steps are reported, disabled ones skipped", () => {
  const script = structuredClone(generateColonyScript()) as MapScript;
  const hold = script.quests.quests.find(quest => quest.id === COLONY_HOLD_QUEST_ID)!;
  hold.onFailure = [
    doStep("s1", "increaseVariable", { amount: num(1), variable: ref("variable", "var-1") }),
    { id: "s2", k: "wait", seconds: num(1) } as ScriptAction,
    { ...hold.onFailure[0]!, disabled: true },
    doStep("s4", "notify", { text: { k: "text", text: { en: "Custom farewell to {island}", hu: "Búcsú: {island}",
      values: { island: { expr: { args: {}, fn: "islandName", k: "fn" }, format: "text", kind: "expr" } } } } })
  ];
  const notices = archipelagoFailureNotices(script.quests, COLONY_HOLD_QUEST_ID);
  assert.equal(notices.length, 1);
  const evaluate = archipelagoTextValues({ islandName: "Tin Reef" });
  assert.equal(resolveQuestText(notices[0]!.text, { evaluate, locale: "hu" }), "Búcsú: Tin Reef");
  assert.equal(resolveQuestText(notices[0]!.text, { evaluate, locale: "de" }), "Custom farewell to Tin Reef");
  const ended: string[] = [];
  const result = runArchipelagoFailure(script.quests, COLONY_HOLD_QUEST_ID,
    { colonyEnd: reason => { ended.push(reason); return true; }, notify: () => {} });
  assert.deepEqual(result, { ended: null, notices: 1, unsupported: ["s1", "s2"] });
  assert.deepEqual(ended, []);
  const errors = validateMapScript(script, { catalog: TEST_CATALOG, languages: ["en"], mapKind: "colony" }).errors;
  assert.ok(errors.some(issue => issue.code === "archipelagoActionNotAllowed"));
});
