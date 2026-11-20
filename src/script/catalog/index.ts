import { ACTION_CATALOG } from "./actions.ts";
import { EVENT_CATALOG } from "./events.ts";
import type { SlotDef } from "./slots.ts";

export { ACTION_CATALOG, actionDef, isScriptActionKind, type ScriptActionKind } from "./actions.ts";
export { EVENT_CATALOG, eventDef, isScriptEventKind, type ScriptEventKind } from "./events.ts";
export { FUNCTION_CATALOG, functionDef, isScriptFunctionKind } from "./functions.ts";
export {
  EVENT_PHRASINGS, type EventPhrasing, type EventPhrasingKind, type EventPhrasingPair, eventPhrasings,
  resolveEventPhrasing
} from "./phrasings.ts";
export { isScriptPredicateKind, PREDICATE_CATALOG, type ScriptPredicateKind } from "./predicates.ts";
export type {
  ActionDef, CatalogueRelease, CinematicMode, EventDef, EventSource, FunctionDef, PredicateDef, SlotDef, SlotType,
  SlotTypeKind
} from "./slots.ts";

const slotRequirements = (slots: readonly SlotDef[]) => slots.flatMap(({ type }) =>
  (type.kind === "actor" || type.kind === "actorType") && type.requires !== null ? [type.requires] : []);

/**
 * Every name a catalog entry may list in `actor.capabilities`: the events' subject capabilities and the
 * requirements of their other actor slots. The catalog data test checks entries against it.
 */
export const ACTOR_CAPABILITY_NAMES: ReadonlySet<string> = new Set(Object.values(EVENT_CATALOG).flatMap(event => [
  ...(event.capability === null ? [] : [event.capability]), ...slotRequirements(event.slots)
]));

/** Every name a catalog entry may list in `actor.targetOf`: the requirements of the actions' actor slots. */
export const ACTOR_TARGET_NAMES: ReadonlySet<string> = new Set(Object.values(ACTION_CATALOG)
  .flatMap(action => slotRequirements(action.args)));
