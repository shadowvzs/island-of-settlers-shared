import assert from "node:assert/strict";
import { test } from "node:test";

import { EVENT_CATALOG, type ScriptEventKind } from "../src/script/catalog/index.ts";
import { EVENT_PHRASINGS, resolveEventPhrasing } from "../src/script/catalog/phrasings.ts";
import type { ScriptEvent } from "../src/script/types/index.ts";
import { validateMapScript } from "../src/script/validate.ts";
import { createEngine, createFakeWorld, huntEmission, increase, runTicks, value } from "./script-engine-fixtures.ts";
import { emptyScript, huntCounter, numberVariable, ref, TEST_CATALOG, trigger } from "./script-fixtures.ts";

/** Inverse event phrasings (owner 2026-11-11): presentation only, one event kind and one subscription. */

const actorSlots = (kind: ScriptEventKind) => EVENT_CATALOG[kind].slots
  .filter(slot => slot.type.kind === "actor" || slot.type.kind === "actorType");
const placeholders = (template: string) =>
  [...new Set([...template.matchAll(/\{(\w+)\}/g)].map(match => match[1]))].sort();

test("every event with two actor slots has a primary and an inverse phrasing", () => {
  const twoActor = (Object.keys(EVENT_CATALOG) as ScriptEventKind[]).filter(kind => actorSlots(kind).length >= 2);
  assert.deepEqual(Object.keys(EVENT_PHRASINGS).sort(), [...twoActor].sort());
});

test("phrasings order exactly the event's slots, lead with different actors and fill the same placeholders", () => {
  for (const [kind, pair] of Object.entries(EVENT_PHRASINGS) as [ScriptEventKind, NonNullable<
    (typeof EVENT_PHRASINGS)[ScriptEventKind]>][]) {
    const slots = EVENT_CATALOG[kind].slots.map(slot => slot.name).sort();
    for (const phrasing of [pair.primary, pair.inverse]) {
      assert.deepEqual([...phrasing.order].sort(), slots, kind);
      const expected = [...slots, "player"].sort();
      assert.deepEqual(placeholders(phrasing.sentence.en), expected, `${kind} en`);
      assert.deepEqual(placeholders(phrasing.sentence.hu ?? ""), expected, `${kind} hu`);
    }
    assert.notEqual(pair.primary.order[0], pair.inverse.order[0], kind);
  }
});

test("each inverse phrasing resolves to the same event kind and the identity slot mapping", () => {
  for (const kind of Object.keys(EVENT_PHRASINGS) as ScriptEventKind[]) {
    const primary = resolveEventPhrasing(kind, "primary");
    const inverse = resolveEventPhrasing(kind, "inverse");
    assert.equal(inverse?.kind, kind);
    assert.deepEqual(inverse?.slotMapping, primary?.slotMapping);
    for (const [slot, stored] of Object.entries(inverse?.slotMapping ?? {})) assert.equal(slot, stored);
  }
  assert.equal(resolveEventPhrasing("mapStarted", "inverse"), undefined);
});

test("validation treats both phrasings identically; an inverse on a one-actor event is refused", () => {
  const withPhrasing = (phrasing: ScriptEvent["phrasing"]) => {
    const script = huntCounter();
    script.triggers[0]!.events[0]!.phrasing = phrasing;
    return validateMapScript(script, { catalog: TEST_CATALOG, mapKind: "home" });
  };
  assert.deepEqual(withPhrasing("inverse"), withPhrasing("primary"));
  assert.deepEqual(withPhrasing(undefined), withPhrasing("inverse"));
  const script = emptyScript({ triggers: [trigger("t1", { events: [{ kind: "mapStarted", phrasing: "inverse",
    player: { kind: "any" }, slots: {} }] })] });
  const result = validateMapScript(script, { catalog: TEST_CATALOG, mapKind: "home" });
  assert.deepEqual(result.errors.map(issue => issue.code), ["unknownPhrasing"]);
});

test("a subscription authored with either phrasing fires once per kill", () => {
  const hunt = (phrasing: ScriptEvent["phrasing"]): ScriptEvent => ({ kind: "animalKilled", phrasing,
    player: { faction: 0, kind: "slot" }, slots: { victim: { family: ref("family", "animal.deer"),
      kind: "family" } } });
  const world = createFakeWorld();
  const engine = createEngine(emptyScript({
    triggers: [
      trigger("trigger-1", { actions: [increase("s1", "var-1")], concurrency: "parallel", events: [hunt("primary")] }),
      trigger("trigger-2", { actions: [increase("s1", "var-2")], concurrency: "parallel", events: [hunt("inverse")] })
    ],
    variables: [numberVariable("var-1", "primaryKills"), numberVariable("var-2", "inverseKills")]
  }), world);
  for (const id of [3, 4]) engine.emit(huntEmission(id));
  runTicks(engine, world, 1);
  assert.deepEqual([value(engine, "var-1"), value(engine, "var-2")], [2, 2]);
});
