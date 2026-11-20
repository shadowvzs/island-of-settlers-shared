import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSubscriptionIndex, SCRIPT_EVENT_KIND_INDEX } from "../src/script/engine/subscriptions.ts";
import type { ScriptAction, ScriptTrigger } from "../src/script/types/index.ts";
import { secondsToTicks } from "../src/time/constants.ts";
import {
  createEngine, createFakeWorld, deer, huntEmission, increase, runTicks, setTo, value, variable, varExpr, waitSeconds
} from "./script-engine-fixtures.ts";
import { emptyScript, num, numberVariable, quest, ref, str, trigger } from "./script-fixtures.ts";

const math = (op: string, a: unknown, b: unknown) => ({ a, b, k: "math", op });
const round = (mode: string, of: unknown) => ({ k: "round", mode, of });
const huntEvent = (fields: object = {}) => ({
  kind: "animalKilled" as const, player: { faction: 0, kind: "slot" as const },
  slots: { victim: { family: ref("family", "animal.deer"), kind: "family" as const } }, ...fields
});
const huntTrigger = (id: string, actions: ScriptAction[], fields: Partial<ScriptTrigger> = {}) =>
  trigger(id, { actions, events: [huntEvent()], ...fields });
const codes = (engine: { takeLog: () => { code: string }[] }) => engine.takeLog().map(entry => entry.code);

test("mapStarted fires on the first live tick and expressions follow the rounding and mod rules", () => {
  const world = createFakeWorld();
  const script = emptyScript({
    triggers: [trigger("trigger-1", { actions: [
      setTo("s1", "var-1", round("round", num(-2.5))),
      setTo("s2", "var-2", round("round", num(2.5))),
      setTo("s3", "var-3", math("mod", num(-7), num(3))),
      setTo("s4", "var-4", math("/", num(5), num(0))),
      setTo("s5", "var-5", round("trunc", num(-1.7)))
    ] })],
    variables: ["var-1", "var-2", "var-3", "var-4", "var-5"].map(id => numberVariable(id, id.replace("-", "")))
  });
  const engine = createEngine(script, world);
  assert.equal(value(engine, "var-1"), 0);
  runTicks(engine, world, 1);
  assert.deepEqual(["var-1", "var-2", "var-3", "var-4", "var-5"].map(id => value(engine, id)), [-3, 3, -1, 0, -1]);
  assert.ok(codes(engine).includes("divisionByZero"));
  assert.ok(Object.is(value(engine, "var-5"), -1));
});

test("if/else, bounded loops, stop and disabled steps", () => {
  const world = createFakeWorld();
  const actions: ScriptAction[] = [
    { as: "i", body: [setTo("s2", "var-1", math("+", varExpr("var-1"), { k: "local", name: "i" }))], from: num(1),
      id: "s1", k: "forRange", to: num(10) },
    { body: [increase("s4", "var-2")], id: "s3", k: "repeat", times: num(4) },
    { cond: { a: varExpr("var-1"), b: num(55), k: "compare", op: "==" }, else: [increase("s6", "var-3", 100)],
      id: "s5", k: "if", then: [increase("s7", "var-3", 1)] },
    { ...increase("s8", "var-3", 1000), disabled: true },
    { id: "s9", k: "stop" },
    increase("s10", "var-3", 5000)
  ];
  const engine = createEngine(emptyScript({ triggers: [trigger("trigger-1", { actions })],
    variables: [numberVariable("var-1", "sum"), numberVariable("var-2", "times"), numberVariable("var-3", "flag")] }),
  world);
  runTicks(engine, world, 1);
  assert.deepEqual([value(engine, "var-1"), value(engine, "var-2"), value(engine, "var-3")], [55, 4, 1]);
  assert.equal(engine.state.runs.length, 0);
});

test("wait resumes after exactly the script ticks and waitUntil wakes on its variable dependency", () => {
  const world = createFakeWorld();
  const script = emptyScript({
    triggers: [
      trigger("trigger-1", { actions: [waitSeconds("s1", 2), increase("s2", "var-1"),
        { cond: { a: varExpr("var-2"), b: num(3), k: "compare", op: ">=" }, id: "s3", k: "waitUntil",
          timeoutSeconds: null }, increase("s4", "var-1", 10)] }),
      huntTrigger("trigger-2", [increase("s1", "var-2")], { concurrency: "parallel" })
    ],
    variables: [numberVariable("var-1", "progress"), numberVariable("var-2", "kills")]
  });
  const engine = createEngine(script, world);
  runTicks(engine, world, 40);
  assert.equal(value(engine, "var-1"), 0);
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-1"), 1);
  assert.equal(engine.state.runs[0]?.waiting?.kind, "condition");
  for (const id of [1, 2, 3]) engine.emit(huntEmission(id));
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-1"), 11);
  assert.equal(engine.state.runs.length, 0);
});

test("non-subject actor slots filter by family, generation and the subject owner", () => {
  const world = createFakeWorld();
  const boar = { ...deer(9), family: "animal.boar", type: "animal:boar" };
  const script = emptyScript({
    triggers: [
      huntTrigger("trigger-1", [increase("s1", "var-1")], { concurrency: "parallel" }),
      trigger("trigger-2", { actions: [increase("s1", "var-2")], concurrency: "parallel", events: [huntEvent({
        slots: { victim: { kind: "variable", variable: ref("variable", "var-3") } } })] })
    ],
    variables: [numberVariable("var-1", "anyDeer"), numberVariable("var-2", "tracked"),
      variable("var-3", "actorGroup", [{ generation: 0, id: 7, space: "animal" }])]
  });
  const engine = createEngine(script, world);
  assert.equal(engine.isSubscribed("animalKilled"), true);
  assert.equal(engine.isSubscribed("bridgeCompleted"), false);
  engine.emit({ ...huntEmission(5), kind: "bridgeCompleted" });
  engine.emit(huntEmission(5));
  engine.emit(huntEmission(7));
  engine.emit({ ...huntEmission(6), actors: { killer: huntEmission(6).actors.killer, victim: boar } });
  engine.emit(huntEmission(8, 2, 1));
  engine.emit({ ...huntEmission(7), actors: { ...huntEmission(7).actors, victim: deer(7, 1) } });
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-1"), 3);
  assert.equal(value(engine, "var-2"), 1);
});

test("subject-indexed events match by actor variable, family prefix and type qualifiers with the owner", () => {
  const world = createFakeWorld();
  const killed = (victim: object, player: object = { kind: "any" }) =>
    [{ kind: "actorKilled" as const, player, slots: { victim } }] as ScriptTrigger["events"];
  const archer = (id: number, rank: number, owner: number) => ({
    family: "soldier", handle: { generation: 0, id, space: "actor" as const }, owner,
    qualifiers: { rank }, type: "soldier:archer"
  });
  const engine = createEngine(emptyScript({
    triggers: [
      trigger("trigger-1", { actions: [increase("s1", "var-1")], concurrency: "parallel",
        events: killed({ family: ref("family", "animal"), kind: "family" }) }),
      trigger("trigger-2", { actions: [increase("s1", "var-2")], concurrency: "parallel",
        events: killed({ kind: "variable", variable: ref("variable", "var-3") }) }),
      trigger("trigger-3", { actions: [increase("s1", "var-4")], concurrency: "parallel",
        events: killed({ kind: "type", type: { rank: { min: 2 }, type: ref("content", "soldier:archer") } },
          { faction: 1, kind: "slot" }) })
    ],
    variables: [numberVariable("var-1", "animals"), numberVariable("var-2", "tracked"),
      variable("var-3", "actor", [{ generation: 0, id: 7, space: "animal" }]), numberVariable("var-4", "archers")]
  }), world);
  for (const victim of [deer(5), deer(7), deer(7, 1), archer(1, 2, 1), archer(2, 1, 1), archer(3, 2, 0)]) {
    engine.emit({ actors: { victim }, kind: "actorKilled" });
  }
  runTicks(engine, world, 1);
  assert.deepEqual([value(engine, "var-1"), value(engine, "var-2"), value(engine, "var-4")], [3, 1, 1]);
});

test("registrations are indexed under their most selective actor slot, never the catch-all bucket", () => {
  const script = emptyScript({ triggers: [
    huntTrigger("trigger-1", []),
    trigger("trigger-2", { events: [{ kind: "animalKilled", player: { kind: "any" }, slots: {
      killer: { kind: "type", type: { type: ref("content", "settler:hunter") } },
      victim: { family: ref("family", "animal.deer"), kind: "family" } } }] }),
    trigger("trigger-3", { events: [{ kind: "animalKilled", player: { kind: "any" }, slots: {} }] }),
    trigger("trigger-4", { events: [{ kind: "animalKilled", player: { kind: "any" }, slots: {
      killer: { kind: "type", type: { type: ref("content", "settler:hunter") } },
      victim: { family: ref("family", "animal"), kind: "family" } } }] }),
    trigger("trigger-5", { events: [{ kind: "animalKilled", player: { kind: "any" }, slots: {
      killer: { family: ref("family", "settler"), kind: "family" },
      victim: { kind: "variable", variable: ref("variable", "var-1") } } }] })
  ] });
  const bucket = buildSubscriptionIndex(script, secondsToTicks).buckets[SCRIPT_EVENT_KIND_INDEX.animalKilled]!;
  assert.deepEqual(bucket.any.map(ref => ref.triggerIndex), [2]);
  assert.deepEqual(bucket.bySlot.get("victim")?.byFamily.get("animal.deer")?.map(ref => ref.triggerIndex), [0]);
  assert.deepEqual(bucket.bySlot.get("killer")?.byType.get("settler:hunter")?.map(ref => ref.triggerIndex), [1, 3]);
  assert.deepEqual(bucket.bySlot.get("victim")?.byInstance.get("v:var-1")?.map(ref => ref.triggerIndex), [4]);
});

test("both phrasings of a two-actor event fire once per emission", () => {
  const world = createFakeWorld();
  const slots = (killer: object, victim: object) =>
    [{ kind: "animalKilled" as const, player: { kind: "any" as const }, slots: { killer, victim } }];
  const hunterType = { kind: "type", type: { type: ref("content", "settler:hunter") } };
  const deerFamily = { family: ref("family", "animal.deer"), kind: "family" };
  const tracked = { kind: "variable", variable: ref("variable", "var-3") };
  const engine = createEngine(emptyScript({
    triggers: [
      trigger("trigger-1", { actions: [increase("s1", "var-1")], concurrency: "parallel",
        events: slots(hunterType, deerFamily) as ScriptTrigger["events"] }),
      trigger("trigger-2", { actions: [increase("s1", "var-2")], concurrency: "parallel",
        events: slots({ family: ref("family", "settler"), kind: "family" }, tracked) as ScriptTrigger["events"] })
    ],
    variables: [numberVariable("var-1", "huntsByHunters"), numberVariable("var-2", "trackedKilled"),
      variable("var-3", "actor", [{ generation: 0, id: 7, space: "animal" }])]
  }), world);
  engine.emit(huntEmission(7));
  engine.emit(huntEmission(8));
  runTicks(engine, world, 1);
  assert.deepEqual([value(engine, "var-1"), value(engine, "var-2")], [2, 1]);
});

test("the run limit counts admitted firings", () => {
  const world = createFakeWorld();
  const engine = createEngine(emptyScript({
    triggers: [huntTrigger("trigger-1", [increase("s1", "var-1")], { runLimit: 2 })],
    variables: [numberVariable("var-1", "count")]
  }), world);
  for (const id of [1, 2, 3]) engine.emit(huntEmission(id));
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-1"), 2);
  assert.equal(engine.state.firedCounts["trigger-1"], 2);
});

test("trigger and quest budgets are separate fixed step counts", () => {
  const world = createFakeWorld();
  const engine = createEngine(emptyScript({
    quests: { ...emptyScript().quests, quests: [quest("q-1", { onActivate: [increase("s1", "var-2")] })] },
    triggers: [trigger("trigger-1", { actions: [{ body: [increase("s2", "var-1")], id: "s1", k: "repeat",
      times: num(200) }] })],
    variables: [numberVariable("var-1", "work"), numberVariable("var-2", "questWork")]
  }), world);
  runTicks(engine, world, 1);
  engine.activateQuest("q-1");
  assert.equal(value(engine, "var-1"), 128);
  assert.ok(codes(engine).includes("budgetExhausted"));
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-2"), 1);
  assert.equal(value(engine, "var-1"), 200);
});

test("a trigger firing more than 20 times in one game second is disabled", () => {
  const world = createFakeWorld();
  const engine = createEngine(emptyScript({
    triggers: [huntTrigger("trigger-1", [increase("s1", "var-1")])], variables: [numberVariable("var-1", "count")]
  }), world);
  for (let id = 0; id < 25; id++) engine.emit(huntEmission(id));
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-1"), 20);
  assert.equal(engine.isTriggerEnabled("trigger-1"), false);
  assert.deepEqual(engine.state.disabledTriggers, ["trigger-1"]);
  assert.ok(codes(engine).includes("fireLimit"));
});

test("cascades deeper than 8 move to the next tick and runTrigger recursion stops at depth 8", () => {
  const world = createFakeWorld();
  const changed = { kind: "variableChanged" as const, player: { kind: "any" as const },
    slots: { variable: ref("variable", "var-1") } };
  const engine = createEngine(emptyScript({
    triggers: [
      trigger("trigger-1", { actions: [increase("s1", "var-1")] }),
      trigger("trigger-2", { actions: [increase("s1", "var-1")], concurrency: "parallel", events: [changed] })
    ],
    variables: [numberVariable("var-1", "chain")]
  }), world);
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-1"), 9);
  assert.equal(engine.state.deferred.length, 1);
  assert.ok(codes(engine).includes("cascadeDeferred"));
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-1"), 18);

  const recursive = createEngine(emptyScript({
    triggers: [trigger("trigger-1", { actions: [increase("s1", "var-1"),
      { checkConditions: false, id: "s2", k: "runTrigger", trigger: ref("trigger", "trigger-1"), wait: false }],
    concurrency: "parallel" })],
    variables: [numberVariable("var-1", "calls")]
  }), world);
  runTicks(recursive, world, 1);
  assert.equal(value(recursive, "var-1"), 9);
  assert.ok(codes(recursive).includes("chainDepth"));
});

const concurrencyEngine = (concurrency: ScriptTrigger["concurrency"], firings: number) => {
  const world = createFakeWorld();
  const engine = createEngine(emptyScript({
    triggers: [huntTrigger("trigger-1", [waitSeconds("s1", 1), increase("s2", "var-1")], { concurrency })],
    variables: [numberVariable("var-1", "done")]
  }), world);
  for (let id = 0; id < firings; id++) engine.emit(huntEmission(id));
  runTicks(engine, world, 1);
  return { engine, world };
};

test("concurrency queue runs firings one after another", () => {
  const { engine, world } = concurrencyEngine("queue", 3);
  assert.equal(engine.state.runs.length, 1);
  assert.equal(engine.state.queued.length, 2);
  runTicks(engine, world, 20);
  assert.equal(value(engine, "var-1"), 1);
  assert.equal(engine.state.queued.length, 1);
  runTicks(engine, world, 60);
  assert.equal(value(engine, "var-1"), 3);
  assert.equal(engine.state.firedCounts["trigger-1"], 3);
});

test("concurrency parallel runs up to 8 at once and queues the overflow", () => {
  const { engine, world } = concurrencyEngine("parallel", 10);
  assert.equal(engine.state.runs.length, 8);
  assert.equal(engine.state.queued.length, 2);
  assert.ok(codes(engine).includes("parallelOverflow"));
  runTicks(engine, world, 20);
  assert.equal(value(engine, "var-1"), 8);
  runTicks(engine, world, 20);
  assert.equal(value(engine, "var-1"), 10);
});

test("concurrency ignore drops firings while a run is active", () => {
  const { engine, world } = concurrencyEngine("ignore", 3);
  assert.equal(engine.state.runs.length, 1);
  assert.equal(engine.state.queued.length, 0);
  assert.equal(engine.state.firedCounts["trigger-1"], 1);
  runTicks(engine, world, 30);
  assert.equal(value(engine, "var-1"), 1);
});

test("the queue keeps at most 32 firings per trigger and drops the newest", () => {
  const world = createFakeWorld();
  const engine = createEngine(emptyScript({
    triggers: [huntTrigger("trigger-1", [waitSeconds("s1", 600)])]
  }), world);
  for (let second = 0; second < 3; second++) {
    for (let id = 0; id < 15; id++) engine.emit(huntEmission(second * 100 + id));
    runTicks(engine, world, 20);
  }
  assert.equal(engine.state.runs.length, 1);
  assert.equal(engine.state.queued.length, 32);
  assert.ok(codes(engine).includes("queueOverflow"));
});

test("long actions wait for completion or time out; onFail stop ends the run", () => {
  const world = createFakeWorld();
  world.pendingOps.add("move");
  const move = (id: string, onFail: "continue" | "stop", timeoutSeconds = 5): ScriptAction => ({
    args: { actor: { key: "triggeringActor", kind: "response" }, region: ref("region", "region-1") }, id, k: "do",
    op: "move", wait: { onFail, timeoutSeconds }
  });
  const outcomeIs = (outcome: string) => ({ a: { k: "resp", key: "outcome" }, b: str(outcome), k: "compare",
    op: "==" }) as const;
  const engine = createEngine(emptyScript({
    triggers: [
      trigger("trigger-1", { actions: [move("s1", "continue"), { cond: outcomeIs("done"), else: [], id: "s2",
        k: "if", then: [increase("s3", "var-1")] }, move("s4", "continue", 1),
      { cond: outcomeIs("timeout"), else: [], id: "s5", k: "if", then: [increase("s6", "var-1", 10)] },
      move("s7", "stop", 1), increase("s8", "var-1", 100)] })
    ],
    variables: [numberVariable("var-1", "score")]
  }), world);
  runTicks(engine, world, 1);
  assert.equal(world.actions.length, 1);
  assert.equal(world.actions[0]?.wait, true);
  engine.completeAction(1, "done");
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-1"), 1);
  runTicks(engine, world, 20);
  assert.equal(value(engine, "var-1"), 11);
  runTicks(engine, world, 20);
  assert.equal(value(engine, "var-1"), 11);
  assert.equal(engine.state.runs.length, 0);
});

test("timers count script ticks, pause and resume, and fire timerExpired", () => {
  const world = createFakeWorld();
  const timer = variable("var-2", "timer", { autoStart: true, periodic: true, seconds: 1, window: null });
  const expired = { kind: "timerExpired" as const, player: { kind: "any" as const },
    slots: { timer: ref("timer", "var-2") } };
  const engine = createEngine(emptyScript({
    triggers: [trigger("trigger-1", { actions: [increase("s1", "var-1")], events: [expired] })],
    variables: [numberVariable("var-1", "rings"), timer]
  }), world);
  runTicks(engine, world, 60);
  assert.equal(value(engine, "var-1"), 3);
  engine.state.timers["var-2"] = { endScriptTick: null, paused: 10 };
  runTicks(engine, world, 40);
  assert.equal(value(engine, "var-1"), 3);
});

test("forEach skips members whose generation changed and released handles leave every variable", () => {
  const world = createFakeWorld();
  const members = [1, 2, 3].map(id => ({ generation: 0, id, space: "animal" as const }));
  const engine = createEngine(emptyScript({
    triggers: [trigger("trigger-1", { actions: [{ as: "member", body: [increase("s2", "var-1")], id: "s1",
      k: "forEach", max: 10, over: ref("variable", "var-2") }] })],
    variables: [numberVariable("var-1", "visited"), variable("var-2", "actorGroup", members),
      variable("var-3", "actor", [members[1]])]
  }), world);
  world.generations.set("animal:2", 1);
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-1"), 2);
  engine.releaseHandle(members[1]!);
  assert.deepEqual(value(engine, "var-2"), [members[0], members[2]]);
  assert.deepEqual(value(engine, "var-3"), []);
});

test("random draws from the saved stream deterministically", () => {
  const draws = (seed: number) => {
    const world = createFakeWorld();
    const engine = createEngine(emptyScript({
      triggers: [trigger("trigger-1", { actions: [{ body: [{ args: { value: { args: { max: num(100), min: num(1) },
        fn: "random", k: "fn" }, variable: ref("variable", "var-1") }, id: "s2", k: "do", op: "arrayAppend" }],
      id: "s1", k: "repeat", times: num(5) }] })],
      variables: [variable("var-1", "number[]", [])]
    }), world, seed);
    runTicks(engine, world, 1);
    return value(engine, "var-1") as number[];
  };
  assert.deepEqual(draws(7), draws(7));
  assert.notDeepEqual(draws(7), draws(8));
  assert.ok(draws(7).every(draw => Number.isInteger(draw) && draw >= 1 && draw <= 100));
});
