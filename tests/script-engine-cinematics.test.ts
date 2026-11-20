import assert from "node:assert/strict";
import { test } from "node:test";

import type { CinematicStep } from "../src/campaign/cinematics/types.ts";
import type { ScriptEngine } from "../src/script/engine/engine.ts";
import type { ScriptAction } from "../src/script/types/index.ts";
import { inCinematicMode, sequence } from "./cinematic-fixtures.ts";
import {
  createEngine, createFakeWorld, type FakeWorld, increase, runTicks, value, variable
} from "./script-engine-fixtures.ts";
import { doStep, emptyScript, quest, ref, trigger } from "./script-fixtures.ts";

/** CIN4 engine side: the sequence queue, recorded world steps (order, once), skip, preemption and quest hooks. */

const spawn = (id: string, actorRef: string, grantToPlayer = true): CinematicStep => ({
  actorRef, delayMs: 0, id, kind: "spawn", object: { count: 2, grantToPlayer, kind: "unit", unitType: "shield" },
  regionId: "region-1", start: "afterPrevious"
});
const face = (id: string, actorRef: string): CinematicStep =>
  ({ actorRef, delayMs: 0, facing: Math.PI, id, kind: "face", start: "afterPrevious" });
const hour = (id: string): CinematicStep => ({ delayMs: 0, hour: 18, id, kind: "timeOfDay", start: "afterPrevious" });

const worldSteps = () => inCinematicMode([spawn("w1", "guards"), face("w2", "guards"), hour("w3")]);

const play = (id: string, wait = true): ScriptAction =>
  doStep(`play-${id}`, "playSequence", { sequence: ref("sequence", id) },
    wait ? { wait: { onFail: "continue", timeoutSeconds: 60 } } : {});

const scriptWith = (actions: ScriptAction[], sequences = [sequence("seq-a", { steps: worldSteps() })]) =>
  emptyScript({ sequences, triggers: [trigger("t1", { actions })], variables: [variable("after", "number", 0)] });

const spawningWorld = () => {
  const world = createFakeWorld();
  let next = 10;
  world.port.performAction = request => {
    world.actions.push(request);
    if (request.op !== "spawn") return { kind: "done" };
    return { kind: "done", spawned: [{ generation: 0, id: next++, space: "actor" }, { generation: 0, id: next++,
      space: "actor" }] };
  };
  return world;
};

const started = (actions: ScriptAction[], world: FakeWorld = spawningWorld()) => {
  const engine = createEngine(scriptWith(actions), world);
  runTicks(engine, world, 1);
  return { engine, world };
};

const ops = (world: FakeWorld) => world.actions.map(action => action.op);

test("playSequence starts the sequence, the waiting run resumes when it ends", () => {
  const { engine } = started([play("seq-a"), increase("i1", "after")]);
  assert.equal(engine.activeCinematic()?.sequenceId, "seq-a");
  assert.equal(engine.activeCinematic()?.hold, true);
  assert.equal(value(engine, "after"), 0);
  assert.equal(engine.endCinematic("seq-a", false), true);
  engine.drainPending();
  assert.equal(value(engine, "after"), 1);
  assert.equal(engine.activeCinematic(), null);
  assert.deepEqual(engine.state.cinematic?.seen, ["seq-a"]);
});

test("world steps apply only in step order and once; a stale sequence id is refused", () => {
  const { engine, world } = started([play("seq-a", false)]);
  assert.equal(engine.applyCinematicStep("seq-a", "w2"), false);
  assert.equal(engine.applyCinematicStep("seq-a", "mode-on"), false);
  assert.equal(engine.applyCinematicStep("other", "w1"), false);
  assert.equal(engine.applyCinematicStep("seq-a", "w1"), true);
  assert.equal(engine.applyCinematicStep("seq-a", "w1"), false);
  assert.deepEqual(ops(world), ["spawn"]);
  assert.deepEqual(engine.activeCinematic()?.actors.guards?.map(handle => handle.id), [10, 11]);
  assert.equal(engine.applyCinematicStep("seq-a", "w2"), true);
  const faced = world.actions[1]!;
  assert.deepEqual(faced.scope.resolveActors(faced.args.actor as never).map(handle => handle.id), [10, 11]);
  assert.equal(faced.overridable, false);
});

test("a script without a world environment keeps time of day as presentation; skip applies the rest in order", () => {
  const { engine, world } = started([play("seq-a", false)]);
  engine.applyCinematicStep("seq-a", "w1");
  assert.equal(engine.applyCinematicStep("seq-a", "w3"), false);
  assert.equal(engine.endCinematic("seq-a", true), true);
  assert.deepEqual(ops(world), ["spawn", "face"]);
  assert.equal(engine.endCinematic("seq-a", true), false);
});

const finalHash = (watch: boolean) => {
  const { engine } = started([play("seq-a"), increase("i1", "after")]);
  if (watch) for (const step of ["w1", "w2"]) engine.applyCinematicStep("seq-a", step);
  engine.endCinematic("seq-a", !watch);
  engine.drainPending();
  return engine.hash();
};

test("a skipped and a watched hold sequence reach the same run state", () => {
  assert.equal(finalHash(true), finalHash(false));
});

test("sequences queue FIFO; a sequence queued after the outcome preempts and drops story sequences", () => {
  const world = spawningWorld();
  let decided = false;
  world.port.mapOutcomeDecided = () => decided;
  const sequences = ["seq-a", "seq-b", "seq-win"].map(id => sequence(id, { steps: worldSteps() }));
  const script = emptyScript({ sequences, triggers: [
    trigger("t1", { actions: [play("seq-a", false), play("seq-b", false)] }),
    trigger("t2", { actions: [play("seq-win", false)], events: [{ kind: "questSucceeded", player: { kind: "any" },
      slots: {} }] })
  ] });
  const engine = createEngine(script, world);
  runTicks(engine, world, 1);
  assert.equal(engine.activeCinematic()?.sequenceId, "seq-a");
  assert.deepEqual(engine.state.cinematic?.pending.map(entry => entry.sequenceId), ["seq-b"]);
  decided = true;
  engine.emit({ kind: "questSucceeded", values: {} });
  engine.drainPending();
  assert.equal(engine.activeCinematic()?.sequenceId, "seq-win");
  assert.equal(engine.activeCinematic()?.outcome, true);
  assert.deepEqual(engine.state.cinematic?.pending, []);
  // The preempted story sequence was skipped: its world steps were applied (spawn + face).
  assert.deepEqual(ops(world), ["spawn", "face"]);
  assert.deepEqual(engine.state.cinematic?.seen, ["seq-a"]);
});

test("quest hooks: the start sequence plays on activation, onSuccess waits for the completion sequence", () => {
  const world = spawningWorld();
  const script = emptyScript({
    quests: { ...emptyScript().quests, quests: [quest("q", {
      completeSequence: ref("sequence", "seq-done"), onSuccess: [increase("s1", "after")],
      startSequence: ref("sequence", "seq-intro"), visibility: "hidden"
    })] },
    sequences: [sequence("seq-intro", { steps: [] }), sequence("seq-done", { steps: [] })],
    variables: [variable("after", "number", 0)]
  });
  const engine = createEngine(script, world);
  runTicks(engine, world, 20);
  assert.equal(engine.activeCinematic()?.sequenceId, "seq-intro");
  engine.endCinematic("seq-intro", false);
  engine.completeQuest("q");
  engine.drainPending();
  assert.equal(engine.state.quests.q?.state, "claimed");
  assert.equal(engine.activeCinematic()?.sequenceId, "seq-done");
  assert.equal(value(engine, "after"), 0);
  engine.endCinematic("seq-done", true);
  engine.drainPending();
  assert.equal(value(engine, "after"), 1);
});

test("cinematicActive is true while a sequence plays; waits on it wake when it ends", () => {
  const actions: ScriptAction[] = [play("seq-a", false),
    { cond: { k: "not", of: { args: {}, k: "is", pred: "cinematicActive" } }, id: "w", k: "waitUntil",
      timeoutSeconds: null },
    increase("i1", "after")];
  const { engine } = started(actions);
  assert.equal(value(engine, "after"), 0);
  engine.endCinematic("seq-a", true);
  engine.drainPending();
  assert.equal(value(engine, "after"), 1);
});

test("a walk waits for its arrival; the action completion marks the step arrived", () => {
  const world = spawningWorld();
  const base = world.port.performAction;
  world.port.performAction = request => request.op === "move" ? (world.actions.push(request),
  { actionId: 77, kind: "pending" }) : base(request);
  const walk: CinematicStep = { actorRef: "guards", delayMs: 0, id: "w2", kind: "walk", regionId: "region-1",
    start: "afterPrevious", timeoutMs: 4000, waitUntilArrived: true };
  const engine = createEngine(scriptWith([play("seq-r", false)], [sequence("seq-r", { pauseWorld: false,
    steps: inCinematicMode([spawn("w1", "guards"), walk]) })]), world);
  runTicks(engine, world, 1);
  engine.applyCinematicStep("seq-r", "w1");
  engine.applyCinematicStep("seq-r", "w2");
  assert.equal(world.actions[1]!.deadlineScriptTick, engine.state.scriptTick + 80);
  assert.deepEqual(engine.activeCinematic()?.arrived, []);
  engine.completeAction(77, "done");
  assert.deepEqual(engine.activeCinematic()?.arrived, ["w2"]);
  assert.deepEqual(engine.cinematicMembers().map(handle => handle.id), [10, 11]);
});

test("a saved mid-sequence state reloads to the same hash and continues identically", async () => {
  const { engine, world } = started([play("seq-a"), increase("i1", "after")]);
  engine.applyCinematicStep("seq-a", "w1");
  const { ScriptEngine: Engine } = await import("../src/script/engine/engine.ts");
  const reloaded: ScriptEngine = Engine.load(engine.saveState(), world.port);
  assert.equal(reloaded.hash(), engine.hash());
  for (const current of [engine, reloaded]) {
    current.endCinematic("seq-a", true);
    current.drainPending();
  }
  assert.equal(reloaded.hash(), engine.hash());
  assert.equal(value(reloaded, "after"), 1);
});

test("the recorded cinematic commands check their argument shapes", async () => {
  const { commandArgsProblem } = await import("../src/commands/command-args.ts");
  assert.equal(commandArgsProblem("cinematicStep", ["seq-a", "w1"]), null);
  assert.equal(commandArgsProblem("cinematicEnd", ["seq-a", true]), null);
  assert.equal(commandArgsProblem("cinematicStep", ["seq-a"]), "Invalid cinematic step");
  assert.equal(commandArgsProblem("cinematicStep", ["seq a", "w1"]), "Invalid cinematic step");
  assert.equal(commandArgsProblem("cinematicEnd", ["seq-a", "yes"]), "Invalid cinematic end");
});
