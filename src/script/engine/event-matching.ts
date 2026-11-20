import { familyMatches, splitContentId } from "../../catalog/family.ts";
import { EVENT_CATALOG } from "../catalog/events.ts";
import type { SlotDef } from "../catalog/slots.ts";
import type { ActorSelector, ActorTypeRef } from "../types/actors.ts";
import type { ScriptEmission, ScriptEventActor } from "../types/emission.ts";
import type { PlayerFilter, ScriptRef } from "../types/refs.ts";
import type { EventSlotValue, ScriptEvent } from "../types/triggers.ts";
import type { Expr } from "../types/values.ts";
import { EMPTY_FRAME, type ScriptEngineCore } from "./core.ts";
import { evaluateExpr } from "./expressions.ts";
import type { InstanceIndex } from "./instance-index.ts";
import {
  collectCandidates, instanceKeyOfActor, instanceKeyOfVariable, isSelector, qualifiersMatch, SCRIPT_EVENT_KIND_INDEX,
  type SubscriptionIndex
} from "./subscriptions.ts";
import { rawEquals } from "./values.ts";

/**
 * Matches one emission against the subscription index (design §6.2, §6.3): candidate lookup by subject, then the
 * full check of the event `player` filter, every actor slot (instance, type with qualifiers, family prefix, owner)
 * and every value slot. Returns the matching trigger indexes in trigger list order, each once.
 */

/** Player filter of an event subject's owner (null = ownerless); `response` filters never apply to emissions. */
export const playerFilterMatches = (
  core: Pick<ScriptEngineCore, "port">, filter: PlayerFilter, owner: number | null
) => {
  switch (filter.kind) {
    case "any":
    case "response": return true;
    case "neutral": return owner === null;
    case "slot": return owner === filter.faction;
    case "humans": return owner !== null && core.port.playerIsHuman(owner);
    case "computers": return owner !== null && !core.port.playerIsHuman(owner);
    case "enemiesOf":
      return owner !== null && owner !== filter.faction && !core.port.playersAllied(owner, filter.faction);
    case "alliesOf":
      if (owner === null) return false;
      if (owner === filter.faction) return filter.includeSelf;
      return core.port.playersAllied(owner, filter.faction);
  }
};

const ownerMatches = (core: ScriptEngineCore, owner: PlayerFilter | undefined, actor: ScriptEventActor) =>
  !owner || playerFilterMatches(core, owner, actor.owner);


/** A type/family selector's `region` filter: the emitted actor stands in it (TRG4, through the world port). */
const regionMatches = (core: ScriptEngineCore, region: ScriptRef<"region"> | undefined, actor: ScriptEventActor) =>
  !region || (core.port.actorInRegion?.(actor.handle, region.id) ?? true);

const actorMatches = (
  core: ScriptEngineCore, selector: ActorSelector, actor: ScriptEventActor, instances: InstanceIndex
) => {
  switch (selector.kind) {
    case "instance": return instances.keysOf(actor.handle).includes(instanceKeyOfActor(selector.actor.id));
    case "variable": return instances.keysOf(actor.handle).includes(instanceKeyOfVariable(selector.variable.id));
    case "type":
      return actor.type === selector.type.type.id && qualifiersMatch(selector.type, actor.qualifiers)
        && ownerMatches(core, selector.owner, actor) && regionMatches(core, selector.region, actor);
    case "family":
      return familyMatches(selector.family.id, actor.family) && ownerMatches(core, selector.owner, actor)
        && regionMatches(core, selector.region, actor);
    default: return true;
  }
};

/** An `actorType` slot (e.g. the planted tree type): the emitted actor's type and qualifiers, or a plain type id. */
const actorTypeMatches = (type: ActorTypeRef, slotName: string, emission: ScriptEmission) => {
  const actor = emission.actors?.[slotName];
  if (actor) return actor.type === type.type.id && qualifiersMatch(type, actor.qualifiers);
  return emission.values?.[slotName] === type.type.id;
};

/**
 * "Health below N %" slots (TRG3a): an emission carries the value after the change and `<slot>Before`; the filter
 * matches the one change that crosses from at or above N to below N, so it fires once per crossing.
 */
const THRESHOLD_SLOTS: ReadonlySet<string> = new Set(["percent"]);

const asThreshold = (value: unknown) => typeof value === "number" ? value : Number.NaN;

const crossedBelow = (threshold: number, before: number, after: number) => before >= threshold && after < threshold;

const expectedValue = (core: ScriptEngineCore, value: EventSlotValue) => {
  const expr = value as Expr;
  if (expr.k === "ref") return expr.id;
  return evaluateExpr(core, EMPTY_FRAME, expr);
};

/**
 * A `ware` value slot (EXT-EVENTS): the editor stores the catalog reference (`ware:logs`), emission sites name the
 * simulation's ware key (`logs`); both sides compare by key.
 */
const isWareSlot = (slot: SlotDef) => slot.type.kind === "value" && slot.type.type === "ware";

const wareKey = <Value>(value: Value) => typeof value === "string" ? splitContentId(value)?.key ?? value : value;

/** A place event without a region value: its `at` point lies in the filtered region (TRG3b, `depositMined`). */
const placeMatches = (core: ScriptEngineCore, slot: SlotDef, value: EventSlotValue, emission: ScriptEmission) => {
  if (slot.type.kind !== "ref" || slot.type.ref !== "region" || !emission.at) return false;
  const region = expectedValue(core, value);
  return typeof region === "string" && (core.port.spotInRegion?.(emission.at.x, emission.at.z, region) ?? false);
};

const slotMatches = (
  core: ScriptEngineCore, slot: SlotDef, value: EventSlotValue | undefined, emission: ScriptEmission,
  instances: InstanceIndex
) => {
  if (value === null || value === undefined) return true;
  if (slot.type.kind === "actor") {
    const actor = emission.actors?.[slot.name];
    return actor !== undefined && isSelector(value) && actorMatches(core, value, actor, instances);
  }
  if (slot.type.kind === "actorType") return actorTypeMatches(value as unknown as ActorTypeRef, slot.name, emission);
  if (slot.type.kind === "player") {
    const faction = emission.values?.[slot.name];
    return typeof faction !== "number" || playerFilterMatches(core, value as PlayerFilter, faction);
  }
  const actual = emission.values?.[slot.name];
  if (actual === undefined) return placeMatches(core, slot, value, emission);
  const before = emission.values?.[`${slot.name}Before`];
  if (THRESHOLD_SLOTS.has(slot.name) && typeof before === "number" && typeof actual === "number")
    return crossedBelow(asThreshold(expectedValue(core, value)), before, actual);
  if (isWareSlot(slot)) return wareKey(expectedValue(core, value)) === wareKey(actual);
  return rawEquals(expectedValue(core, value), actual);
};

const emissionOwner = (emission: ScriptEmission, subjectName: string | null) => {
  const subject = subjectName === null ? undefined : emission.actors?.[subjectName];
  if (subject) return subject.owner;
  return emission.player ?? null;
};

/** Full check of one trigger event registration against an emission. */
export const eventMatches = (
  core: ScriptEngineCore, event: ScriptEvent, emission: ScriptEmission, instances: InstanceIndex
) => {
  const definition = EVENT_CATALOG[event.kind];
  if (!playerFilterMatches(core, event.player, emissionOwner(emission, definition.subject))) return false;
  return definition.slots.every(slot => slotMatches(core, slot, event.slots[slot.name], emission, instances));
};

const uniqueSorted = (indexes: number[]) => {
  indexes.sort((a, b) => a - b);
  return indexes.filter((value, position) => position === 0 || value !== indexes[position - 1]);
};

/** Enabled trigger indexes an emission fires (before limit/condition checks), in trigger list order. */
export const matchEmission = (
  core: ScriptEngineCore, index: SubscriptionIndex, emission: ScriptEmission, instances: InstanceIndex
): number[] => {
  const bucket = index.buckets[SCRIPT_EVENT_KIND_INDEX[emission.kind]];
  if (!bucket) return [];
  const matched: number[] = [];
  for (const candidate of collectCandidates(bucket, emission, actor => instances.keysOf(actor.handle))) {
    if (!core.isTriggerEnabled(core.script.triggers[candidate.triggerIndex]!.id)) continue;
    if (eventMatches(core, candidate.event, emission, instances)) matched.push(candidate.triggerIndex);
  }
  return uniqueSorted(matched);
};
