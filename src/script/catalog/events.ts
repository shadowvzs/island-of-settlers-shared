import {
  ACTION_OUTCOMES, ACTOR_GONE_REASONS, DESTRUCTION_CAUSES, PASSENGER_KINDS, TRADE_DELIVERY_KINDS
} from "../constants.ts";
import type { EventResponseKey } from "../types/values.ts";
import { type EventDef, type EventSource, slot, type SlotDef } from "./slots.ts";

/**
 * Event catalogue (trigger design §5.1, keys §5.4). Each entry declares its typed slots, the responses copied into
 * a run, its source and, for actor events, the subject slot and the capability the subject's catalog entries
 * declare in `actor.capabilities`. Every actor event also has the event `player` filter (§4.2).
 */

interface EventOptions {
  capability?: string | null;
  environment?: boolean;
  pending?: string;
  responses?: readonly EventResponseKey[];
  since?: 1 | 2;
  subject?: string | null;
}

const event = (source: EventSource, slots: readonly SlotDef[], options: EventOptions = {}): EventDef => ({
  capability: options.capability ?? null,
  environment: options.environment,
  pending: options.pending,
  responses: options.responses ?? [],
  since: options.since ?? 1,
  slots,
  source,
  subject: options.subject ?? null
});

/** An actor event: `subject` names the subject slot, whose entries must declare `capability`. */
const actorEvent = (
  source: EventSource, capability: string | null, subject: string, slots: readonly SlotDef[],
  responses: readonly EventResponseKey[], options: EventOptions = {}
) => event(source, slots, { ...options, capability, responses, subject });

const questEvent = () => event("eng", [slot.ref("quest", "quest", true)], { responses: ["quest"] });
const sequenceEvent = () => event("eng", [slot.ref("sequence", "sequence")]);
const subject = (name = "subject", optional = false) => slot.actor(name, null, {}, optional);
const ware = (optional = true) => slot.value("ware", "ware", optional);
/** A struck deal: `ware` is what the player gets (bought) or gives (sold), `payment` the ware on the other side. */
const tradeDeal = (source: EventSource) => event(source, [ware(), slot.value("payment", "ware", true)],
  { responses: ["ware", "amount", "triggeringPlayer"] });

export const EVENT_CATALOG = {
  // Engine, time, variables, quests (§5.1.1)
  mapStarted: event("eng", []),
  elapsedTime: event("eng", [slot.value("seconds", "number")]),
  periodic: event("eng", [slot.value("seconds", "number"), slot.value("offset", "number", true)]),
  clockHour: event("eng", [slot.value("hour", "number")], { environment: true }),
  calendarMoment: event("eng", [
    slot.value("month", "number", true), slot.value("day", "number", true), slot.value("weekday", "number", true),
    slot.value("minuteUtc", "number")
  ], { since: 2 }),
  scriptUpdated: event("eng", [], { responses: ["oldValue"] }),
  timerExpired: event("eng", [slot.ref("timer", "timer")], { responses: ["timer"] }),
  variableChanged: event("eng", [slot.ref("variable", "variable"), slot.variableValue("equals", "variable",
    "withIndex", true)],
    { responses: ["variable", "oldValue", "newValue"] }),
  questActivated: questEvent(),
  questSucceeded: questEvent(),
  questFailed: questEvent(),
  questClaimed: questEvent(),
  questExpired: questEvent(),
  sequenceStarted: sequenceEvent(),
  sequenceFinished: sequenceEvent(),
  sequenceSkipped: sequenceEvent(),
  actionOutcome: event("eng", [
    slot.ref("trigger", "trigger"), slot.ref("step", "step"), slot.choice("outcome", ACTION_OUTCOMES, true)
  ], { responses: ["outcome", "triggeringActor"], since: 2 }),
  playerDefeated: event("eng", [slot.player("player", true)], { responses: ["triggeringPlayer"] }),
  victoryReached: event("eng", [slot.player("player", true)], { responses: ["triggeringPlayer"] }),

  // Units: settlers, soldiers, commander (§5.1.2)
  actorAppeared: actorEvent("eng", null, "subject", [subject()], ["triggeringActor", "region"]),
  actorGone: actorEvent("eng", null, "subject", [subject(), slot.choice("reason", ACTOR_GONE_REASONS, true)],
    ["triggeringActor", "outcome"]),
  actorKilled: actorEvent("sim", "killed", "victim", [subject("victim"), slot.actor("killer", null, {}, true)],
    ["triggeringActor", "killingActor"]),
  /**
   * `source` (owner 2026-11-11): the attacker or damager, absent for environmental damage; a filter on it never
   * matches an emission without one. The simulation emits it when known (combat, catapult; TRG3a).
   */
  actorDamaged: actorEvent("sim", "damaged", "subject", [
    subject(), slot.actor("source", null, {}, true), slot.value("percent", "number", true)
  ], ["triggeringActor", "killingActor", "amount"]),
  enteredRegion: actorEvent("eng", "enteredRegion", "subject", [subject(), slot.ref("region", "region")],
    ["enteringActor", "region"]),
  leftRegion: actorEvent("eng", "enteredRegion", "subject", [subject(), slot.ref("region", "region")],
    ["enteringActor", "region"]),
  cameNear: actorEvent("eng", "enteredRegion", "subject", [
    subject(), slot.actor("target", null), slot.value("radius", "number")
  ], ["enteringActor", "targetActor"]),
  cameNearMoving: actorEvent("eng", "enteredRegion", "subject", [
    subject(), slot.actor("target", null, { instanceOnly: true }), slot.value("radius", "number")
  ], ["enteringActor", "targetActor"]),
  soldierRecruited: actorEvent("sim", "recruited", "soldier", [
    subject("soldier", true), slot.actor("building", null, { kinds: ["building"] }, true)
  ], ["triggeringActor", "building"]),
  soldierPromoted: actorEvent("sim", "promoted", "soldier", [
    subject("soldier", true), slot.value("rank", "number", true)
  ], ["triggeringActor", "amount"]),
  settlerBorn: actorEvent("sim", "born", "settler", [subject("settler", true)], ["triggeringActor", "building"]),
  jobAssigned: actorEvent("sim", "born", "settler", [subject("settler", true)], ["triggeringActor", "building"]),
  toolReceived: actorEvent("sim", "toolReceived", "settler", [subject("settler", true), ware()],
    ["triggeringActor", "ware"]),
  enteredBuilding: actorEvent("sim", "enterBuilding", "subject", [
    subject(), slot.actor("building", null, { kinds: ["building"] }, true)
  ], ["triggeringActor", "containerActor"]),
  leftBuilding: actorEvent("sim", "enterBuilding", "subject", [
    subject(), slot.actor("building", null, { kinds: ["building"] }, true)
  ], ["triggeringActor", "containerActor"]),
  garrisoned: actorEvent("sim", "garrison", "subject", [
    subject(), slot.actor("building", null, { kinds: ["building"] }, true)
  ], ["triggeringActor", "containerActor"]),
  leftGarrison: actorEvent("sim", "garrison", "subject", [
    subject(), slot.actor("building", null, { kinds: ["building"] }, true)
  ], ["triggeringActor", "containerActor"]),
  boardedShip: actorEvent("sim", "board", "subject", [subject(), slot.actor("ship", "board", {}, true)],
    ["triggeringActor", "containerActor"]),
  disembarked: actorEvent("sim", "board", "subject", [subject(), slot.actor("ship", "board", {}, true)],
    ["triggeringActor", "containerActor"]),
  warePickedUp: actorEvent("sim", "carry", "subject", [subject("subject", true), ware()],
    ["triggeringActor", "ware", "amount", "targetActor"], { pending: "GROUND-PILE" }),
  warePutDown: actorEvent("sim", "carry", "subject", [subject("subject", true), ware()],
    ["triggeringActor", "ware", "amount", "targetActor"], { pending: "GROUND-PILE" }),
  wareDelivered: actorEvent("sim", "carry", "subject", [
    subject("subject", true), slot.actor("building", null, { kinds: ["building"] }, true), ware()
  ], ["building", "ware", "amount", "triggeringActor"]),
  actorClicked: actorEvent("cmd", "clicked", "subject", [subject()], ["triggeringActor"]),
  scoutLooked: actorEvent("eng", "spyglass", "subject", [subject()], ["triggeringActor"]),
  commanderIncapacitated: actorEvent("sim", "incapacitated", "subject", [subject()], ["triggeringActor"],
    { since: 2 }),
  commanderRecovered: actorEvent("sim", "incapacitated", "subject", [subject()], ["triggeringActor"], { since: 2 }),
  seenByPlayer: actorEvent("pres", "seen", "subject", [subject()], ["triggeringActor"],
    { pending: "PRES0", since: 2 }),

  // Buildings, construction, bridges (§5.1.3)
  constructionPlaced: actorEvent("sim", "construct", "building", [subject("building", true)],
    ["building", "triggeringPlayer"]),
  constructionCompleted: actorEvent("sim", "construct", "building", [subject("building", true)], ["building"]),
  buildingUpgraded: actorEvent("sim", "upgrade", "building", [
    subject("building", true), slot.value("level", "number", true)
  ], ["building", "amount"]),
  buildingDestroyed: actorEvent("sim", "destroyed", "building", [
    subject("building", true), slot.choice("cause", DESTRUCTION_CAUSES, true)
  ], ["building", "killingActor"]),
  wareProduced: actorEvent("sim", "produce", "building", [subject("building", true), ware()],
    ["building", "ware", "amount"]),
  outputPickedUp: actorEvent("sim", "produce", "building", [subject("building", true), ware()],
    ["building", "ware", "triggeringActor"], { pending: "TRG3d" }),
  buildingOccupied: actorEvent("sim", "occupied", "building", [
    subject("building", true), slot.actorType("job", null, ["settler"], true)
  ], ["building", "triggeringActor"]),
  catapultFired: actorEvent("sim", "catapult", "tower", [subject("tower"), slot.actor("target", null, {}, true)],
    ["building", "targetActor"]),
  catapultHit: actorEvent("sim", "catapult", "tower", [subject("tower"), slot.actor("target", null, {}, true)],
    ["building", "targetActor", "amount"]),
  catapultMissed: actorEvent("sim", "catapult", "tower", [subject("tower"), slot.actor("target", null, {}, true)],
    ["building", "targetActor", "amount"]),
  bridgeCompleted: actorEvent("sim", "bridge", "bridge", [subject("bridge", true)], ["building"]),
  /**
   * `bridge` is optional (TRG4b): bridges have no catalog entry yet, so an emission names no bridge actor and only
   * the "any bridge" form fires; a region condition on `triggeringActor` picks one bridge until they have one.
   */
  bridgeStepped: actorEvent("eng", "enteredRegion", "subject", [
    subject("subject", true), slot.actor("bridge", "bridge", {}, true)
  ], ["triggeringActor", "targetActor"]),
  stockReached: event("eng", [
    slot.value("ware", "ware"), slot.value("amount", "number"), slot.actorType("building", null, ["building"], true)
  ], { responses: ["ware", "amount"] }),

  // Ships and boats (§5.1.4)
  shipDeparted: actorEvent("sim", "sail", "ship", [subject("ship")], ["triggeringActor"], { pending: "TRG3c" }),
  shipStopped: actorEvent("sim", "sail", "ship", [subject("ship")], ["triggeringActor"], { since: 2 }),
  shipReachedRegion: actorEvent("eng", "sail", "ship", [subject("ship"), slot.ref("region", "region")],
    ["region", "triggeringActor"], { pending: "TRG3c" }),
  shipDocked: actorEvent("sim", "sail", "ship", [subject("ship"), slot.actor("harbour", null, {}, true)],
    ["containerActor", "triggeringActor"], { pending: "TRG3c" }),
  actorUnloaded: actorEvent("sim", "cargo", "ship", [
    subject("ship"), slot.actorType("type", null, PASSENGER_KINDS, true), slot.ref("region", "region", true)
  ], ["triggeringActor", "containerActor", "region"], { pending: "TRG3c" }),
  wareLoaded: actorEvent("sim", "cargo", "ship", [subject("ship"), ware()], ["ware", "amount"], { pending: "TRG3c" }),
  wareUnloaded: actorEvent("sim", "cargo", "ship", [subject("ship"), ware()], ["ware", "amount"],
    { pending: "TRG3c" }),
  shipLeftMap: actorEvent("sim", "sail", "ship", [subject("ship")], ["triggeringActor"], { pending: "TRG3c" }),
  shipSunk: actorEvent("sim", "sink", "ship", [subject("ship")], ["triggeringActor"], { pending: "TRG3c" }),

  // Nature, props, wares (§5.1.5)
  treeCut: actorEvent("sim", "fell", "by", [
    slot.actor("tree", "cut", { kinds: ["tree", "plant"] }, true), subject("by", true)
  ], ["targetActor", "triggeringActor"]),
  treeGrowthStage: actorEvent("sim", "growthStage", "tree", [subject("tree"), slot.value("stage", "number")],
    ["targetActor", "stage"]),
  treePlanted: actorEvent("sim", "plant", "by", [
    slot.actorType("tree", "planted", ["tree"], true), subject("by", true)
  ], ["targetActor", "triggeringActor"]),
  stonePickedUp: actorEvent("sim", "carry", "by", [
    slot.actor("prop", "pickedUp", { kinds: ["stone", "deposit"] }, true), subject("by", true)
  ], ["targetActor", "triggeringActor", "ware"]),
  depositMined: event("sim", [
    slot.actorType("deposit", "mined", ["deposit"], true), slot.ref("region", "region", true)
  ], { responses: ["ware", "amount"] }),
  shellPickedUp: event("cmd", [slot.actor("shell", "collected", { kinds: ["shell"] }, true)],
    { responses: ["targetActor", "triggeringPlayer"] }),
  animalKilled: actorEvent("sim", "hunt", "killer", [
    slot.actor("victim", "hunted", { kinds: ["animal", "critter"], tag: "huntable" }, true), subject("killer", true)
  ], ["targetActor", "killingActor"]),
  animalCollected: event("sim", [slot.actor("animal", "hunted", { kinds: ["animal", "critter"] }, true)],
    { responses: ["ware", "amount"], since: 2 }),
  animalGrewUp: event("sim", [slot.actor("animal", null, { kinds: ["animal", "critter"] }, true)],
    { pending: "HUNT2", responses: ["targetActor"], since: 2 }),
  presentationSpawned: actorEvent("eng", "spawned", "subject", [subject()], ["triggeringActor"],
    { pending: "PRES0", since: 2 }),
  presentationClipDone: actorEvent("eng", "clipDone", "subject", [subject()], ["triggeringActor"],
    { pending: "PRES0", since: 2 }),
  presentationDespawned: actorEvent("eng", "despawned", "subject", [subject()], ["triggeringActor"],
    { pending: "PRES0", since: 2 }),

  // Trade office of the home island (§5.1.7, EXT-EVENTS): the event `player` filter tests the island's owner
  wareBought: tradeDeal("cmd"),
  wareSold: tradeDeal("sim"),
  tradeDeliveryArrived: actorEvent("sim", null, "harbour", [
    slot.actor("harbour", null, { kinds: ["building"] }, true), ware(), slot.choice("trade", TRADE_DELIVERY_KINDS, true)
  ], ["building", "ware", "amount"]),

  // Colony and adventure (§5.1.6, §8)
  colonyConquered: event("sim", []),
  colonyDefeated: event("sim", []),
  colonyAbandoned: event("arch", []),

  /**
   * Computer factions (enemy economy AI plan §5.2, EAI4c); the event `player` filter picks the faction. A building
   * of a computer faction is placed (`factionBuildingStarted`) or finished (`factionBuildingCompleted`); a force of
   * the faction sets out to attack (`factionAttackLaunched`: once per force; `targetActor` is the building it goes
   * for, when it names one).
   */
  factionBuildingStarted: actorEvent("sim", "construct", "building", [subject("building", true)],
    ["building", "triggeringPlayer"]),
  factionBuildingCompleted: actorEvent("sim", "construct", "building", [subject("building", true)],
    ["building", "triggeringPlayer"]),
  factionAttackLaunched: event("sim", [], { responses: ["triggeringPlayer", "targetActor"] })
} as const satisfies Record<string, EventDef>;

export type ScriptEventKind = keyof typeof EVENT_CATALOG;

export const isScriptEventKind = (kind: unknown): kind is ScriptEventKind =>
  typeof kind === "string" && Object.hasOwn(EVENT_CATALOG, kind);

export const eventDef = (kind: ScriptEventKind): EventDef => EVENT_CATALOG[kind];
