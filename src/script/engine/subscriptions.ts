import { EVENT_CATALOG, type ScriptEventKind } from "../catalog/events.ts";
import type { ActorSelector, ActorTypeRef } from "../types/actors.ts";
import type { ScriptEmission, ScriptEventActor } from "../types/emission.ts";
import type { MapScript } from "../types/script.ts";
import type { EventSlotValue, ScriptEvent } from "../types/triggers.ts";

/**
 * Subscription index (design §6.2): built once per loaded script. A kind nobody subscribes to costs one byte read;
 * subscribed kinds are bucketed by the subject selector (authored actor / actor variable, catalog type, family
 * path, or any), so unreferenced actors cost nothing. Time events (`elapsedTime`, `periodic`) are scheduled on the
 * script clock instead of being emitted.
 */

/** Stable numeric event kinds (sorted catalogue keys); emission sites may cache the index. */
export const SCRIPT_EVENT_KINDS: readonly ScriptEventKind[] = Object.freeze(
  (Object.keys(EVENT_CATALOG) as ScriptEventKind[]).sort()
);
export const SCRIPT_EVENT_KIND_INDEX: Readonly<Record<ScriptEventKind, number>> = Object.freeze(
  Object.fromEntries(SCRIPT_EVENT_KINDS.map((kind, index) => [kind, index])) as Record<ScriptEventKind, number>
);

const TIME_EVENT_KINDS: ReadonlySet<string> = new Set(["elapsedTime", "periodic"]);

/** One trigger event registration. */
export interface SubscriptionRef {
  event: ScriptEvent;
  triggerIndex: number;
}

/** Registrations keyed by the selector of one actor slot. */
export interface KeyedSubscriptions {
  byFamily: Map<string, SubscriptionRef[]>;
  /** Keys `a:<actorId>` (authored actor) and `v:<variableId>` (actor variable). */
  byInstance: Map<string, SubscriptionRef[]>;
  byType: Map<string, SubscriptionRef[]>;
}

export interface SubscriptionBucket {
  /** Registrations without any indexable actor selector. */
  any: SubscriptionRef[];
  /**
   * Slot name → keyed registrations. Each registration is indexed once, under its most selective filtered actor
   * slot (instance > type > family; e.g. `animalKilled` filtered on a `victim` family and no killer filter).
   * Emission looks up every actor slot it carries (usually 2) and de-duplicates the matches.
   */
  bySlot: Map<string, KeyedSubscriptions>;
}

/** A trigger fired by the script clock: once at `firstTick`, then every `periodTicks` (0 = once). */
export interface TimeSubscription {
  event: ScriptEvent;
  firstTick: number;
  periodTicks: number;
  triggerIndex: number;
}

export interface SubscriptionIndex {
  buckets: (SubscriptionBucket | undefined)[];
  subscribed: Uint8Array;
  time: TimeSubscription[];
}

export const instanceKeyOfActor = (actorId: string) => `a:${actorId}`;
export const instanceKeyOfVariable = (variableId: string) => `v:${variableId}`;

export const isSelector = (value: EventSlotValue | undefined): value is ActorSelector =>
  typeof value === "object" && value !== null && "kind" in value && !("k" in value);

const pushTo = (map: Map<string, SubscriptionRef[]>, key: string, ref: SubscriptionRef) => {
  const list = map.get(key);
  if (list) list.push(ref);
  else map.set(key, [ref]);
};

/** Selectivity of an indexable selector: instance/variable > type > family; 0 = not indexable. */
const SELECTIVITY: Readonly<Record<string, number>> = Object.freeze({ family: 1, instance: 3, type: 2, variable: 3 });

const selectivityOf = (value: EventSlotValue | undefined) => isSelector(value) ? SELECTIVITY[value.kind] ?? 0 : 0;

/**
 * The actor slot a registration is indexed under: the most selective filtered actor slot of the event (any slot:
 * subject, victim, target …), ties broken by slot order (subject first). An event with two actors is addressable
 * from either side ("a hunter kills a deer" = "a deer is killed by a hunter").
 */
const indexSlotOf = (event: ScriptEvent) => {
  let best: string | undefined;
  let bestRank = 0;
  for (const name of actorSlotOrder(event.kind)) {
    const rank = selectivityOf(event.slots[name]);
    if (rank > bestRank) {
      best = name;
      bestRank = rank;
    }
  }
  return best;
};

/** Actor slot names of an event kind: the subject first, then the other actor slots in catalogue order. */
const actorSlotOrder = (kind: ScriptEventKind) => {
  const { slots, subject } = EVENT_CATALOG[kind];
  const others = slots.filter(slot => slot.type.kind === "actor" && slot.name !== subject).map(slot => slot.name);
  return subject === null ? others : [subject, ...others];
};

const keyedFor = (bucket: SubscriptionBucket, slotName: string) => {
  let keyed = bucket.bySlot.get(slotName);
  if (!keyed) {
    keyed = { byFamily: new Map(), byInstance: new Map(), byType: new Map() };
    bucket.bySlot.set(slotName, keyed);
  }
  return keyed;
};

const addKeyed = (keyed: KeyedSubscriptions, selector: ActorSelector, ref: SubscriptionRef) => {
  if (selector.kind === "instance") pushTo(keyed.byInstance, instanceKeyOfActor(selector.actor.id), ref);
  else if (selector.kind === "variable") pushTo(keyed.byInstance, instanceKeyOfVariable(selector.variable.id), ref);
  else if (selector.kind === "type") pushTo(keyed.byType, selector.type.type.id, ref);
  else if (selector.kind === "family") pushTo(keyed.byFamily, selector.family.id, ref);
};

const addToBucket = (bucket: SubscriptionBucket, ref: SubscriptionRef) => {
  const slotName = indexSlotOf(ref.event);
  if (slotName === undefined) {
    bucket.any.push(ref);
    return;
  }
  addKeyed(keyedFor(bucket, slotName), ref.event.slots[slotName] as ActorSelector, ref);
};

const emptyBucket = (): SubscriptionBucket => ({ any: [], bySlot: new Map() });

/** Whole ticks of a literal seconds slot (time events take literal seconds; anything else is 0). */
const literalSeconds = (value: EventSlotValue | undefined, toTicks: (seconds: number) => number) => {
  if (typeof value !== "object" || value === null || !("k" in value) || value.k !== "lit") return 0;
  return typeof value.value === "number" ? toTicks(value.value) : 0;
};

const timeSubscription = (ref: SubscriptionRef, toTicks: (seconds: number) => number): TimeSubscription => {
  const seconds = literalSeconds(ref.event.slots.seconds, toTicks);
  if (ref.event.kind === "elapsedTime") return { ...ref, firstTick: Math.max(1, seconds), periodTicks: 0 };
  const period = Math.max(1, seconds);
  return { ...ref, firstTick: literalSeconds(ref.event.slots.offset, toTicks) + period, periodTicks: period };
};

export const buildSubscriptionIndex = (
  script: MapScript, toTicks: (seconds: number) => number
): SubscriptionIndex => {
  const buckets: (SubscriptionBucket | undefined)[] = new Array(SCRIPT_EVENT_KINDS.length).fill(undefined);
  const subscribed = new Uint8Array(SCRIPT_EVENT_KINDS.length);
  const time: TimeSubscription[] = [];
  script.triggers.forEach((trigger, triggerIndex) => {
    for (const event of trigger.events) {
      const ref = { event, triggerIndex };
      if (TIME_EVENT_KINDS.has(event.kind)) {
        time.push(timeSubscription(ref, toTicks));
        continue;
      }
      const kindIndex = SCRIPT_EVENT_KIND_INDEX[event.kind];
      if (kindIndex === undefined) continue;
      subscribed[kindIndex] = 1;
      buckets[kindIndex] ??= emptyBucket();
      addToBucket(buckets[kindIndex]!, ref);
    }
  });
  return { buckets, subscribed, time };
};

const inRange = (range: { max?: number; min?: number } | undefined, value: number | undefined) => {
  if (!range) return true;
  if (value === undefined) return false;
  return value >= (range.min ?? -Infinity) && value <= (range.max ?? Infinity);
};

/** Qualifier check of a type selector after the type lookup (design §4.3). */
export const qualifiersMatch = (type: ActorTypeRef, qualifiers: {
  level?: number; nation?: string; rank?: number; variants?: Record<string, string>;
} | undefined) => {
  if (type.nation !== undefined && qualifiers?.nation !== type.nation) return false;
  if (type.variant && qualifiers?.variants?.[type.variant.axis] !== type.variant.value) return false;
  return inRange(type.level, qualifiers?.level) && inRange(type.rank, qualifiers?.rank);
};

const pushAll = (target: SubscriptionRef[], refs: readonly SubscriptionRef[] | undefined) => {
  if (refs) for (const ref of refs) target.push(ref);
};

/** Registrations keyed on one emitted actor: its instance keys, its type and every family prefix. */
const collectKeyed = (
  keyed: KeyedSubscriptions, actor: ScriptEventActor, instanceKeys: readonly string[], target: SubscriptionRef[]
) => {
  for (const key of instanceKeys) pushAll(target, keyed.byInstance.get(key));
  pushAll(target, keyed.byType.get(actor.type));
  let path = actor.family;
  while (path.length > 0) {
    pushAll(target, keyed.byFamily.get(path));
    const separator = path.lastIndexOf(".");
    path = separator < 0 ? "" : path.slice(0, separator);
  }
};

/** Candidate registrations of an emission: keyed lookups for each indexed actor slot present, then `any`. */
export const collectCandidates = (
  bucket: SubscriptionBucket, emission: ScriptEmission, instanceKeysOf: (actor: ScriptEventActor) => readonly string[]
) => {
  if (bucket.bySlot.size === 0) return bucket.any;
  const candidates: SubscriptionRef[] = [];
  for (const [slotName, keyed] of bucket.bySlot) {
    const actor = emission.actors?.[slotName];
    if (actor) collectKeyed(keyed, actor, instanceKeysOf(actor), candidates);
  }
  pushAll(candidates, bucket.any);
  return candidates;
};
