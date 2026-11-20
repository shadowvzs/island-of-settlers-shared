import assert from "node:assert/strict";
import { test } from "node:test";

import type { ScriptAction } from "../src/script/types/index.ts";
import type { ActorHandleValue } from "../src/script/types/values.ts";
import { createEngine, createFakeWorld, runTicks, value, variable } from "./script-engine-fixtures.ts";
import { doStep, emptyScript, num, quest, ref, trigger } from "./script-fixtures.ts";

/** TRG5a engine side: spawned handles (`lastSpawned`, `store`), action deadlines, the actor region objective. */

const soldier = (id: number): ActorHandleValue => ({ generation: 0, id, space: "actor" });

test("a spawn's handles fill `lastSpawned` and the `store` variable; waited steps carry their deadline", () => {
  const world = createFakeWorld();
  world.port.performAction = request => {
    world.actions.push(request);
    return request.op === "spawn" ? { kind: "done", spawned: [soldier(7), soldier(3)] } : { kind: "done" };
  };
  const steps: ScriptAction[] = [
    doStep("s1", "spawn", { store: ref("variable", "squad") }),
    doStep("s2", "storeActor", { mode: { k: "lit", type: "string", value: "replace" },
      selector: { key: "lastSpawned", kind: "response" }, variable: ref("variable", "last") }),
    doStep("s3", "move", {}, { wait: { onFail: "continue", timeoutSeconds: 2 } })
  ];
  const engine = createEngine(emptyScript({ triggers: [trigger("t1", { actions: steps })],
    variables: [variable("squad", "actorGroup", []), variable("last", "actorGroup", [])] }), world);
  runTicks(engine, world, 1);
  assert.deepEqual(value(engine, "squad"), [soldier(3), soldier(7)]);
  assert.deepEqual(value(engine, "last"), [soldier(3), soldier(7)]);
  assert.equal(world.actions[0]!.deadlineScriptTick, null);
  assert.equal(world.actions[1]!.deadlineScriptTick, 1 + 40);
});

test("actorReachedRegion: met when a member stands in the region; failure waits until onActivate ran", () => {
  const world = createFakeWorld();
  let alive = false, inside = false;
  world.port.isHandleLive = () => alive;
  world.port.actorInRegion = () => inside;
  world.port.performAction = request => {
    if (request.op === "appear") alive = true;
    return { kind: "done" };
  };
  const instance = { actor: ref("actor", "actor-1"), kind: "instance" as const };
  const script = emptyScript({
    actors: [{ binding: "placed", hiddenAtStart: true, id: "actor-1", lifetime: "keepIncarnation", name: "a",
      objects: [], owner: { faction: 0, kind: "slot" } }],
    quests: { ...emptyScript().quests, quests: [quest("q", {
      failure: { k: "not", of: { args: { actor: instance }, k: "is", pred: "actorAlive" } } as never,
      objective: { actor: ref("actor", "actor-1"), kind: "actorReachedRegion", quantifier: "any",
        region: ref("region", "region-1") },
      onActivate: [doStep("a1", "appear", { actor: instance, fadeMs: num(0) })]
    })] }
  });
  const engine = createEngine(script, world);
  engine.state.actors["actor-1"] = { incarnation: 0, members: [{ handle: soldier(1), scripted: false,
    state: "alive" }] };
  engine.rebuildInstanceIndex();
  world.port.testPredicate = () => alive;
  runTicks(engine, world, 20);
  assert.equal(engine.state.quests.q?.state, "active");
  runTicks(engine, world, 20);
  assert.equal(engine.state.quests.q?.state, "active");
  inside = true;
  runTicks(engine, world, 20);
  assert.equal(engine.state.quests.q?.state, "succeeded");
});
