import assert from "node:assert/strict";
import { test } from "node:test";

import { ScriptEngine } from "../src/script/engine/engine.ts";
import { UI_EFFECT_OUTBOX_LIMIT } from "../src/script/engine/ui-effects.ts";
import type { ScriptRunState } from "../src/script/types/index.ts";
import { secondsToTicks } from "../src/time/constants.ts";
import { createEngine, createFakeWorld, runTicks } from "./script-engine-fixtures.ts";
import { doStep, emptyScript, num, str, trigger, tutorialUi, words } from "./script-fixtures.ts";

/** TRG9: presentation effects outbox, the waiting `highlightUi` + `scriptUiAck`, reload re-derivation. */

const kinds = (engine: ScriptEngine) => engine.takeUiEffects().map(effect => effect.kind);

test("the design tutorial opens the quest window, waits on the highlight and resumes on the acknowledgement", () => {
  const world = createFakeWorld();
  const engine = createEngine(tutorialUi(), world);
  runTicks(engine, world, 1);
  const effects = engine.takeUiEffects();
  assert.deepEqual(effects.map(effect => effect.kind), ["openUi", "highlightUi"]);
  assert.deepEqual(effects[0], { kind: "openUi", target: { kind: "quests", questId: "farm.wheat" } });
  const highlight = effects[1]!.kind === "highlightUi" ? effects[1]!.highlight : null;
  assert.equal(highlight?.anchor, "bottomBar.build");
  assert.equal(highlight?.waiting, true);
  assert.match(highlight!.effectId, /^ui:1:s4:1$/);
  assert.equal(highlight?.text?.hu, "Nyisd meg az építés menüt");
  assert.equal(engine.state.runs[0]?.waiting?.kind, "uiAck");
  assert.equal(world.actions.length, 0, "UI actions never reach the world port");
  runTicks(engine, world, 20);
  assert.equal(engine.takeUiEffects().length, 0);
  assert.equal(engine.acknowledgeUi("ui:1:s4:999"), false, "a wrong id resumes nothing");
  assert.equal(engine.acknowledgeUi(highlight!.effectId), true);
  assert.equal(engine.acknowledgeUi(highlight!.effectId), false, "a second click is refused");
  runTicks(engine, world, 1);
  const next = engine.takeUiEffects();
  assert.equal(next.length, 1);
  assert.equal(next[0]!.kind === "highlightUi" && next[0]!.highlight.anchor, "build.tab.food");
  assert.equal(next[0]!.kind === "highlightUi" && next[0]!.highlight.waiting, false);
  assert.equal(engine.state.runs.length, 0);
});

test("a waiting highlight times out with outcome timeout and honours onFail stop", () => {
  const world = createFakeWorld();
  const highlight = (id: string, onFail: "continue" | "stop") => doStep(id, "highlightUi",
    { anchor: str("hud.quests"), until: str("clicked") }, { wait: { onFail, timeoutSeconds: 2 } });
  const script = emptyScript({ triggers: [
    trigger("trigger-1", { actions: [highlight("s1", "continue"), doStep("s2", "clearHighlights", {})] }),
    trigger("trigger-2", { actions: [highlight("s1", "stop"), doStep("s2", "clearHighlights", {})] })
  ] });
  const engine = createEngine(script, world);
  runTicks(engine, world, 1);
  assert.deepEqual(kinds(engine), ["highlightUi", "highlightUi"]);
  runTicks(engine, world, secondsToTicks(2));
  assert.deepEqual(kinds(engine), ["clearHighlights"], "only the continuing run reaches its next step");
  assert.equal(engine.state.runs.length, 0);
});

test("the waiting highlight survives save and reload and is re-derived from the run state", () => {
  const world = createFakeWorld();
  const engine = createEngine(tutorialUi(), world);
  runTicks(engine, world, 5);
  const before = engine.waitingUiHighlights();
  assert.equal(before.length, 1);
  const saved: ScriptRunState = JSON.parse(JSON.stringify(engine.saveState()));
  const reloaded = ScriptEngine.load(saved, world.port);
  assert.equal(reloaded.hash(), engine.hash(), "the outbox is not part of the hashed state");
  assert.deepEqual(reloaded.waitingUiHighlights(), before);
  assert.equal(reloaded.takeUiEffects().length, 0, "transient effects are not restored");
  assert.equal(reloaded.acknowledgeUi(before[0]!.effectId), true);
  runTicks(reloaded, world, 1);
  assert.equal(reloaded.waitingUiHighlights().length, 0);
});

test("presentation effects never change the hash: draining or not gives the same run state", () => {
  const run = (drain: boolean) => {
    const world = createFakeWorld();
    const engine = createEngine(emptyScript({ triggers: [trigger("trigger-1", { actions: [
      doStep("s1", "openUi", { target: { kind: "inventory" } }),
      doStep("s2", "sendMail", { body: words("Body"), title: words("Title") }),
      doStep("s3", "focusCamera", { region: { id: "region-1", k: "ref", kind: "region" } }),
      doStep("s4", "closeUi", { target: { kind: "settings" } })
    ] })] }), world);
    runTicks(engine, world, 3);
    const effects = drain ? engine.takeUiEffects() : [];
    return { effects, hash: engine.hash() };
  };
  const drained = run(true);
  assert.equal(drained.hash, run(false).hash);
  assert.deepEqual(drained.effects.map(effect => effect.kind), ["openUi", "sendMail", "focusCamera", "closeUi"]);
  const mail = drained.effects[1]!;
  assert.equal(mail.kind === "sendMail" && mail.mail.id, "mail:uid-test:trigger-1:1.s2");
});

test("catch-up drops effects, the audience filter hides other players' effects and the outbox is bounded", () => {
  const world = createFakeWorld();
  const repeat = { body: [doStep("s2", "clearHighlights", {})], id: "s1", k: "repeat" as const, times: num(100) };
  const engine = createEngine(emptyScript({ triggers: [
    trigger("trigger-1", { actions: [repeat] }),
    trigger("trigger-2", { actions: [doStep("s1", "openUi", { audience: { faction: 1, kind: "slot" },
      target: { kind: "inventory" } })] })
  ] }), world);
  runTicks(engine, world, 1);
  const effects = engine.takeUiEffects();
  assert.equal(effects.length, UI_EFFECT_OUTBOX_LIMIT);
  assert.ok(effects.every(effect => effect.kind === "clearHighlights"), "faction 1 audience is not shown");
  engine.setMode("catchUp");
  engine.drainPending();
  assert.equal(engine.takeUiEffects().length, 0);
});

test("at most uiAckWaits waiting highlights; the next one is refused without waiting", () => {
  const world = createFakeWorld();
  const triggers = [1, 2, 3, 4, 5].map(index => trigger(`trigger-${index}`, { actions: [
    doStep("s1", "highlightUi", { anchor: str(`anchor.${index}`), until: str("clicked") },
      { wait: { onFail: "continue", timeoutSeconds: 60 } })
  ] }));
  const engine = createEngine(emptyScript({ triggers }), world);
  runTicks(engine, world, 1);
  assert.equal(engine.waitingUiHighlights().length, 4);
  assert.equal(engine.takeUiEffects().length, 4);
  assert.ok(engine.takeLog().some(entry => entry.detail.includes("uiAckWaits")));
});
