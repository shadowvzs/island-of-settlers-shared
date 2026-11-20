import assert from "node:assert/strict";
import { test } from "node:test";

import { ScriptEngine } from "../src/script/engine/engine.ts";
import type {
  CellContextKey, MapScript, MultiboardDefinition, MultiboardSnapshot, ScriptRunState, ScriptVariable
} from "../src/script/types/index.ts";
import { validateMapScript } from "../src/script/validate.ts";
import {
  createEngine, createFakeWorld, type FakeWorld, hunter, increase, runTicks, setTo, varExpr, variable
} from "./script-engine-fixtures.ts";
import {
  doStep, emptyScript, num, numberVariable, plantTrees, player1, ref, region, str, TEST_CATALOG, trigger, words
} from "./script-fixtures.ts";

/** TRG8: multiboard runtime (design §6.9): dirty cells, fraction cells, row sources, saved board state. */

const HUMAN = 0;
const boardRef = (id: string) => ref("multiboard", id);
const cell = (key: CellContextKey) => ({ k: "cell" as const, key });
const column = (id: string, align: "left" | "right" = "right") =>
  ({ align, header: { en: id }, id, width: "auto" as const });

const board = (id: string, fields: Partial<MultiboardDefinition>): ScriptVariable => ({
  id, initial: { type: "multiboard", value: {
    audience: player1, cells: {}, columns: [], initiallyCollapsed: false, initiallyVisible: true,
    rows: { kind: "static", rows: [{ id: "only", label: { en: "Only" } }] }, sort: null, title: { en: id },
    ...fields
  } }, name: id.replace("-", "_"), type: "multiboard"
});

/** A trigger per region name (a mined deposit there), so a test runs action lists on demand. */
const onEvent = (id: string, name: string, actions: MapScript["triggers"][number]["actions"]) =>
  trigger(id, { actions, events: [{ kind: "depositMined", player: { kind: "any" },
    slots: { region: ref("region", name) } }] });

const fire = (engine: ScriptEngine, world: FakeWorld, name: string) => {
  engine.emit({ kind: "depositMined", values: { region: name } });
  runTicks(engine, world, 1);
};

const only = (snapshots: readonly MultiboardSnapshot[]) => {
  assert.equal(snapshots.length, 1);
  return snapshots[0]!;
};

const plant = (engine: ScriptEngine, world: FakeWorld) => {
  engine.emit({ actors: { by: hunter(1) }, kind: "treePlanted" });
  runTicks(engine, world, 1);
};

test("§14.4: the grove board appears with the quest, counts planted trees and hides on success", () => {
  const world = createFakeWorld();
  const engine = createEngine(plantTrees(), world);
  runTicks(engine, world, 1);
  assert.deepEqual(engine.multiboardSnapshots(HUMAN), []);
  engine.activateQuest("grove");
  runTicks(engine, world, 1);
  for (let tree = 0; tree < 3; tree++) plant(engine, world);
  const shown = only(engine.multiboardSnapshots(HUMAN));
  assert.deepEqual(shown.title, { en: "Grove project", hu: "Liget projekt" });
  assert.deepEqual(shown.rows, [{
    cells: [{ format: "text", value: { en: "Plant trees", hu: "Ültess fákat" } },
      { current: 3, format: "fraction", target: 8 }],
    icon: "tree:broadleafTree", id: "trees"
  }]);
  assert.equal(shown.collapsed, false);
  assert.deepEqual(engine.multiboardSnapshots(1), [], "another player is not the audience");
  engine.completeQuest("grove");
  assert.equal(engine.claimQuest("grove").ok, true);
  runTicks(engine, world, 1);
  assert.deepEqual(engine.multiboardSnapshots(HUMAN), []);
});

const dirtyScript = () => emptyScript({
  triggers: [onEvent("trigger-1", "score", [increase("s1", "var-1")]),
    onEvent("trigger-2", "other", [increase("s1", "var-2")])],
  variables: [numberVariable("var-1", "score"), numberVariable("var-2", "unrelated"),
    board("var-3", {
      cells: {
        score: { expr: varExpr("var-1"), format: "number" },
        stock: { expr: { args: { ware: ref("content", "ware:logs") }, fn: "stock", k: "fn" }, format: "number" }
      },
      columns: [column("score"), column("stock")],
      rows: { kind: "static", rows: [{ id: "a", label: { en: "A" } }, { id: "b", label: { en: "B" } }] }
    }),
    board("var-4", { cells: { label: { expr: cell("rowLabel"), format: "text" } }, columns: [column("label")] })]
});

test("a variable write re-evaluates only the cells reading it; world cells wait for the second", () => {
  const world = createFakeWorld();
  let stockCalls = 0;
  let stock = 5;
  world.port.callFunction = fn => {
    if (fn === "stock") stockCalls += 1;
    return stock;
  };
  const engine = createEngine(dirtyScript(), world);
  const first = engine.multiboardSnapshots(HUMAN);
  assert.equal(stockCalls, 2, "one evaluation per row");
  assert.equal(engine.multiboardSnapshots(HUMAN), first, "nothing dirty: the same list, no evaluation");
  assert.equal(stockCalls, 2);

  fire(engine, world, "other");
  assert.equal(engine.multiboardSnapshots(HUMAN), first, "no cell reads var-2");

  fire(engine, world, "score");
  const second = engine.multiboardSnapshots(HUMAN);
  assert.equal(stockCalls, 2, "the world column is not dirty");
  assert.notEqual(second, first);
  assert.equal(second[1], first[1], "the other board keeps its identity");
  assert.equal(second[0]!.rows[0]!.cells[1], first[0]!.rows[0]!.cells[1], "the untouched cell keeps its identity");
  assert.deepEqual(second[0]!.rows.map(row => row.cells[0]), [
    { format: "number", value: 1 }, { format: "number", value: 1 }]);

  stock = 9;
  runTicks(engine, world, 20);
  const third = engine.multiboardSnapshots(HUMAN);
  assert.equal(stockCalls, 4, "the one-second cadence re-evaluates the world column once per row");
  assert.equal(third[0]!.rows[0]!.cells[0], second[0]!.rows[0]!.cells[0]);
  assert.deepEqual(third[0]!.rows[1]!.cells[1], { format: "number", value: 9 });

  runTicks(engine, world, 20);
  assert.equal(engine.multiboardSnapshots(HUMAN), third, "an equal world value changes nothing");
  assert.equal(stockCalls, 6);
});

test("a hidden board evaluates nothing until it is shown", () => {
  const world = createFakeWorld();
  let calls = 0;
  world.port.callFunction = () => (calls += 1);
  const script = dirtyScript();
  (script.variables[2]!.initial.value as MultiboardDefinition).initiallyVisible = false;
  script.triggers.push(
    onEvent("trigger-3", "show", [doStep("s1", "showMultiboard", { multiboard: boardRef("var-3") })]));
  const engine = createEngine(script, world);
  runTicks(engine, world, 40);
  assert.equal(engine.multiboardSnapshots(HUMAN).length, 1);
  assert.equal(calls, 0);
  fire(engine, world, "show");
  assert.equal(engine.multiboardSnapshots(HUMAN).length, 2);
  assert.equal(calls, 2);
});

test("a fraction cell evaluates its two expressions; either one changing updates the cell", () => {
  const world = createFakeWorld();
  const engine = createEngine(emptyScript({
    triggers: [onEvent("trigger-1", "current", [increase("s1", "var-1", 2)]),
      onEvent("trigger-2", "target", [setTo("s1", "var-2", num(12))])],
    variables: [numberVariable("var-1", "current"), variable("var-2", "number", 8),
      board("var-3", {
        cells: {
          done: { current: varExpr("var-1"), format: "fraction", target: varExpr("var-2") },
          half: { current: { a: varExpr("var-1"), b: num(2), k: "math", op: "/" }, format: "fraction",
            target: { a: varExpr("var-2"), b: num(2), k: "math", op: "/" } }
        },
        columns: [column("done"), column("half")]
      })]
  }), world);
  const fractions = () => only(engine.multiboardSnapshots(HUMAN)).rows[0]!.cells.map(entry =>
    entry.format === "fraction" ? [entry.current, entry.target] : null);
  assert.deepEqual(fractions(), [[0, 8], [0, 4]]);
  fire(engine, world, "current");
  assert.deepEqual(fractions(), [[2, 8], [1, 4]]);
  fire(engine, world, "target");
  assert.deepEqual(fractions(), [[2, 12], [1, 6]]);
});

const leaderboard = () => emptyScript({
  variables: [board("var-1", {
    cells: {
      player: { expr: cell("rowPlayer"), format: "number" },
      soldiers: { expr: { args: { owner: cell("rowPlayer") }, fn: "soldierCount", k: "fn" }, format: "number" }
    },
    columns: [column("player"), column("soldiers")],
    rows: { filter: { kind: "any" }, kind: "players" }, sort: { columnId: "soldiers", direction: "desc" }
  })]
});

test("player rows: one row per player of the filter, evaluated with its player and sorted", () => {
  const world = createFakeWorld();
  const soldiers = [4, 9, 9];
  world.port.playerFactions = () => [0, 1, 2];
  world.port.callFunction = (_fn, args, scope) => soldiers[Number(scope.evaluate(args.owner as never))] ?? 0;
  const engine = createEngine(leaderboard(), world);
  const ranking = () => only(engine.multiboardSnapshots(HUMAN)).rows.map(row =>
    [row.id, (row.cells[1] as { value: number }).value]);
  assert.deepEqual(ranking(), [["player-1", 9], ["player-2", 9], ["player-0", 4]], "ties keep the player order");
  soldiers[0] = 12;
  runTicks(engine, world, 20);
  assert.deepEqual(ranking(), [["player-0", 12], ["player-1", 9], ["player-2", 9]]);
});

test("player rows without a faction list fall back to the human slots of the filter", () => {
  const world = createFakeWorld();
  const script = leaderboard();
  (script.variables[0]!.initial.value as MultiboardDefinition).rows = { filter: { kind: "humans" }, kind: "players" };
  const engine = createEngine(script, world);
  assert.deepEqual(only(engine.multiboardSnapshots(HUMAN)).rows.map(row => row.id), ["player-0"]);
});

const arrayScript = () => emptyScript({
  triggers: [
    onEvent("trigger-1", "add", [
      doStep("s1", "arrayAppend", { value: str("Cedar"), variable: ref("variable", "var-1") }),
      doStep("s2", "arrayAppend", { value: num(7), variable: ref("variable", "var-2") })]),
    onEvent("trigger-2", "score", [doStep("s1", "increaseVariable",
      { amount: num(5), index: num(1), variable: ref("variable", "var-2") })])
  ],
  variables: [variable("var-1", "string[]", ["Oak", "Pine"]), variable("var-2", "number[]", [3, 1]),
    board("var-3", {
      cells: {
        name: { expr: cell("rowItem"), format: "text" },
        score: { expr: { index: cell("rowIndex"), k: "var", variable: ref("variable", "var-2") }, format: "number" }
      },
      columns: [column("name", "left"), column("score")],
      rows: { kind: "array", lengthOf: ref("variable", "var-1"), maxRows: 3 }
    })]
});

test("array rows: one row per element of a string[] with cells indexing a number[]", () => {
  const world = createFakeWorld();
  const engine = createEngine(arrayScript(), world);
  const table = () => only(engine.multiboardSnapshots(HUMAN)).rows.map(row =>
    row.cells.map(entry => (entry as { value: unknown }).value));
  assert.deepEqual(table(), [["Oak", 3], ["Pine", 1]]);
  const before = only(engine.multiboardSnapshots(HUMAN));

  fire(engine, world, "score");
  const scored = only(engine.multiboardSnapshots(HUMAN));
  assert.deepEqual(table(), [["Oak", 3], ["Pine", 6]]);
  assert.equal(scored.rows[0], before.rows[0], "the unchanged row keeps its identity");

  fire(engine, world, "add");
  const grown = only(engine.multiboardSnapshots(HUMAN));
  assert.deepEqual(table(), [["Oak", 3], ["Pine", 6], ["Cedar", 7]]);
  assert.equal(grown.rows[1], scored.rows[1], "existing rows survive the rebuild");

  fire(engine, world, "add");
  assert.equal(only(engine.multiboardSnapshots(HUMAN)).rows.length, 3, "maxRows bounds the board");
});

const ACTION_EVENTS = ["collapse", "expand", "title", "hide", "showAllies", "show", "missing"];

const actionScript = () => emptyScript({
  regions: ACTION_EVENTS.map((name, index) => region(name, index * 8)),
  triggers: [
    onEvent("trigger-1", "collapse", [doStep("s1", "collapseMultiboard", { multiboard: boardRef("var-1") })]),
    onEvent("trigger-2", "expand", [doStep("s1", "expandMultiboard", { multiboard: boardRef("var-1") })]),
    onEvent("trigger-3", "title", [doStep("s1", "setMultiboardTitle",
      { multiboard: boardRef("var-1"), text: words("Harvest", "Aratás") })]),
    onEvent("trigger-4", "hide", [doStep("s1", "hideMultiboard", { multiboard: boardRef("var-1") })]),
    onEvent("trigger-5", "showAllies", [doStep("s1", "showMultiboard",
      { audience: { faction: 1, kind: "slot" }, multiboard: boardRef("var-1") })]),
    onEvent("trigger-6", "show", [doStep("s1", "showMultiboard", { multiboard: boardRef("var-1") })]),
    onEvent("trigger-7", "missing", [doStep("s1", "collapseMultiboard", { multiboard: boardRef("var-9") })])
  ],
  variables: [board("var-1", { cells: { label: { expr: cell("rowLabel"), format: "text" } },
    columns: [column("label", "left")] })]
});

test("show, hide, collapse, expand and set title change the saved board state", () => {
  const world = createFakeWorld();
  const engine = createEngine(actionScript(), world);
  const first = only(engine.multiboardSnapshots(HUMAN));
  assert.deepEqual([first.collapsed, first.collapseRevision, first.title], [false, 0, { en: "var-1" }]);

  fire(engine, world, "collapse");
  fire(engine, world, "title");
  const changed = only(engine.multiboardSnapshots(HUMAN));
  assert.deepEqual([changed.collapsed, changed.collapseRevision], [true, 1]);
  assert.deepEqual(changed.title, { en: "Harvest", hu: "Aratás" });
  assert.equal(changed.rows, first.rows, "a header change keeps the rows");

  fire(engine, world, "expand");
  assert.deepEqual(engine.state.multiboards["var-1"],
    { collapsed: false, collapseRevision: 2, title: { en: "Harvest", hu: "Aratás" }, visible: true });

  fire(engine, world, "hide");
  assert.deepEqual(engine.multiboardSnapshots(HUMAN), []);
  fire(engine, world, "showAllies");
  assert.deepEqual(engine.multiboardSnapshots(HUMAN), [], "shown to player 2 only");
  assert.equal(engine.multiboardSnapshots(1).length, 1);
  fire(engine, world, "show");
  assert.equal(engine.multiboardSnapshots(HUMAN).length, 1, "a show without an audience restores the board's own");

  fire(engine, world, "missing");
  assert.ok(engine.takeLog().some(entry => entry.code === "unknownReference" && entry.detail === "multiboard var-9"));
});

test("collapse state, title and visibility survive a save and reload with the same hash", () => {
  const world = createFakeWorld();
  const engine = createEngine(actionScript(), world);
  fire(engine, world, "collapse");
  fire(engine, world, "title");
  const saved = JSON.parse(JSON.stringify(engine.saveState())) as ScriptRunState;
  const restored = ScriptEngine.load(saved, world.port);
  assert.equal(restored.hash(), engine.hash());
  assert.deepEqual(restored.multiboardSnapshots(HUMAN), engine.multiboardSnapshots(HUMAN));
  assert.equal(only(restored.multiboardSnapshots(HUMAN)).collapsed, true);

  fire(restored, world, "hide");
  const hidden = ScriptEngine.load(JSON.parse(JSON.stringify(restored.saveState())) as ScriptRunState, world.port);
  assert.deepEqual(hidden.multiboardSnapshots(HUMAN), []);
});

test("reading boards never changes the run-state hash (presentation does not feed back)", () => {
  const world = createFakeWorld();
  const engine = createEngine(arrayScript(), world);
  fire(engine, world, "add");
  const before = engine.hash();
  engine.multiboardSnapshots(HUMAN);
  assert.equal(engine.hash(), before);
});

test("a number placeholder of a text cell is evaluated for the view", () => {
  const world = createFakeWorld();
  const planted = { expr: varExpr("var-1"), format: "number" as const, kind: "expr" as const };
  const text = { en: "Planted {planted}", values: { planted } };
  const engine = createEngine(emptyScript({
    triggers: [onEvent("trigger-1", "plant", [increase("s1", "var-1")])],
    variables: [numberVariable("var-1", "planted"), board("var-2", {
      cells: { status: { expr: { k: "text", text }, format: "text" } }, columns: [column("status", "left")]
    })]
  }), world);
  fire(engine, world, "plant");
  assert.deepEqual(only(engine.multiboardSnapshots(HUMAN)).rows[0]!.cells[0], {
    format: "text", value: { en: "Planted {planted}", values: { planted: { kind: "number", value: 1 } } }
  });
});

test("the multiboard actions validate, including set title", () => {
  const result = validateMapScript(actionScript(), { catalog: TEST_CATALOG, mapKind: "home" });
  assert.deepEqual(result.errors.filter(issue => issue.code !== "unknownReference"), []);
  assert.deepEqual(result.errors.map(issue => issue.params?.id), ["var-9"]);
});

test("the Ready check refuses random inside a board cell (presentation must not advance the script stream)", () => {
  const random = { args: { max: num(6), min: num(1) }, fn: "random" as const, k: "fn" as const };
  const script = emptyScript({ variables: [board("var-1", {
    cells: { roll: { expr: random, format: "number" } }, columns: [column("roll")]
  })] });
  const result = validateMapScript(script, { catalog: TEST_CATALOG, mapKind: "home" });
  assert.ok(result.errors.some(issue => issue.code === "multiboardCellRandom"), JSON.stringify(result.errors));
  const plain = emptyScript({ variables: [board("var-1", {
    cells: { roll: { expr: num(3), format: "number" } }, columns: [column("roll")]
  })] });
  const ok = validateMapScript(plain, { catalog: TEST_CATALOG, mapKind: "home" });
  assert.ok(!ok.errors.some(issue => issue.code === "multiboardCellRandom"));
});
