import assert from "node:assert/strict";
import { test } from "node:test";

import { EVENT_CATALOG } from "../src/script/catalog/events.ts";
import { proximityWatchEntries, watchesBridgeSteps } from "../src/script/engine/proximity-watch.ts";
import type { ScriptEvent } from "../src/script/types/index.ts";
import { emptyScript, num, ref, trigger } from "./script-fixtures.ts";

/** TRG4b: the proximity watch plan (watched "came near" forms, bridge steps) and the catalogue entries behind it. */

const HQ = { kind: "type", type: { type: ref("content", "building:headquarters") } };
const GATE = { actor: ref("actor", "actor-gate"), kind: "instance" };

const near = (kind: "cameNear" | "cameNearMoving", target: unknown, radius: unknown): ScriptEvent =>
  ({ kind, player: { kind: "any" }, slots: { radius, target } }) as unknown as ScriptEvent;

test("watched forms: one per kind, target and literal radius, in script order", () => {
  const script = emptyScript({ triggers: [
    trigger("t1", { events: [near("cameNear", HQ, num(4)), near("cameNearMoving", GATE, num(2))] }),
    trigger("t2", { events: [near("cameNear", HQ, num(4)), near("cameNear", HQ, num(6))] })
  ] });
  assert.deepEqual(proximityWatchEntries(script), [
    { kind: "cameNear", radius: 4, target: HQ }, { kind: "cameNearMoving", radius: 2, target: GATE },
    { kind: "cameNear", radius: 6, target: HQ }
  ]);
});

test("a radius that is not a positive literal, or a missing target, is not watched", () => {
  const variable = { id: "v-radius", k: "var" };
  const script = emptyScript({ triggers: [trigger("t1", { events: [
    near("cameNear", HQ, variable), near("cameNear", HQ, num(0)), near("cameNear", null, num(3)),
    near("cameNear", HQ, num(Number.NaN))
  ] })] });
  assert.deepEqual(proximityWatchEntries(script), []);
  assert.deepEqual(proximityWatchEntries(emptyScript()), []);
});

test("bridge steps are watched only when a trigger listens to them", () => {
  const stepped = { kind: "bridgeStepped", player: { kind: "any" }, slots: {} } as ScriptEvent;
  assert.equal(watchesBridgeSteps(emptyScript({ triggers: [trigger("t1", { events: [stepped] })] })), true);
  assert.equal(watchesBridgeSteps(emptyScript({ triggers: [trigger("t1")] })), false);
});

test("the catalogue runs all three: no pending lane, v1, and any bridge is a valid bridge slot", () => {
  for (const kind of ["cameNear", "cameNearMoving", "bridgeStepped"] as const) {
    assert.equal(EVENT_CATALOG[kind].pending, undefined);
    assert.equal(EVENT_CATALOG[kind].since, 1);
  }
  assert.equal(EVENT_CATALOG.bridgeStepped.slots.find(slot => slot.name === "bridge")?.optional, true);
});
