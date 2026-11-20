import assert from "node:assert/strict";
import { test } from "node:test";

import { EVENT_CATALOG } from "../src/script/catalog/index.ts";
import { isEventAllowed } from "../src/script/scopes.ts";
import type { ScriptEmission } from "../src/script/types/emission.ts";
import type { MapScript, ScriptEvent } from "../src/script/types/index.ts";
import { validateMapScript } from "../src/script/validate.ts";
import { createEngine, createFakeWorld, increase, runTicks, value, varExpr } from "./script-engine-fixtures.ts";
import {
  doStep, emptyScript, num, numberVariable, player1, ref, str, TEST_CATALOG, trigger
} from "./script-fixtures.ts";

/**
 * EXT-EVENTS: trade events (`wareBought`, `wareSold`, `tradeDeliveryArrived`) and ware filters. The editor stores a
 * ware slot as a catalog reference (`ware:logs`), emission sites name the simulation's ware key (`logs`).
 */

const TRADE_KINDS = ["wareBought", "wareSold", "tradeDeliveryArrived"] as const;
const logs = ref("content", "ware:logs");

const on = (kind: ScriptEvent["kind"], slots: object = {}, player: ScriptEvent["player"] = { kind: "any" }) =>
  ({ kind, player, slots }) as ScriptEvent;

const counting = (events: Record<string, ScriptEvent>): MapScript => emptyScript({
  triggers: Object.entries(events).map(([id, event]) => trigger(id, { actions: [increase("s1", `var-${id}`)],
    events: [event] })),
  variables: Object.keys(events).map(id => numberVariable(`var-${id}`, id))
});

const deal = (kind: "wareBought" | "wareSold", ware: string, payment: string, amount: number): ScriptEmission => ({
  kind, player: 0, responses: { amount: { type: "number", value: amount }, ware: { type: "string", value: ware } },
  values: { payment, ware }
});

const harbour = { family: "building.harbour", handle: { generation: 0, id: 7, space: "building" as const }, owner: 0,
  type: "building:harbour" };

test("the trade events carry ware and amount; only the delivery has a (harbour) subject", () => {
  for (const kind of TRADE_KINDS) {
    const definition = EVENT_CATALOG[kind];
    assert.ok(definition.responses.includes("ware") && definition.responses.includes("amount"), kind);
    assert.equal(definition.since, 1);
    assert.equal(definition.pending, undefined);
  }
  assert.equal(EVENT_CATALOG.wareBought.source, "cmd");
  assert.equal(EVENT_CATALOG.wareSold.subject, null);
  assert.equal(EVENT_CATALOG.tradeDeliveryArrived.subject, "harbour");
});

test("trade events are offered on home and campaign maps only", () => {
  for (const kind of TRADE_KINDS) {
    assert.equal(isEventAllowed("home", kind), true);
    assert.equal(isEventAllowed("campaign", kind), true);
    assert.equal(isEventAllowed("colony", kind), false);
    assert.equal(isEventAllowed("adventure", kind), false);
  }
  const script = counting({ bought: on("wareBought", { ware: logs }) });
  assert.deepEqual(validateMapScript(script, { catalog: TEST_CATALOG, mapKind: "home" }).errors, []);
  assert.deepEqual(validateMapScript(script, { catalog: TEST_CATALOG, mapKind: "colony" }).errors
    .map(issue => issue.code), ["notOnMapKind"]);
});

test("a ware reference filter matches the simulation's ware key; other wares and players do not", () => {
  const world = createFakeWorld();
  const engine = createEngine(counting({
    any: on("wareBought"),
    logs: on("wareBought", { ware: logs }),
    logsForFish: on("wareBought", { payment: ref("content", "ware:fish"), ware: logs }),
    other: on("wareBought", { ware: logs }, { faction: 1, kind: "slot" }),
    produced: on("wareProduced", { ware: logs }),
    sold: on("wareSold", { ware: logs }, player1)
  }), world);
  engine.emit(deal("wareBought", "logs", "fish", 10));
  engine.emit(deal("wareBought", "logs", "stone", 4));
  engine.emit(deal("wareBought", "planks", "fish", 2));
  engine.emit(deal("wareSold", "logs", "fish", 3));
  engine.emit({ actors: { building: harbour }, kind: "wareProduced", values: { ware: "logs" } });
  engine.emit({ actors: { building: harbour }, kind: "wareProduced", values: { ware: "planks" } });
  runTicks(engine, world, 1);
  assert.deepEqual(["any", "logs", "logsForFish", "other", "produced", "sold"].map(id => value(engine, `var-${id}`)),
    [3, 2, 1, 0, 1, 1]);
});

test("a delivery filters by harbour, ware and trade kind; its amount adds up to \"bought X\"", () => {
  const world = createFakeWorld();
  const script = counting({
    purchases: on("tradeDeliveryArrived", { trade: str("purchase") }),
    sales: on("tradeDeliveryArrived", { trade: str("sale"), ware: logs })
  });
  script.variables.push(numberVariable("var-total", "total"), numberVariable("var-reached", "reached"));
  script.triggers.push(
    trigger("sum", { actions: [doStep("s1", "increaseVariable", { amount: { k: "resp", key: "amount" },
      variable: ref("variable", "var-total") })],
    events: [on("tradeDeliveryArrived", { harbour: { family: ref("family", "building"), kind: "family" } },
      player1)] }),
    trigger("reached", {
      actions: [increase("s1", "var-reached")],
      conditions: { a: varExpr("var-total"), b: num(12), k: "compare", op: ">=" } as never,
      events: [on("variableChanged", { variable: ref("variable", "var-total") })], runLimit: 1
    }));
  assert.deepEqual(validateMapScript(script, { catalog: TEST_CATALOG, mapKind: "home" }).errors, []);
  const engine = createEngine(script, world);
  const arrive = (ware: string, amount: number, trade: string): ScriptEmission => ({
    actors: { harbour }, kind: "tradeDeliveryArrived",
    responses: { amount: { type: "number", value: amount }, building: harbour.handle,
      ware: { type: "string", value: ware } }, values: { trade, ware }
  });
  for (const emission of [arrive("logs", 10, "purchase"), arrive("logs", 5, "sale"), arrive("fish", 2, "sale")]) {
    engine.emit(emission);
    runTicks(engine, world, 1);
  }
  runTicks(engine, world, 2);
  assert.deepEqual(["purchases", "sales", "total", "reached"].map(id => value(engine, `var-${id}`)), [1, 1, 17, 1]);
});
