import assert from "node:assert/strict";
import { test } from "node:test";

import { createEngine, createFakeWorld, hunter, increase, runTicks, value } from "./script-engine-fixtures.ts";
import { emptyScript, num, numberVariable, player1, trigger } from "./script-fixtures.ts";

/** TRG3a: "health below N %" (`actorDamaged.percent`) fires once per crossing from at or above N to below N. */

const blow = (before: number, after: number) => ({
  actors: { subject: hunter(2) }, kind: "actorDamaged" as const,
  responses: { triggeringActor: hunter(2).handle }, values: { percent: after, percentBefore: before }
});

test("a percent filter matches the blow that crosses the threshold, never the ones before or after", () => {
  const world = createFakeWorld();
  const engine = createEngine(emptyScript({
    triggers: [trigger("t1", { actions: [increase("s1", "var-1")],
      events: [{ kind: "actorDamaged", player: player1, slots: { percent: num(50) } }] })],
    variables: [numberVariable("var-1", "below")]
  }), world);
  for (const [before, after] of [[100, 80], [80, 50], [50, 49.5], [49.5, 10], [10, 0]] as const)
    engine.emit(blow(before, after));
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-1"), 1);
});

test("an emission without percentBefore keeps the plain equality rule", () => {
  const world = createFakeWorld();
  const engine = createEngine(emptyScript({
    triggers: [trigger("t1", { actions: [increase("s1", "var-1")],
      events: [{ kind: "actorDamaged", player: player1, slots: { percent: num(40) } }] })],
    variables: [numberVariable("var-1", "exact")]
  }), world);
  engine.emit({ ...blow(0, 40), values: { percent: 40 } });
  engine.emit({ ...blow(0, 41), values: { percent: 41 } });
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-1"), 1);
});
