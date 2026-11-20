import assert from "node:assert/strict";
import test from "node:test";

import type { ScriptTraceEntry } from "../src/script/engine/trace.ts";
import type { MapScript } from "../src/script/types/index.ts";
import { createEngine, createFakeWorld, increase, runTicks, waitSeconds } from "./script-engine-fixtures.ts";
import { emptyScript, numberVariable, quest, ref, trigger } from "./script-fixtures.ts";

const TICKS = 200;

const tracedScript = (): MapScript => {
  const script = emptyScript();
  script.variables.push(numberVariable("var-count", "count"));
  script.quests.quests.push(quest("quest-a"));
  script.triggers.push(trigger("trg-start", {
    actions: [
      increase("step-1", "var-count"),
      { args: { quest: ref("quest", "quest-a") }, id: "step-2", k: "do", op: "activateQuest" },
      waitSeconds("step-3", 2),
      increase("step-4", "var-count", 5),
      { args: { quest: ref("quest", "quest-a") }, id: "step-5", k: "do", op: "completeQuest" }
    ]
  }));
  return script;
};

const play = (traced: boolean) => {
  const world = createFakeWorld();
  const engine = createEngine(tracedScript(), world);
  const entries: ScriptTraceEntry[] = [];
  if (traced) engine.trace = entry => entries.push(entry);
  const hashes: string[] = [];
  for (let tick = 0; tick < TICKS; tick++) {
    runTicks(engine, world, 1);
    hashes.push(engine.hash());
  }
  return { entries, hashes, state: engine.saveState() };
};

test("the test play trace lists runs, steps, quest changes and variable writes", () => {
  const { entries } = play(true);
  const runs = entries.filter(entry => entry.kind === "run");
  assert.deepEqual(runs[0], {
    event: "mapStarted", kind: "run", owner: { kind: "trigger", triggerId: "trg-start" }, runId: runs[0]!.runId
  });
  const steps = entries.filter(entry => entry.kind === "step").map(entry => entry.stepId);
  assert.deepEqual(steps, ["step-1", "step-2", "step-3", "step-4", "step-5"]);
  const order = entries.map(entry => entry.kind);
  assert.deepEqual(order.slice(0, 5), ["run", "step", "variable", "step", "quest"], "a step precedes its effects");
  const writes = entries.filter(entry => entry.kind === "variable").map(entry => entry.value.value);
  assert.deepEqual(writes, [1, 6]);
  const quests = entries.filter(entry => entry.kind === "quest").map(entry => `${entry.from}>${entry.to}`);
  assert.deepEqual(quests.slice(0, 2), ["inactive>active", "active>succeeded"]);
});

test("attaching the trace sink changes neither the run state hash of any tick nor the saved state", () => {
  const plain = play(false);
  const traced = play(true);
  assert.ok(traced.entries.length > 0);
  assert.deepEqual(traced.hashes, plain.hashes);
  assert.deepEqual(traced.state, plain.state);
});
