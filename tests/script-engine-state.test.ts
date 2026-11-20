import assert from "node:assert/strict";
import { test } from "node:test";

import { ScriptEngine } from "../src/script/engine/engine.ts";
import { createScriptIslandLifecycle } from "../src/script/engine/island-lifecycle.ts";
import { isClaimable, recordClaim, repeatWindow } from "../src/script/engine/repeat-windows.ts";
import { migrateScriptRunState } from "../src/script/engine/run-state.ts";
import type { MapScript, QuestInstanceState, ScriptRunState } from "../src/script/types/index.ts";
import { DAY_MS } from "../src/time/constants.ts";
import {
  createEngine, createFakeWorld, huntEmission, increase, runTicks, setTo, START_UTC, value, variable, waitSeconds
} from "./script-engine-fixtures.ts";
import { emptyScript, num, numberVariable, quest, ref, trigger } from "./script-fixtures.ts";

const huntEvents = [{ kind: "animalKilled" as const, player: { faction: 0, kind: "slot" as const },
  slots: { victim: { family: ref("family", "animal.deer"), kind: "family" as const } } }];

/** A busy script: loops with waits, random draws, a queued trigger, a timer and a quest list. */
const busyScript = (): MapScript => emptyScript({
  quests: { ...emptyScript().quests, quests: [quest("q-1", { onActivate: [waitSeconds("s1", 3),
    increase("s2", "var-1", 100)], visibility: "hidden" })] },
  triggers: [
    trigger("trigger-1", { actions: [
      { as: "i", body: [waitSeconds("s2", 0.5), { args: { value: { args: { max: num(9), min: num(0) }, fn: "random",
        k: "fn" }, variable: ref("variable", "var-2") }, id: "s3", k: "do", op: "arrayAppend" }],
      from: num(1), id: "s1", k: "forRange", to: num(12) },
      { args: { quest: ref("quest", "q-1") }, id: "s4", k: "do", op: "activateQuest" }
    ] }),
    trigger("trigger-2", { actions: [waitSeconds("s1", 1), increase("s2", "var-1")], events: huntEvents })
  ],
  variables: [numberVariable("var-1", "score"), variable("var-2", "number[]", []),
    variable("var-3", "timer", { autoStart: true, periodic: true, seconds: 2, window: null })]
});

const feed = (engine: ScriptEngine, tick: number) => {
  if (tick % 7 === 0) engine.emit(huntEmission(tick));
};

const runFed = (engine: ScriptEngine, world: ReturnType<typeof createFakeWorld>, from: number, to: number) => {
  const hashes: string[] = [];
  for (let tick = from; tick < to; tick++) {
    feed(engine, tick);
    runTicks(engine, world, 1);
    hashes.push(engine.hash());
  }
  return hashes;
};

test("two starts with the same inputs produce the same run state hash every tick", () => {
  const first = createFakeWorld();
  const second = createFakeWorld();
  const a = runFed(createEngine(busyScript(), first), first, 0, 300);
  const b = runFed(createEngine(busyScript(), second), second, 0, 300);
  assert.deepEqual(a, b);
  const third = createFakeWorld();
  assert.notDeepEqual(runFed(createEngine(busyScript(), third, 43), third, 0, 300), a);
});

test("save and load in the middle of waits, loops and queued firings continues identically", () => {
  const world = createFakeWorld();
  const engine = createEngine(busyScript(), world);
  runFed(engine, world, 0, 37);
  assert.ok(engine.state.runs.some(run => run.waiting?.kind === "ticks"));
  assert.ok(engine.state.queued.length > 0 || engine.state.runs.length > 1);
  const saved: ScriptRunState = JSON.parse(JSON.stringify(engine.saveState()));
  const reloadedWorld = createFakeWorld();
  reloadedWorld.now = world.now;
  reloadedWorld.tick = world.tick;
  const reloaded = ScriptEngine.load(saved, reloadedWorld.port);
  assert.equal(reloaded.hash(), engine.hash());
  assert.deepEqual(runFed(reloaded, reloadedWorld, 37, 400), runFed(engine, world, 37, 400));
  assert.ok((value(engine, "var-1") as number) > 100);
});

test("catch-up mode never advances the script clock and delivers no events", () => {
  const world = createFakeWorld();
  const engine = createEngine(busyScript(), world);
  runTicks(engine, world, 10);
  const before = engine.hash();
  engine.setMode("catchUp");
  assert.equal(engine.isSubscribed("animalKilled"), false);
  for (let tick = 0; tick < 500; tick++) {
    engine.emit(huntEmission(tick));
    runTicks(engine, world, 1);
  }
  assert.equal(engine.state.scriptTick, 10);
  assert.equal(engine.hash(), before);
  engine.endCatchUp();
  runTicks(engine, world, 1);
  assert.equal(engine.state.scriptTick, 11);
});

test("island leave saves state and digest; enter restores it with catch-up frozen and date deadlines checked", () => {
  const world = createFakeWorld();
  const script = emptyScript({
    quests: { ...emptyScript().quests, quests: [
      quest("q-play", { deadline: { kind: "playTime", seconds: 60 } }),
      quest("q-date", { deadline: { days: 1, hours: 0, kind: "dateAfterActivation", minutes: 0 } })
    ] },
    triggers: [trigger("trigger-1", { actions: [
      { args: { quest: ref("quest", "q-play") }, id: "s1", k: "do", op: "activateQuest" },
      { args: { quest: ref("quest", "q-date") }, id: "s2", k: "do", op: "activateQuest" },
      waitSeconds("s3", 30), increase("s4", "var-1")] })],
    variables: [numberVariable("var-1", "after")]
  });
  const catchUps: string[] = [];
  const lifecycle = createScriptIslandLifecycle({
    catchUp: engine => {
      catchUps.push(engine.mode);
      world.now += 2 * DAY_MS;
      runTicks(engine, world, 1000);
    },
    openIsland: islandKey => ({ islandKey, mapKind: "colony", port: world.port, script, scriptHash: "h1", seed: 3 })
  });
  lifecycle.enter("colony-1", null);
  runTicks(lifecycle.engine!, world, 100);
  const { digest, state } = lifecycle.leave();
  assert.equal(lifecycle.engine, null);
  assert.equal(state.runState.scriptTick, 100);
  assert.deepEqual(digest.quests.map(entry => [entry.questId, entry.state, entry.deadlineUtc !== null]),
    [["q-play", "active", false], ["q-date", "active", true]]);
  lifecycle.enter("colony-1", JSON.parse(JSON.stringify(state)));
  const engine = lifecycle.engine!;
  assert.deepEqual(catchUps, ["catchUp", "catchUp"]);
  assert.equal(engine.state.scriptTick, 100);
  assert.equal(engine.state.quests["q-date"]?.state, "failed");
  assert.equal(engine.state.quests["q-play"]?.state, "active");
  runTicks(engine, world, 500);
  assert.equal(value(engine, "var-1"), 0);
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-1"), 1);
  runTicks(engine, world, 700);
  assert.equal(engine.state.quests["q-play"]?.state, "failed");
});

test("a revision-1 save migrates into a revision-2 book", () => {
  const world = createFakeWorld();
  const revision1 = emptyScript({
    quests: { ...emptyScript().quests, quests: [quest("q-old"), quest("q-kept")] },
    triggers: [trigger("trigger-1", { actions: [waitSeconds("s1", 100)] }),
      trigger("trigger-2", { actions: [waitSeconds("s1", 100)] })],
    variables: [numberVariable("var-1", "kept"), numberVariable("var-2", "retyped")]
  });
  const engine = createEngine(revision1, world);
  runTicks(engine, world, 1);
  engine.state.values["var-1"] = { type: "number", value: 7 };
  engine.state.values["var-2"] = { type: "number", value: 7 };
  engine.activateQuest("q-kept");
  const revision2 = emptyScript({
    quests: { ...emptyScript().quests, quests: [quest("q-kept"), quest("q-new")] }, revision: 2,
    triggers: [trigger("trigger-1", { actions: [waitSeconds("s1", 100)] }),
      trigger("trigger-2", { actions: [waitSeconds("s1", 5)] }),
      trigger("trigger-3", { actions: [increase("s1", "var-1")], events: [{ kind: "scriptUpdated",
        player: { kind: "any" }, slots: {} }] })],
    variables: [numberVariable("var-1", "kept"), variable("var-2", "string", "fresh")]
  });
  const { cancelledRuns, state } = migrateScriptRunState(engine.saveState(), revision2, "h2");
  assert.equal(cancelledRuns.length, 1);
  assert.deepEqual(state.runs.map(run => run.owner), [{ kind: "trigger", triggerId: "trigger-1" }]);
  assert.deepEqual(state.values["var-2"], { type: "string", value: "fresh" });
  assert.deepEqual(Object.fromEntries(Object.entries(state.quests).map(([id, entry]) => [id, entry.state])),
    { "q-kept": "active", "q-new": "inactive", "q-old": "retired" });
  const migrated = ScriptEngine.load(state, world.port);
  migrated.start("scriptUpdated");
  runTicks(migrated, world, 1);
  assert.equal(value(migrated, "var-1"), 8);
  assert.equal(migrated.state.snapshot.revision, 2);
});

const questState = (fields: Partial<QuestInstanceState>): QuestInstanceState => ({
  activatedScriptTick: 0, activatedTick: 0, activatedUtc: START_UTC, claimCount: 0, failures: 0, lastClaims: [],
  lastWindow: null, state: "succeeded", ...fields
});

test("repeat windows sit on a fixed UTC grid across midnight, weeks and calendar dates", () => {
  const daily = { kind: "calendar" as const, minuteUtc: 30, retryAfterFail: false };
  const before = Date.UTC(2026, 10, 2, 0, 29, 59);
  const after = Date.UTC(2026, 10, 2, 0, 30, 0);
  assert.equal(repeatWindow(daily, after, null)! - repeatWindow(daily, before, null)!, 1);
  const weekly = { kind: "calendar" as const, minuteUtc: 0, retryAfterFail: false, weekday: 1 };
  assert.equal(repeatWindow(weekly, Date.UTC(2026, 10, 9, 0, 0), null)! -
    repeatWindow(weekly, Date.UTC(2026, 10, 8, 23, 59), null)!, 1);
  const yearly = { day: 1, kind: "calendar" as const, minuteUtc: 60, month: 1, retryAfterFail: false };
  assert.equal(repeatWindow(yearly, Date.UTC(2027, 0, 1, 0, 59), null), 20260101);
  assert.equal(repeatWindow(yearly, Date.UTC(2027, 0, 1, 1, 0), null), 20270101);
  const monthly = { day: 31, kind: "calendar" as const, minuteUtc: 0, retryAfterFail: false };
  assert.equal(repeatWindow(monthly, Date.UTC(2026, 10, 15), null), 20261031);
  const interval = { days: 0, hours: 6, kind: "interval" as const, minutes: 0, retryAfterFail: false };
  assert.equal(repeatWindow(interval, START_UTC + 6 * 3_600_000 - 1, START_UTC), 0);
  assert.equal(repeatWindow(interval, START_UTC + 6 * 3_600_000, START_UTC), 1);
  const claimed = recordClaim(daily, questState({}), after);
  assert.equal(isClaimable(daily, { ...claimed, state: "succeeded" }, after + 1000), false);
  assert.equal(isClaimable(daily, { ...claimed, state: "succeeded" }, after + DAY_MS), true);
  let history = questState({});
  for (let day = 0; day < 12; day++) {
    history = recordClaim(daily, { ...history, state: "succeeded" }, after + day * DAY_MS);
  }
  assert.equal(history.claimCount, 12);
  assert.equal(history.lastClaims.length, 8);
  assert.equal(history.lastClaims.at(-1), after + 11 * DAY_MS);
});

test("hidden quests auto-claim on success; failures run onFailure; repeating quests re-arm", () => {
  const world = createFakeWorld();
  const engine = createEngine(emptyScript({
    quests: { ...emptyScript().quests, quests: [
      quest("q-hidden", { onSuccess: [increase("s1", "var-1")], visibility: "hidden",
        repeat: { kind: "onCompletion", maxClaims: 2, retryAfterFail: false } }),
      quest("q-fail", { onFailure: [increase("s1", "var-1", 10)] })
    ] },
    variables: [numberVariable("var-1", "score")]
  }), world);
  engine.activateQuest("q-hidden");
  engine.activateQuest("q-fail");
  engine.completeQuest("q-hidden");
  engine.failQuest("q-fail");
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-1"), 11);
  assert.equal(engine.state.quests["q-hidden"]?.state, "claimed");
  runTicks(engine, world, 20);
  assert.equal(engine.state.quests["q-hidden"]?.state, "active");
  engine.completeQuest("q-hidden");
  runTicks(engine, world, 20);
  assert.equal(engine.state.quests["q-hidden"]?.state, "claimed");
  assert.equal(engine.state.quests["q-hidden"]?.claimCount, 2);
  assert.equal(value(engine, "var-1"), 12);
});

test("a stale handle in captured responses resolves to gone, never to the slot's successor", () => {
  const world = createFakeWorld();
  const engine = createEngine(emptyScript({
    triggers: [trigger("trigger-1", { actions: [waitSeconds("s1", 1), { args: { mode: { k: "lit", type: "string",
      value: "replace" }, selector: { key: "targetActor", kind: "response" }, variable: ref("variable", "var-1") },
    id: "s2", k: "do", op: "storeActor" }, setTo("s3", "var-2", { args: { variable: ref("variable", "var-1") },
      fn: "length", k: "fn" })], concurrency: "parallel", events: huntEvents })],
    variables: [variable("var-1", "actorGroup", []), numberVariable("var-2", "stored")]
  }), world);
  engine.emit(huntEmission(4));
  runTicks(engine, world, 1);
  world.generations.set("animal:4", 1);
  runTicks(engine, world, 20);
  assert.deepEqual(value(engine, "var-1"), []);
  assert.equal(value(engine, "var-2"), 0);
  engine.emit(huntEmission(5));
  runTicks(engine, world, 21);
  assert.deepEqual(value(engine, "var-1"), [{ generation: 0, id: 5, space: "animal" }]);
  assert.equal(value(engine, "var-2"), 1);
});
