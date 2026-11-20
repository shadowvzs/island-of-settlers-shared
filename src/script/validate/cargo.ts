import type { ContentEntryBase } from "../../catalog/types/entry.ts";
import { isPlainObject } from "../../validation/index.ts";
import type { ActorOwner, ScriptActor } from "../types/actors.ts";
import type { ScriptGoodsLine } from "../types/rewards.ts";
import type { ScriptAction } from "../types/triggers.ts";
import type { ShipCapacity, ValidationRun } from "./context.ts";

/**
 * Ship cargo actors (owner addition 2026-11-11): `spawnAboard` must fit the deck capacity of the ship's catalog
 * entry (passengers and ware boxes) and may only load the ship owner's units and goods (a neutral ship carries
 * anyone's). Amounts known only at run time end with the outcome `full` instead.
 */

type DoStep = Extract<ScriptAction, { k: "do" }>;

const authoredShip = (run: ValidationRun, step: DoStep): ScriptActor | undefined => {
  const ship: unknown = step.args.ship;
  if (!isPlainObject(ship) || ship.kind !== "instance" || !isPlainObject(ship.actor)) return undefined;
  return run.index.actors.get(ship.actor.id as string);
};

const shipEntry = (run: ValidationRun, actor: ScriptActor): ContentEntryBase | undefined => {
  const id = actor.binding === "spawn" ? actor.type.type.id : actor.objects[0]?.content.id;
  return id === undefined ? undefined : run.catalog.entry(id);
};

const literalNumber = (value: unknown) =>
  isPlainObject(value) && value.k === "lit" && typeof value.value === "number" ? value.value : undefined;

/** Ware boxes of a goods list: each line rounded up to whole boxes of the ware's catalog box size. */
const boxesOf = (run: ValidationRun, cargo: unknown) => {
  if (!Array.isArray(cargo)) return 0;
  return (cargo as ScriptGoodsLine[]).reduce((sum, line) => {
    const entry = run.catalog.entry(`ware:${line.ware}`) as { ware?: { boxSize?: number } } | undefined;
    return sum + Math.ceil(line.amount / (entry?.ware?.boxSize ?? 1));
  }, 0);
};

const checkCapacity = (
  run: ValidationRun, step: DoStep, capacity: ShipCapacity, ship: string, path: string
) => {
  const passengers = step.args.type ? literalNumber(step.args.count) ?? 1 : 0;
  if (capacity.passengers !== undefined && passengers > capacity.passengers)
    run.sink.add("error", "aboveShipCapacity", `${path}.args.count`,
      { capacity: capacity.passengers, count: passengers, load: "passengers", ship });
  const boxes = boxesOf(run, step.args.cargo);
  if (capacity.boxes !== undefined && boxes > capacity.boxes)
    run.sink.add("error", "aboveShipCapacity", `${path}.args.cargo`,
      { capacity: capacity.boxes, count: boxes, load: "boxes", ship });
};

const checkOwner = (run: ValidationRun, step: DoStep, shipOwner: ActorOwner, ship: string, path: string) => {
  const owner: unknown = step.args.owner;
  if (shipOwner.kind !== "slot" || !isPlainObject(owner) || owner.kind !== "slot") return;
  if (owner.faction !== shipOwner.faction) run.sink.add("error", "shipOwnerMismatch", `${path}.args.owner`, { ship });
};

export const checkShipLoad = (run: ValidationRun, step: DoStep, path: string) => {
  const actor = authoredShip(run, step);
  if (!actor) return;
  checkOwner(run, step, actor.owner, actor.id, path);
  const entry = shipEntry(run, actor);
  const capacity = entry ? run.catalog.shipCapacity(entry) : undefined;
  if (capacity) checkCapacity(run, step, capacity, actor.id, path);
};
