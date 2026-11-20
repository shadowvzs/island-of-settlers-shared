import assert from "node:assert/strict";
import { test } from "node:test";

import { EVENT_CATALOG } from "../src/script/catalog/index.ts";
import type { ScriptEvent } from "../src/script/types/index.ts";
import { validateMapScript } from "../src/script/validate.ts";
import { createEngine, createFakeWorld, deer, hunter, increase, runTicks, value } from "./script-engine-fixtures.ts";
import { emptyScript, numberVariable, player1, ref, TEST_CATALOG, trigger } from "./script-fixtures.ts";

/** `actorDamaged` with the optional `source` slot (owner 2026-11-11). */

const soldier = { kind: "type" as const, type: { type: ref("content", "soldier:archer") } };
const hunterType = { kind: "type" as const, owner: player1, type: { type: ref("content", "settler:hunter") } };
const damaged = (slots: ScriptEvent["slots"], phrasing?: ScriptEvent["phrasing"]): ScriptEvent =>
  ({ kind: "actorDamaged", phrasing, player: player1, slots });

const emission = (withSource: boolean) => ({
  actors: { subject: { ...hunter(2), type: "soldier:archer" }, ...(withSource ? { source: hunter(1) } : {}) },
  kind: "actorDamaged" as const,
  responses: { triggeringActor: hunter(2).handle, ...(withSource ? { killingActor: hunter(1).handle } : {}) },
  values: { percent: 40 }
});

test("actorDamaged has an optional source actor slot", () => {
  const source = EVENT_CATALOG.actorDamaged.slots.find(slot => slot.name === "source");
  assert.equal(source?.type.kind, "actor");
  assert.equal(source?.optional, true);
});

test("validation: source filters are allowed; the inverse wording needs a source filter", () => {
  const issues = (event: ScriptEvent) => validateMapScript(emptyScript({ triggers: [trigger("t1", {
    events: [event] })] }), { catalog: TEST_CATALOG, mapKind: "campaign" }).errors.map(issue => issue.code);
  assert.deepEqual(issues(damaged({ source: hunterType, subject: soldier })), []);
  assert.deepEqual(issues(damaged({ source: hunterType, subject: soldier }, "inverse")), []);
  assert.deepEqual(issues(damaged({ subject: soldier })), []);
  assert.deepEqual(issues(damaged({ subject: soldier }, "inverse")), ["phrasingSlotMissing"]);
  assert.deepEqual(issues(damaged({ source: { ...hunterType, owner: undefined }, subject: soldier })),
    ["ownerRequired"]);
});

test("a source filter matches only emissions that carry a source; either wording fires once", () => {
  const world = createFakeWorld();
  const engine = createEngine(emptyScript({
    triggers: [
      trigger("trigger-1", { actions: [increase("s1", "var-1")], concurrency: "parallel",
        events: [damaged({ subject: soldier })] }),
      trigger("trigger-2", { actions: [increase("s1", "var-2")], concurrency: "parallel",
        events: [damaged({ source: hunterType, subject: soldier })] }),
      trigger("trigger-3", { actions: [increase("s1", "var-3")], concurrency: "parallel",
        events: [damaged({ source: hunterType, subject: soldier }, "inverse")] }),
      trigger("trigger-4", { actions: [increase("s1", "var-4")], concurrency: "parallel",
        events: [damaged({ source: hunterType, subject: soldier }), damaged({ subject: soldier })] })
    ],
    variables: ["var-1", "var-2", "var-3", "var-4"].map(id => numberVariable(id, id.replace("-", "")))
  }), world);
  engine.emit(emission(true));
  engine.emit(emission(false));
  engine.emit({ ...emission(true), actors: { source: hunter(1), subject: deer(3) } });
  runTicks(engine, world, 1);
  assert.deepEqual(["var-1", "var-2", "var-3", "var-4"].map(id => value(engine, id)), [2, 1, 1, 2]);
});
