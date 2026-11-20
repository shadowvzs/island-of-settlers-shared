import type { ContentEntryBase, Qualifiers } from "../../catalog/types/entry.ts";
import type { ContentKind } from "../../catalog/types/refs.ts";
import { qualifierIssues } from "../../catalog/validate/refs.ts";
import type { SlotType } from "../catalog/slots.ts";
import { ALWAYS_AVAILABLE_RESPONSES } from "../constants.ts";
import { isScriptRef } from "../references.ts";
import type { ActorQuery, ActorSelector, ActorTypeRef, ScriptActor } from "../types/actors.ts";
import type { EventResponseKey } from "../types/values.ts";
import type { ValidationRun } from "./context.ts";
import { createScope, type ExprScope, type SlotMode } from "./scope.ts";

/**
 * Catalog checks of actor types and selectors (trigger design §3.2, rev B3): kinds, qualifiers on declared axes,
 * capabilities (`actor.capabilities` for events, `actor.targetOf` for actions), tags and the owner rules (rev m13).
 */

export type ActorSlotType = Extract<SlotType, { kind: "actor" | "actorType" }>;
export type SelectorRole = "subject" | "other";

const qualifierList = (ref: ActorTypeRef): Qualifiers[] => [
  ...[ref.rank?.min, ref.rank?.max].flatMap(rank => (rank === undefined ? [] : [{ rank }])),
  ...[ref.level?.min, ref.level?.max].flatMap(level => (level === undefined ? [] : [{ level }])),
  ...(ref.nation === undefined ? [] : [{ nation: ref.nation }]),
  ...(ref.variant ? [{ [ref.variant.axis]: ref.variant.value }] : [])
];

const checkKinds = (
  run: ValidationRun, entry: ContentEntryBase, kinds: readonly ContentKind[] | undefined, path: string
) => {
  if (!kinds || kinds.includes(entry.kind)) return true;
  run.sink.add("error", "contentKindNotAllowed", path, { id: entry.id, kinds: kinds.join(", ") });
  return false;
};

/** The entry of an actor type with its kind and qualifiers checked; undefined when unknown (reported earlier). */
export const checkActorTypeRef = (
  run: ValidationRun, ref: ActorTypeRef, kinds: readonly ContentKind[] | undefined, path: string
) => {
  const entry = run.catalog.entry(ref.type.id);
  if (!entry || !checkKinds(run, entry, kinds, `${path}.type`)) return undefined;
  for (const qualifiers of qualifierList(ref))
    for (const issue of qualifierIssues(entry.variants, qualifiers)) {
      const [axis, value] = Object.entries(qualifiers)[0]!;
      if (issue.code === "qualifier") run.sink.add("error", "qualifierNotDeclared", path,
        { axis, id: entry.id, value: String(value) });
    }
  return entry;
};

const actorEntries = (run: ValidationRun, actor: ScriptActor) => {
  const ids = actor.binding === "spawn" ? [actor.type.type.id] : actor.objects.map(object => object.content.id);
  return [...new Set(ids)].flatMap(id => run.catalog.entry(id) ?? []);
};

const declares = (entry: ContentEntryBase, requirement: string | null, mode: SlotMode) => {
  if (!entry.actor) return false;
  if (requirement === null || mode === "query") return true;
  const names = mode === "event" ? entry.actor.capabilities : entry.actor.targetOf ?? [];
  return names.includes(requirement);
};

interface MatchedEntries {
  entries: readonly ContentEntryBase[];
  /** A family needs one capable entry; a type or an instance needs every entry capable. */
  family: boolean;
  label: string;
}

const checkCapability = (
  run: ValidationRun, matched: MatchedEntries, slot: ActorSlotType, mode: SlotMode, path: string
) => {
  const { entries, family, label } = matched;
  if (entries.length === 0) return;
  const capable = (entry: ContentEntryBase) => declares(entry, slot.requires, mode);
  const passes = family ? entries.some(capable) : entries.every(capable);
  const capability = slot.requires ?? "actor";
  if (!passes) run.sink.add("error", "capabilityMissing", path, { capability, selector: label });
  if (slot.kind !== "actor" || !slot.tag) return;
  const { tag } = slot;
  const hasTag = (entry: ContentEntryBase) => entry.tags.includes(tag);
  const tagged = family ? entries.some(hasTag) : entries.every(hasTag);
  if (!tagged) run.sink.add("error", "tagMissing", path, { selector: label, tag });
};

const familyEntries = (run: ValidationRun, family: string, slot: ActorSlotType, path: string) => {
  const all = run.catalog.family(family);
  const entries = slot.kinds ? all.filter(entry => slot.kinds!.includes(entry.kind)) : all;
  if (all.length > 0 && entries.length === 0)
    run.sink.add("error", "contentKindNotAllowed", path, { id: family, kinds: slot.kinds!.join(", ") });
  return entries;
};

const checkOwnerRule = (run: ValidationRun, selector: ActorSelector, role: SelectorRole, path: string) => {
  if (selector.kind !== "type" && selector.kind !== "family") return;
  if (role === "subject" && selector.owner) run.sink.add("error", "ownerFilterConflict", `${path}.owner`);
  if (role === "other" && !selector.owner) run.sink.add("error", "ownerRequired", path);
};

const isAvailable = (scope: ExprScope, key: EventResponseKey) =>
  scope.responses.has(key) || ALWAYS_AVAILABLE_RESPONSES.includes(key);

/** Entries of a run-time selector (variable, response, local) are unknown until the run; only its form is checked. */
const checkRuntimeSelector = (run: ValidationRun, selector: ActorSelector, scope: ExprScope, path: string) => {
  if (selector.kind === "response" && !isAvailable(scope, selector.key))
    run.sink.add("error", "unknownResponse", `${path}.key`, { key: selector.key });
  if (selector.kind === "local" && scope.locals.get(selector.name) !== "actor")
    run.sink.add("error", "unknownLocal", `${path}.name`, { name: selector.name });
  if (selector.kind !== "variable") return;
  const variable = run.index.variables.get(selector.variable.id);
  if (variable && variable.type !== "actor" && variable.type !== "actorGroup")
    run.sink.add("error", "refTypeMismatch", `${path}.variable`, { actual: variable.type, expected: "actor",
      id: variable.id });
};

const QUERY_SOURCES = new Set(["type", "family", "variable", "instance"]);

/** A query's pool: a type, family or actor variable (never another query); the nearest anchor must resolve. */
const queryEntries = (
  run: ValidationRun, query: ActorQuery, slot: ActorSlotType, path: string
): MatchedEntries | null => {
  const { from, pick } = query;
  if (!QUERY_SOURCES.has(from.kind))
    run.sink.add("error", "slotTypeMismatch", `${path}.query.from`, { actual: from.kind,
      expected: "type|family|variable" });
  if (pick.kind === "nearest" && !isScriptRef(pick.to))
    checkSelector(run, pick.to, { kind: "actor", requires: null }, createScope(), `${path}.query.pick.to`, "other",
      "query");
  if (from.kind === "query") return null;
  const matched = matchedEntries(run, from, slot, `${path}.query.from`);
  if (!matched) checkRuntimeSelector(run, from, createScope(), `${path}.query.from`);
  checkOwnerRule(run, from, "other", `${path}.query.from`);
  return matched;
};

const matchedEntries = (
  run: ValidationRun, selector: ActorSelector, slot: ActorSlotType, path: string
): MatchedEntries | null => {
  if (selector.kind === "type") {
    const entry = checkActorTypeRef(run, selector.type, slot.kinds, `${path}.type`);
    return { entries: entry ? [entry] : [], family: false, label: selector.type.type.id };
  }
  if (selector.kind === "family") {
    const entries = familyEntries(run, selector.family.id, slot, `${path}.family`);
    return { entries, family: true, label: selector.family.id };
  }
  if (selector.kind === "query") return queryEntries(run, selector.query, slot, path);
  if (selector.kind !== "instance") return null;
  const actor = run.index.actors.get(selector.actor.id);
  const entries = actor ? actorEntries(run, actor) : [];
  for (const entry of entries) checkKinds(run, entry, slot.kinds, `${path}.actor`);
  return { entries, family: false, label: selector.actor.id };
};

/** One actor slot value: form, owner rule, instance-only slots, run-time availability and catalog capabilities. */
export const checkSelector = (
  run: ValidationRun, selector: ActorSelector, slot: Extract<SlotType, { kind: "actor" }>, scope: ExprScope,
  path: string, role: SelectorRole, mode: SlotMode
) => {
  checkOwnerRule(run, selector, role, path);
  if (slot.instanceOnly && (selector.kind === "type" || selector.kind === "family"))
    run.sink.add("error", "instanceRequired", path);
  const matched = matchedEntries(run, selector, slot, path);
  if (!matched) {
    checkRuntimeSelector(run, selector, scope, path);
    return;
  }
  checkCapability(run, matched, slot, mode, path);
};

/** An actor type slot (spawn type, job filter): catalog kind, qualifiers and capability. */
export const checkActorTypeSlot = (
  run: ValidationRun, ref: ActorTypeRef, slot: Extract<SlotType, { kind: "actorType" }>, path: string,
  mode: SlotMode
) => {
  const entry = checkActorTypeRef(run, ref, slot.kinds, path);
  if (entry) checkCapability(run, { entries: [entry], family: false, label: entry.id }, slot, mode, path);
};

/** A content reference whose entry must be one of `kinds` (unknown ids are reported by the reference walk). */
export const checkContentKind = (
  run: ValidationRun, ref: { id: string }, kinds: readonly ContentKind[], path: string
) => {
  const entry = run.catalog.entry(ref.id);
  if (entry) checkKinds(run, entry, kinds, path);
};
