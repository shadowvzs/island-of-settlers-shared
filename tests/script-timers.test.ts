import assert from "node:assert/strict";
import { test } from "node:test";

import { ScriptEngine } from "../src/script/engine/engine.ts";
import type { ScriptEventActor } from "../src/script/types/emission.ts";
import type {
  MapScript, MultiboardSnapshot, ScriptAction, ScriptRunState, ScriptVariable, TimerDefinition
} from "../src/script/types/index.ts";
import { validateMapScript } from "../src/script/validate.ts";
import {
  createEngine, createFakeWorld, type FakeWorld, increase, runTicks, value, variable
} from "./script-engine-fixtures.ts";
import {
  doStep, emptyScript, HOLD_SECONDS, holdRegion, num, numberVariable, player1, ref, region, TEST_CATALOG, trigger
} from "./script-fixtures.ts";

/** EXT-TIMER: named timers on the script clock, their countdown cells and timer windows (design §4.11, §7.1). */

const HUMAN = 0;
const TIMER = "var-timer";
const BOARD = "var-board";
const timerRef = ref("timer", TIMER);
const remainingExpr = { args: { timer: timerRef }, fn: "timerRemaining" as const, k: "fn" as const };

const timer = (fields: Partial<TimerDefinition> = {}): ScriptVariable =>
  variable(TIMER, "timer", { autoStart: false, periodic: false, seconds: 10, window: null, ...fields });

/** A trigger per region name (a mined deposit there), so a test runs action lists on demand. */
const onEvent = (id: string, name: string, actions: ScriptAction[]) =>
  trigger(id, { actions, events: [{ kind: "depositMined", player: { kind: "any" },
    slots: { region: ref("region", name) } }] });

const fire = (engine: ScriptEngine, world: FakeWorld, name: string) => {
  engine.emit({ kind: "depositMined", values: { region: name } });
  runTicks(engine, world, 1);
};

const TIMER_COMMANDS = ["start", "pause", "resume", "stop"] as const;
const opOf = (command: string) => `timer${command[0]!.toUpperCase()}${command.slice(1)}`;

/** A timer driven by the four actions; every expiry adds one to `var-1`. */
const controlledScript = (fields: Partial<TimerDefinition> = {}, extra: Partial<MapScript> = {}): MapScript =>
  emptyScript({
    regions: TIMER_COMMANDS.map(command => region(command)),
    ...extra,
    triggers: [
      ...TIMER_COMMANDS.map((command, index) =>
        onEvent(`trigger-${index + 1}`, command, [doStep("s1", opOf(command), { timer: timerRef })])),
      trigger("trigger-9", { actions: [increase("s1", "var-1")],
        events: [{ kind: "timerExpired", player: { kind: "any" }, slots: { timer: timerRef } }] }),
      ...(extra.triggers ?? [])
    ],
    variables: [numberVariable("var-1", "expired"), timer(fields), ...(extra.variables ?? [])]
  });

const countdownBoard = (): ScriptVariable => variable(BOARD, "multiboard", {
  audience: player1, cells: { left: { expr: remainingExpr, format: "countdown" } },
  columns: [{ align: "right", header: { en: "Time left" }, id: "left", width: "auto" }],
  initiallyCollapsed: false, initiallyVisible: true,
  rows: { kind: "static", rows: [{ id: "only", label: { en: "Only" } }] }, sort: null, title: { en: "Hold" }
});

const remaining = (engine: ScriptEngine) => engine.state.timers[TIMER];
const onlyCell = (boards: readonly MultiboardSnapshot[]) => {
  assert.equal(boards.length, 1);
  return boards[0]!.rows[0]!.cells[0]!;
};

test("a started timer counts script ticks and fires timerExpired once at its end", () => {
  const world = createFakeWorld();
  const engine = createEngine(controlledScript(), world);
  runTicks(engine, world, 50);
  assert.deepEqual(remaining(engine), { endScriptTick: null, paused: null });
  fire(engine, world, "start");
  assert.deepEqual(remaining(engine), { endScriptTick: 251, paused: null });
  runTicks(engine, world, 199);
  assert.equal(value(engine, "var-1"), 0);
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-1"), 1);
  assert.deepEqual(remaining(engine), { endScriptTick: null, paused: null });
  runTicks(engine, world, 400);
  assert.equal(value(engine, "var-1"), 1);
});

test("pause keeps the remaining time, resume continues it and stop cancels without an expiry", () => {
  const world = createFakeWorld();
  const engine = createEngine(controlledScript(), world);
  fire(engine, world, "start");
  runTicks(engine, world, 59);
  fire(engine, world, "pause");
  assert.deepEqual(remaining(engine), { endScriptTick: null, paused: 140 });
  runTicks(engine, world, 500);
  assert.equal(value(engine, "var-1"), 0);
  fire(engine, world, "pause");
  assert.deepEqual(remaining(engine), { endScriptTick: null, paused: 140 });
  fire(engine, world, "resume");
  runTicks(engine, world, 139);
  assert.equal(value(engine, "var-1"), 0);
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-1"), 1);
  fire(engine, world, "start");
  fire(engine, world, "stop");
  fire(engine, world, "resume");
  assert.deepEqual(remaining(engine), { endScriptTick: null, paused: null });
  runTicks(engine, world, 400);
  assert.equal(value(engine, "var-1"), 1);
});

test("timerStart takes its own duration, restarts a running timer and timerRemaining reads all states", () => {
  const world = createFakeWorld();
  const script = controlledScript({}, {
    regions: [...TIMER_COMMANDS, "long", "read"].map(name => region(name)),
    triggers: [
      onEvent("trigger-20", "long", [doStep("s1", "timerStart", { seconds: num(30), timer: timerRef })]),
      onEvent("trigger-21", "read", [doStep("s1", "setVariable", { value: remainingExpr,
        variable: ref("variable", "var-2") })])
    ],
    variables: [numberVariable("var-2", "left")]
  });
  const engine = createEngine(script, world);
  const read = () => {
    fire(engine, world, "read");
    return value(engine, "var-2");
  };
  assert.equal(read(), 0);
  fire(engine, world, "start");
  assert.equal(read(), 9.95);
  fire(engine, world, "long");
  assert.equal(read(), 29.95);
  fire(engine, world, "pause");
  runTicks(engine, world, 100);
  assert.equal(read(), 29.9);
  fire(engine, world, "stop");
  assert.equal(read(), 0);
});

test("a periodic auto-start timer rings on its grid from map start", () => {
  const world = createFakeWorld();
  const engine = createEngine(controlledScript({ autoStart: true, periodic: true, seconds: 2 }), world);
  runTicks(engine, world, 130);
  assert.equal(value(engine, "var-1"), 3);
  assert.deepEqual(remaining(engine), { endScriptTick: 160, paused: null });
});

test("catch-up freezes a running timer: no tick passes, nothing expires, the hash is unchanged", () => {
  const world = createFakeWorld();
  const engine = createEngine(controlledScript({}, { variables: [countdownBoard()] }), world);
  fire(engine, world, "start");
  runTicks(engine, world, 99);
  const before = engine.hash();
  const shown = onlyCell(engine.multiboardSnapshots(HUMAN));
  engine.setMode("catchUp");
  runTicks(engine, world, 20 * 3600);
  assert.equal(engine.hash(), before);
  assert.equal(value(engine, "var-1"), 0);
  assert.equal(onlyCell(engine.multiboardSnapshots(HUMAN)), shown);
  engine.endCatchUp();
  runTicks(engine, world, 100);
  assert.equal(value(engine, "var-1"), 0);
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-1"), 1);
});

test("save and reload in the middle of a timer keeps the hash and expires on the same tick", () => {
  const script = controlledScript({ window: { title: { en: "Hold" } } }, { variables: [countdownBoard()] });
  const world = createFakeWorld();
  const engine = createEngine(script, world);
  fire(engine, world, "start");
  runTicks(engine, world, 73);
  const saved = JSON.parse(JSON.stringify(engine.saveState())) as ScriptRunState;
  const reloadedWorld = { ...createFakeWorld(), now: world.now, tick: world.tick };
  const reloaded = ScriptEngine.load(saved, reloadedWorld.port);
  assert.equal(reloaded.hash(), engine.hash());
  assert.deepEqual(reloaded.multiboardSnapshots(HUMAN), engine.multiboardSnapshots(HUMAN));
  for (const ticks of [125, 1, 30]) {
    runTicks(engine, world, ticks);
    runTicks(reloaded, reloadedWorld, ticks);
    assert.equal(reloaded.hash(), engine.hash());
    assert.equal(value(reloaded, "var-1"), value(engine, "var-1"));
  }
  assert.equal(value(reloaded, "var-1"), 1);
  fire(engine, world, "start");
  fire(engine, world, "pause");
  const paused = ScriptEngine.load(engine.saveState(), createFakeWorld().port);
  assert.equal(paused.hash(), engine.hash());
  assert.deepEqual(paused.state.timers[TIMER], { endScriptTick: null, paused: 199 });
});

test("a countdown cell refreshes once a second and on the tick of a timer action or expiry", () => {
  const world = createFakeWorld();
  const engine = createEngine(controlledScript({ seconds: 3 }, { variables: [countdownBoard()] }), world);
  const cell = () => onlyCell(engine.multiboardSnapshots(HUMAN));
  runTicks(engine, world, 6);
  assert.deepEqual(cell(), { format: "countdown", value: 0 });
  fire(engine, world, "start");
  assert.deepEqual(cell(), { format: "countdown", value: 3 });
  const started = cell();
  runTicks(engine, world, 12);
  assert.equal(cell(), started);
  const before = engine.hash();
  runTicks(engine, world, 1);
  assert.deepEqual(cell(), { format: "countdown", value: 2.35 });
  assert.notEqual(engine.hash(), before);
  const hashAfterTick = engine.hash();
  cell();
  assert.equal(engine.hash(), hashAfterTick);
  fire(engine, world, "pause");
  assert.deepEqual(cell(), { format: "countdown", value: 2.3 });
  runTicks(engine, world, 60);
  assert.deepEqual(cell(), { format: "countdown", value: 2.3 });
  fire(engine, world, "resume");
  runTicks(engine, world, 38);
  assert.deepEqual(cell(), { format: "countdown", value: 0.4 });
  const lastSecond = cell();
  runTicks(engine, world, 7);
  assert.equal(cell(), lastSecond);
  runTicks(engine, world, 1);
  assert.deepEqual(cell(), { format: "countdown", value: 0 });
  assert.equal(value(engine, "var-1"), 1);
});

test("a timer window shows the remaining time while the timer runs or is paused", () => {
  const world = createFakeWorld();
  const title = { en: "Hold the pass", hu: "Tartsd a szorost" };
  const engine = createEngine(controlledScript({ seconds: 2, window: { title } }), world);
  runTicks(engine, world, 1);
  assert.deepEqual(engine.multiboardSnapshots(HUMAN), []);
  fire(engine, world, "start");
  const [window] = engine.multiboardSnapshots(HUMAN);
  assert.deepEqual(window, {
    collapsed: false, collapseRevision: 0,
    columns: [{ align: "center", header: { en: "" }, id: "remaining", width: "auto" }], id: TIMER,
    rows: [{ cells: [{ format: "countdown", value: 2 }], icon: null, id: "remaining" }], title
  });
  assert.equal(engine.multiboardSnapshots(1)[0], window);
  runTicks(engine, world, 17);
  assert.equal(engine.multiboardSnapshots(HUMAN)[0], window);
  runTicks(engine, world, 1);
  assert.deepEqual(onlyCell(engine.multiboardSnapshots(HUMAN)), { format: "countdown", value: 1.1 });
  fire(engine, world, "pause");
  assert.deepEqual(onlyCell(engine.multiboardSnapshots(HUMAN)), { format: "countdown", value: 1.05 });
  fire(engine, world, "resume");
  runTicks(engine, world, 20);
  assert.equal(engine.multiboardSnapshots(HUMAN).length, 1);
  runTicks(engine, world, 1);
  assert.deepEqual(engine.multiboardSnapshots(HUMAN), []);
  assert.equal(value(engine, "var-1"), 1);
  fire(engine, world, "start");
  fire(engine, world, "stop");
  assert.deepEqual(engine.multiboardSnapshots(HUMAN), []);
});

test("waitUntil on timerRemaining resumes on the tick the timer expires", () => {
  const world = createFakeWorld();
  const script = controlledScript({ seconds: 1.5 }, {
    regions: [...TIMER_COMMANDS, "watch"].map(name => region(name)),
    triggers: [onEvent("trigger-20", "watch", [
      { cond: { a: remainingExpr, b: num(0), k: "compare", op: "==" }, id: "s1", k: "waitUntil",
        timeoutSeconds: null },
      doStep("s2", "setVariable", { value: { args: {}, fn: "elapsedSeconds", k: "fn" },
        variable: ref("variable", "var-2") })
    ])],
    variables: [numberVariable("var-2", "resumedAt")]
  });
  const engine = createEngine(script, world);
  runTicks(engine, world, 3);
  fire(engine, world, "start");
  fire(engine, world, "watch");
  runTicks(engine, world, 40);
  assert.equal(value(engine, "var-2"), 1.7);
});

const soldier = (id: number): ScriptEventActor =>
  ({ family: "soldier", handle: { generation: 0, id, space: "actor" }, owner: HUMAN, type: "soldier:shield" });

test("hold-region example: the countdown runs while soldiers hold the pass and completes the quest", () => {
  const world = createFakeWorld();
  let inPass = 0;
  world.port = { ...world.port, callFunction: fn => (fn === "countInRegion" ? inPass : null) };
  const engine = createEngine(holdRegion(), world);
  const move = (kind: "enteredRegion" | "leftRegion", count: number) => {
    inPass = count;
    engine.emit({ actors: { subject: soldier(1) }, kind, values: { region: "region-pass" } });
    runTicks(engine, world, 1);
  };
  engine.activateQuest("hold");
  runTicks(engine, world, 1);
  assert.deepEqual(onlyCell(engine.multiboardSnapshots(HUMAN)), { format: "text", value: { en: "Hold the pass",
    hu: "Tartsd a szorost" } });
  move("enteredRegion", 1);
  assert.equal(engine.multiboardSnapshots(HUMAN)[0]!.rows[0]!.cells[1]!.format, "countdown");
  assert.deepEqual(engine.state.timers["var-hold"], { endScriptTick: 2 + HOLD_SECONDS * 20, paused: null });
  runTicks(engine, world, 1198);
  move("leftRegion", 0);
  assert.deepEqual(engine.state.timers["var-hold"], { endScriptTick: null, paused: HOLD_SECONDS * 20 - 1199 });
  runTicks(engine, world, 6000);
  assert.equal(engine.state.quests.hold?.state, "active");
  move("enteredRegion", 1);
  assert.deepEqual(engine.multiboardSnapshots(HUMAN)[0]!.rows[0]!.cells[1], { format: "countdown", value: 240.05 });
  runTicks(engine, world, HOLD_SECONDS * 20 - 1199);
  assert.equal(engine.state.quests.hold?.state, "succeeded");
});

test("validation: a timer nothing starts is warned and a countdown cell must be a number", () => {
  const validate = (script: MapScript) => validateMapScript(script, { catalog: TEST_CATALOG, mapKind: "campaign" });
  const idle = validate(emptyScript({
    triggers: [trigger("trigger-1", { actions: [doStep("s1", "timerPause", { timer: timerRef })] })],
    variables: [timer()]
  }));
  assert.deepEqual(idle.warnings.map(issue => [issue.code, issue.path, issue.params.name]),
    [["timerNeverStarted", "variables[0]", "var_timer"]]);
  for (const script of [controlledScript(), emptyScript({ variables: [timer({ autoStart: true,
    window: { title: { en: "Hold", hu: "Tartás" } } })] })])
    assert.equal(validate(script).warnings.some(issue => issue.code === "timerNeverStarted"), false);
  const board = countdownBoard();
  (board.initial.value as { cells: object }).cells = { left: { expr: { k: "cell", key: "rowLabel" },
    format: "countdown" } };
  const wrong = validate(emptyScript({ variables: [board] }));
  assert.deepEqual(wrong.errors.map(issue => [issue.code, issue.path]),
    [["slotTypeMismatch", "variables[0].initial.value.cells.left"]]);
  assert.deepEqual(validate(controlledScript({}, { variables: [countdownBoard()] })).errors, []);
});
