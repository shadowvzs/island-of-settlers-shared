import assert from "node:assert/strict";
import { test } from "node:test";

import { checkPlacedObjects, scriptUsersOfObject } from "../src/script/placed-objects.ts";
import type { MapScript, ScriptActor } from "../src/script/types/index.ts";
import { validateMapScript } from "../src/script/validate.ts";
import { doStep, emptyScript, num, player1, quest, ref, TEST_CATALOG, trigger } from "./script-fixtures.ts";

/** TRG1 (deferred ACT1): placed fingerprints against the map, and the script users of a map object. */

const guard: ScriptActor = {
  binding: "placed", hiddenAtStart: false, id: "actor-1", lifetime: "keepIncarnation", name: "Gate guards",
  objects: [{ cell: 410, content: ref("content", "soldier:shield"), objectId: 3 },
    { cell: 411, content: ref("content", "soldier:shield"), objectId: 4 }],
  owner: player1
};

const scripted = (): MapScript => emptyScript({
  actors: [guard],
  quests: { ...emptyScript().quests, quests: [quest("q-guards", {
    objective: { actor: ref("actor", "actor-1"), kind: "actorDied", quantifier: "all" }
  })] },
  triggers: [trigger("trigger-2", { actions: [doStep("s1", "kill", {
    actor: { actor: ref("actor", "actor-1"), kind: "instance" }, count: num(1)
  })] })]
});

const MAP = new Map([[3, { cell: 410, content: "soldier:shield" }], [4, { cell: 411, content: "soldier:shield" }]]);

test("the placed actor fixture is a Ready script", () => {
  const result = validateMapScript(scripted(), { catalog: TEST_CATALOG, mapKind: "campaign" });
  assert.deepEqual(result.errors, []);
});

test("an unchanged map passes; missing, replaced and moved objects are reported", () => {
  assert.deepEqual(checkPlacedObjects(scripted(), id => MAP.get(id)), []);
  const changed = new Map(MAP);
  changed.delete(3);
  changed.set(4, { cell: 411, content: "soldier:archer" });
  const issues = checkPlacedObjects(scripted(), id => changed.get(id));
  assert.deepEqual(issues.map(issue => [issue.severity, issue.code, issue.path]), [
    ["error", "placedObjectMissing", "actors[0].objects[0]"],
    ["error", "placedObjectChanged", "actors[0].objects[1].content"]
  ]);
  const movedMap = new Map(MAP).set(4, { cell: 500, content: "soldier:shield" });
  const moved = checkPlacedObjects(scripted(), id => movedMap.get(id));
  assert.deepEqual(moved.map(issue => [issue.severity, issue.code, issue.params.found]),
    [["warning", "placedObjectMoved", 500]]);
});

test("the users of a map object are its actors and everything that references them", () => {
  assert.deepEqual(scriptUsersOfObject(scripted(), 3), ["actor:actor-1", "quest:q-guards", "trigger:trigger-2"]);
  assert.deepEqual(scriptUsersOfObject(scripted(), 99), []);
  assert.deepEqual(scriptUsersOfObject(emptyScript(), 3), []);
});
