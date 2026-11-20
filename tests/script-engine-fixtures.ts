import { ScriptEngine } from "../src/script/engine/engine.ts";
import { createNullWorldPort, type ScriptActionRequest, type ScriptWorldPort } from "../src/script/engine/ports.ts";
import type { ScriptEventActor } from "../src/script/types/emission.ts";
import type { MapScript, ScriptAction, ScriptVariable } from "../src/script/types/index.ts";
import { num, ref } from "./script-fixtures.ts";

/** Engine test helpers: a fake world port with generation-counted handles and controllable long actions. */

export const START_UTC = Date.UTC(2026, 10, 1, 12, 0, 0);

export interface FakeWorld {
  actions: ScriptActionRequest[];
  /** Current generation per `space:id`; a handle with another generation is gone. */
  generations: Map<string, number>;
  nextActionId: number;
  now: number;
  /** Ops that answer `pending` (long actions) instead of `done`. */
  pendingOps: Set<string>;
  port: ScriptWorldPort;
  tick: number;
}

export const createFakeWorld = (): FakeWorld => {
  const world = {
    actions: [], generations: new Map(), nextActionId: 1, now: START_UTC, pendingOps: new Set(), tick: 0
  } as unknown as FakeWorld;
  world.port = {
    ...createNullWorldPort(),
    gameNow: () => world.now,
    gameTick: () => world.tick,
    isHandleLive: handle => (world.generations.get(`${handle.space}:${handle.id}`) ?? 0) === handle.generation,
    performAction: request => {
      world.actions.push(request);
      if (!world.pendingOps.has(request.op)) return { kind: "done" };
      return { actionId: world.nextActionId++, kind: "pending" };
    }
  };
  return world;
};

/** Live ticks: the game clock and the engine's end-of-tick advance together. */
export const runTicks = (engine: ScriptEngine, world: FakeWorld, ticks: number) => {
  for (let tick = 0; tick < ticks; tick++) {
    world.tick += 1;
    world.now += 50;
    engine.endTick();
  }
};

export const createEngine = (script: MapScript, world: FakeWorld, seed = 42) => {
  const engine = ScriptEngine.create(script, { port: world.port, scriptHash: "hash-test", seed });
  engine.start("mapStarted");
  return engine;
};

export const value = (engine: ScriptEngine, id: string) => engine.state.values[id]?.value;

export const variable = (id: string, type: ScriptVariable["type"], initial: unknown, extra: object = {}) =>
  ({ id, initial: { type, value: initial }, name: id.replace("-", "_"), type, ...extra }) as ScriptVariable;

export const increase = (stepId: string, variableId: string, amount = 1): ScriptAction =>
  ({
    args: { amount: num(amount), variable: ref("variable", variableId) }, id: stepId, k: "do",
    op: "increaseVariable"
  });

export const setTo = (stepId: string, variableId: string, expr: unknown): ScriptAction =>
  ({
    args: { value: expr, variable: ref("variable", variableId) }, id: stepId, k: "do", op: "setVariable"
  }) as ScriptAction;

export const waitSeconds = (stepId: string, seconds: number): ScriptAction =>
  ({ id: stepId, k: "wait", seconds: num(seconds) });

export const varExpr = (id: string) => ({ k: "var" as const, variable: ref("variable", id) });

export const deer = (id: number, generation = 0, owner: number | null = null): ScriptEventActor => ({
  family: "animal.deer", handle: { generation, id, space: "animal" }, owner, type: "animal:deer"
});

export const hunter = (id: number, owner = 0): ScriptEventActor => ({
  family: "settler", handle: { generation: 0, id, space: "actor" }, owner, type: "settler:hunter"
});

/** A custom-event emission the tests fire: an animal killed by a hunter. */
export const huntEmission = (victimId: number, killerId = 1, owner = 0) => ({
  actors: { killer: hunter(killerId, owner), victim: deer(victimId) },
  kind: "animalKilled" as const,
  responses: { killingActor: hunter(killerId, owner).handle, targetActor: deer(victimId).handle }
});
