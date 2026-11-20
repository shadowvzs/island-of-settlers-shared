import assert from "node:assert/strict";
import { test } from "node:test";

import { createEngine, createFakeWorld, increase, runTicks, value } from "./script-engine-fixtures.ts";
import { emptyScript, numberVariable, ref, region, trigger } from "./script-fixtures.ts";

/** TRG3b: a place event (`depositMined`) matches its `region` slot by its `at` point through the world port. */

const mined = (x: number) => ({ at: { x, z: 12 }, kind: "depositMined" as const, player: 0,
  values: { deposit: "deposit:ironOre" } });

test("the region filter of a place event tests the place; overlapping regions each match once", () => {
  const world = createFakeWorld();
  world.port.spotInRegion = (x, z, id) => (id === "west" ? x < 20 : x >= 10) && z === 12;
  const counter = (id: string, regionId?: string) => trigger(id, { actions: [increase("s1", `var-${id}`)],
    events: [{ kind: "depositMined", player: { kind: "any" },
      slots: regionId ? { region: ref("region", regionId) } : {} }] });
  const engine = createEngine(emptyScript({
    regions: [region("west"), region("east")],
    triggers: [counter("west", "west"), counter("east", "east"), counter("all")],
    variables: ["west", "east", "all"].map(id => numberVariable(`var-${id}`, id))
  }), world);
  for (const x of [5, 15, 25]) engine.emit(mined(x));
  engine.emit({ ...mined(15), at: undefined });
  runTicks(engine, world, 1);
  assert.deepEqual(["west", "east", "all"].map(id => value(engine, `var-${id}`)), [2, 2, 4]);
});
