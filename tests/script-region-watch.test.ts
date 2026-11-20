import assert from "node:assert/strict";
import { test } from "node:test";

import type { MapRegion } from "../src/campaign/campaign-regions.ts";
import { conditionDependencies, regionDependency } from "../src/script/engine/conditions.ts";
import { buildRegionCellLists, watchedRegions, wildlifePinnedRegionIds } from "../src/script/engine/region-watch.ts";
import type { Condition, ScriptEvent } from "../src/script/types/index.ts";
import { createEngine, createFakeWorld, deer, increase, runTicks, value } from "./script-engine-fixtures.ts";
import { emptyScript, numberVariable, quest, ref, trigger } from "./script-fixtures.ts";

/** TRG4: the region watch plan (watched regions, CSR cell lists, wildlife pins) and region dependency keys. */

const rect = (id: string, minX: number, minZ: number, maxX: number, maxZ: number): MapRegion =>
  ({ id, name: id, shape: { kind: "rect", maxX, maxZ, minX, minZ } });

const A = rect("region-a", 1, 1, 3, 3);
const B = rect("region-b", 2, 2, 5, 5);
const UNUSED = rect("region-unused", 0, 0, 1, 1);

const regionsOfCell = (lists: ReturnType<typeof buildRegionCellLists>, cell: number) =>
  [...lists.ids.subarray(lists.start[cell], lists.start[cell + 1])];

const inRegion = (regionId: string): Condition => ({
  args: { actor: { key: "triggeringActor", kind: "response" }, region: ref("region", regionId) } as never,
  k: "is", pred: "actorInRegion"
});

const enterEvent = (regionId: string, subject?: unknown): ScriptEvent => ({
  kind: "enteredRegion", player: { kind: "any" },
  slots: { region: ref("region", regionId), ...(subject ? { subject } : {}) }
} as unknown as ScriptEvent);

test("watched regions: enter/leave slots and region reads in triggers and quests, in script order", () => {
  const script = emptyScript({
    quests: { ...emptyScript().quests, quests: [quest("q1", { objective: { kind: "condition", of: inRegion(A.id) } as
      never })] },
    regions: [UNUSED, B, A],
    triggers: [trigger("t1", { events: [enterEvent(B.id)] })]
  });
  assert.deepEqual(watchedRegions(script).map(region => region.id), [B.id, A.id]);
  assert.deepEqual(watchedRegions(emptyScript({ regions: [A, B] })), []);
});

test("CSR lists hold each cell's regions in ascending order; unwatched cells are empty", () => {
  const lists = buildRegionCellLists([A, B], 8, 8);
  assert.equal(lists.start.length, 65);
  assert.deepEqual(regionsOfCell(lists, 0), []);
  assert.deepEqual(regionsOfCell(lists, 1 * 8 + 1), [0]);
  assert.deepEqual(regionsOfCell(lists, 2 * 8 + 2), [0, 1]);
  assert.deepEqual(regionsOfCell(lists, 4 * 8 + 4), [1]);
  assert.equal(lists.ids.length, 4 + 9);
});

test("wildlife pins: regions of animal enter/leave events only", () => {
  const animal = { family: ref("family", "animal.deer"), kind: "family" };
  const script = emptyScript({ regions: [A, B], triggers: [
    trigger("t1", { events: [enterEvent(A.id, animal)] }), trigger("t2", { events: [enterEvent(B.id)] })
  ] });
  assert.deepEqual(wildlifePinnedRegionIds(script, subject => subject === animal), [A.id]);
});

test("region reads depend on their region: a membership change wakes the wait before the next second", () => {
  assert.deepEqual(conditionDependencies(inRegion(A.id)), [regionDependency(A.id), "world"]);
  const world = createFakeWorld();
  let inside = false;
  world.port = { ...world.port, testPredicate: pred => pred === "actorInRegion" && inside };
  const engine = createEngine(emptyScript({
    regions: [A],
    triggers: [trigger("t1", {
      actions: [{ cond: inRegion(A.id), id: "w1", k: "waitUntil", timeoutSeconds: null }, increase("s2", "var-1")],
      events: [{ kind: "actorAppeared", player: { kind: "any" }, slots: {} }]
    })],
    variables: [numberVariable("var-1", "woke")]
  }), world);
  engine.emit({ actors: { subject: deer(4) }, kind: "actorAppeared", player: null,
    responses: { triggeringActor: deer(4).handle } });
  runTicks(engine, world, 3);
  inside = true;
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-1"), 0);
  engine.markDependency(regionDependency(A.id));
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-1"), 1);
  assert.notEqual(engine.state.scriptTick % 20, 0);
});

test("after catch-up, world-reading waits re-check on the first live tick", () => {
  const world = createFakeWorld();
  let inside = false;
  world.port = { ...world.port, testPredicate: pred => pred === "actorInRegion" && inside };
  const engine = createEngine(emptyScript({
    regions: [A],
    triggers: [trigger("t1", { actions: [{ cond: inRegion(A.id), id: "w1", k: "waitUntil", timeoutSeconds: null },
      increase("s2", "var-1")] })],
    variables: [numberVariable("var-1", "woke")]
  }), world);
  runTicks(engine, world, 3);
  engine.setMode("catchUp");
  inside = true;
  runTicks(engine, world, 40);
  engine.endCatchUp();
  assert.equal(value(engine, "var-1"), 0);
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-1"), 1);
});
