import assert from "node:assert/strict";
import test from "node:test";

import {
  attemptEndRefusal, attemptExitOf, claimProgressOf, parseAttemptEndBody, parseAttemptStartBody, storedExitOf
} from "../src/campaign/campaign-attempts.ts";
import { exitsOf } from "../src/campaign/campaign-graph.ts";
import { readyMap } from "./campaign-fixtures.ts";

test("claim progress: only a replay attempt carries its id; without an attempt the map status counts", () => {
  assert.deepEqual(claimProgressOf(null, "available"), { attemptId: null, status: "available" });
  assert.deepEqual(claimProgressOf(null, "completed"), { attemptId: null, status: "completed" });
  assert.deepEqual(claimProgressOf({ end: null, id: "a1", startStatus: "available" }, "completed"),
    { attemptId: null, status: "available" });
  assert.deepEqual(claimProgressOf({ end: "victory", id: "a2", startStatus: "completed" }, "completed"),
    { attemptId: "a2", status: "completed" });
});

test("claim progress (C9b): a replay's third waits until its attempt ended in victory", () => {
  for (const end of [null, "defeat", "giveUp"] as const)
    assert.deepEqual(claimProgressOf({ end, id: "a3", startStatus: "completed" }, "completed"),
      { attemptId: "a3", awaitingVictory: true, status: "completed" });
});

test("attempt bodies: strict fields, safe ids and known outcomes", () => {
  assert.deepEqual(parseAttemptStartBody({ campaignId: "c-1", mapId: "map-1" }), { campaignId: "c-1", mapId: "map-1" });
  assert.equal(parseAttemptStartBody({ campaignId: "c-1", mapId: "map-1", status: "completed" }), null);
  assert.equal(parseAttemptStartBody({ campaignId: "c 1", mapId: "map-1" }), null);
  assert.equal(parseAttemptStartBody([]), null);
  assert.deepEqual(parseAttemptEndBody({ outcome: "giveUp" }), { outcome: "giveUp" });
  assert.equal(parseAttemptEndBody({ outcome: "won" }), null);
  assert.equal(parseAttemptEndBody({ outcome: "victory", tick: 5 }), null);
});

test("attempt end body (BR1): an exit is a safe id and only a victory names one", () => {
  assert.deepEqual(parseAttemptEndBody({ exit: "exit-2", outcome: "victory" }), { exit: "exit-2", outcome: "victory" });
  assert.deepEqual(parseAttemptEndBody({ exit: "victory", outcome: "victory" }),
    { exit: "victory", outcome: "victory" });
  assert.deepEqual(parseAttemptEndBody({ outcome: "victory" }), { outcome: "victory" });
  for (const outcome of ["defeat", "giveUp"]) assert.equal(parseAttemptEndBody({ exit: "exit-2", outcome }), null);
  for (const exit of ["", "exit 2", "x".repeat(65), 2, null, ["exit-2"]])
    assert.equal(parseAttemptEndBody({ exit, outcome: "victory" }), null);
});

test("stored exit (BR1): only an exit the map declares is stored, anything else counts as victory", () => {
  const declared = exitsOf(readyMap({ exits: [{ id: "exit-1", name: { en: "Spared" } }] }));
  assert.equal(storedExitOf(declared, "exit-1"), "exit-1");
  assert.equal(storedExitOf(declared, "victory"), "victory");
  assert.equal(storedExitOf(declared, undefined), "victory");
  assert.equal(storedExitOf(declared, "exit-9"), "victory");
  assert.equal(storedExitOf([], "exit-1"), "victory");
});

test("attempt end: once, a same repeat is accepted, another outcome is refused", () => {
  assert.equal(attemptEndRefusal(null, "victory"), "Unknown campaign attempt");
  assert.equal(attemptEndRefusal({ end: null }, "victory"), null);
  assert.equal(attemptEndRefusal({ end: "victory" }, "victory"), null);
  assert.match(attemptEndRefusal({ end: "defeat" }, "victory") ?? "", /already ended/);
});

test("attempt end (BR1): a repeat with the stored exit is accepted, another exit is refused", () => {
  const won = { end: "victory" as const, endExit: "exit-1" };
  assert.equal(attemptEndRefusal(won, "victory", "exit-1"), null);
  assert.match(attemptEndRefusal(won, "victory", "exit-2") ?? "", /already ended/);
  assert.match(attemptEndRefusal(won, "victory") ?? "", /already ended/);
  // A win stored before migration 0040 has no exit and reads as the implicit one.
  assert.equal(attemptEndRefusal({ end: "victory", endExit: null }, "victory"), null);
  assert.match(attemptEndRefusal({ end: "victory" }, "victory", "exit-1") ?? "", /already ended/);
  assert.equal(attemptEndRefusal({ end: null }, "victory", "exit-1"), null);
  assert.equal(attemptExitOf(won), "exit-1");
  assert.equal(attemptExitOf({ end: "victory" }), "victory");
  assert.equal(attemptExitOf({ end: "defeat", endExit: null }), null);
  assert.equal(attemptExitOf({ end: null }), null);
});
