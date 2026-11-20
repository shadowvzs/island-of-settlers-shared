import { MAP_KINDS, QUEST_STATES, SEASONS, WEATHER_STATES } from "../constants.ts";
import { type PredicateDef, slot } from "./slots.ts";

/** Condition predicates (trigger design §4.7, §5.3); world predicates read binding state, never scan. */

const onActor = (...args: PredicateDef["args"]): PredicateDef => ({ args: [slot.actor("actor", null), ...args] });

export const PREDICATE_CATALOG = {
  actorAlive: onActor(),
  actorHidden: onActor(),
  actorInRegion: onActor(slot.ref("region", "region")),
  actorIsType: onActor(slot.actorType("type", null)),
  actorIsFamily: onActor(slot.ref("family", "family")),
  actorOwnedBy: onActor(slot.player("player")),
  actorInside: onActor(slot.actor("building", null, { kinds: ["building"] })),
  actorAboard: onActor(slot.actor("ship", null)),
  actorCarrying: onActor(slot.value("ware", "ware", true)),
  actorScripted: onActor(),
  questIs: { args: [slot.ref("quest", "quest"), slot.choice("state", QUEST_STATES)] },
  triggerEnabled: { args: [slot.ref("trigger", "trigger")] },
  playerDefeated: { args: [slot.player("player")] },
  cinematicActive: { args: [] },
  mapKindIs: { args: [slot.choice("kind", MAP_KINDS)] },
  seasonIs: { args: [slot.choice("season", SEASONS)], environment: true },
  weatherIs: { args: [slot.choice("weather", WEATHER_STATES)], environment: true }
} as const satisfies Record<string, PredicateDef>;

export type ScriptPredicateKind = keyof typeof PREDICATE_CATALOG;

export const isScriptPredicateKind = (kind: unknown): kind is ScriptPredicateKind =>
  typeof kind === "string" && Object.hasOwn(PREDICATE_CATALOG, kind);
