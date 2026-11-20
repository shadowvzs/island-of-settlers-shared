import { eventDef, isScriptEventKind } from "../catalog/events.ts";
import { eventPhrasings } from "../catalog/phrasings.ts";
import { isScriptRef } from "../references.ts";
import { isEventAllowed } from "../scopes.ts";
import type { ScriptEvent, ScriptTrigger } from "../types/triggers.ts";
import type { EventResponseKey } from "../types/values.ts";
import { checkActionList } from "./actions.ts";
import { checkCondition } from "./conditions.ts";
import type { ValidationRun } from "./context.ts";
import { createScope, type ExprScope } from "./scope.ts";
import { checkSlots } from "./slots.ts";

/** Triggers (trigger design §4.6, §4.9): typed event registrations, conditions and the action list. */

/** The responses one event provides; null when the event kind is unknown. */
const checkEvent = (run: ValidationRun, event: ScriptEvent, path: string): ReadonlySet<EventResponseKey> | null => {
  if (!isScriptEventKind(event.kind)) {
    run.sink.add("error", "unknownEvent", `${path}.kind`, { kind: String(event.kind) });
    return null;
  }
  const def = eventDef(event.kind);
  const inverse = eventPhrasings(event.kind)?.inverse;
  if (event.phrasing === "inverse" && !inverse)
    run.sink.add("error", "unknownPhrasing", `${path}.phrasing`, { kind: event.kind });
  const required = event.phrasing === "inverse" ? inverse?.requires : undefined;
  if (required && (event.slots[required] === undefined || event.slots[required] === null))
    run.sink.add("error", "phrasingSlotMissing", `${path}.phrasing`, { kind: event.kind, slot: required });
  const { mapKind } = run.context;
  if (!isEventAllowed(mapKind, event.kind)) run.sink.add("error", "notOnMapKind", `${path}.kind`, { kind: event.kind,
    mapKind });
  if (def.pending || def.since > 1)
    run.sink.add("warning", "notYetAvailable", `${path}.kind`, { kind: event.kind, lane: def.pending ?? "v2" });
  if (def.environment) run.environment.reads = true;
  if (event.player.kind === "response") run.sink.add("error", "unknownResponse", `${path}.player`,
    { key: "triggeringPlayer" });
  checkSlots(run, def.slots, event.slots, createScope(), `${path}.slots`, { mode: "event", subject: def.subject,
    subjectCapability: def.capability });
  return new Set([...def.responses, ...(def.subject === null ? [] : ["triggeringPlayer" as const])]);
};

const intersect = (sets: readonly ReadonlySet<EventResponseKey>[]) => {
  const [first, ...rest] = sets;
  if (!first) return new Set<EventResponseKey>();
  return new Set([...first].filter(key => rest.every(set => set.has(key))));
};

/** The variable every event of the trigger watches (types `oldValue`/`newValue`), if they all watch one. */
const changedVariable = (events: readonly ScriptEvent[]) => {
  const watched = events.map(event => event.kind === "variableChanged" && isScriptRef(event.slots.variable)
    ? event.slots.variable.id : null);
  const [first] = watched;
  return first && watched.every(id => id === first) ? first : undefined;
};

const triggerScope = (run: ValidationRun, trigger: ScriptTrigger, path: string): ExprScope => {
  const responses = trigger.events.map((event, index) => checkEvent(run, event, `${path}.events[${index}]`));
  const known = responses.filter((set): set is ReadonlySet<EventResponseKey> => set !== null);
  return { ...createScope(intersect(known)), changedVariable: changedVariable(trigger.events) };
};

export const checkTrigger = (run: ValidationRun, trigger: ScriptTrigger, path: string) => {
  if (trigger.folderId !== null && !run.index.folders.has(trigger.folderId))
    run.sink.add("error", "unknownReference", `${path}.folderId`, { id: trigger.folderId, kind: "folder" });
  const scope = triggerScope(run, trigger, path);
  checkCondition(run, trigger.conditions, scope, `${path}.conditions`);
  checkActionList(run, trigger.actions, scope, `${path}.actions`, { stepIds: new Set() });
};
