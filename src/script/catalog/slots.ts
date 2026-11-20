import type { AudioKind } from "../../catalog/types/audio.ts";
import type { ContentKind } from "../../catalog/types/refs.ts";
import type { ScriptRefKind } from "../types/refs.ts";
import type { EventResponseKey, ValueType } from "../types/values.ts";

/**
 * Typed slots of the event, action, predicate and function catalogues (trigger design §3.3, §5). The editor offers
 * only values of the slot type, the validator checks them and the engine reads them by name.
 */
export type SlotType =
  /**
   * An `ActorSelector`. `requires` names the entry capability (events: `actor.capabilities`) or action name
   * (actions: `actor.targetOf`) every matched catalog entry must declare; null = any scriptable entry.
   */
  | { instanceOnly?: boolean; kind: "actor"; kinds?: readonly ContentKind[]; requires: string | null; tag?: string }
  /** An `ActorTypeRef` (spawn type, typeOf comparison). */
  | { kind: "actorType"; kinds?: readonly ContentKind[]; requires: string | null }
  /** A `PlayerFilter`, or an expression of type `player`. */
  | { kind: "player" }
  /** A `ScriptRef` of this kind, or an expression of the matching value type (region, quest, timer, multiboard). */
  | { kind: "ref"; ref: ScriptRefKind }
  /** A catalog content reference restricted to kinds (building availability). */
  | { kind: "content"; kinds: readonly ContentKind[] }
  | { kind: "value"; type: ValueType }
  /** A string literal from a closed list. */
  | { kind: "choice"; values: readonly string[] }
  /** A region reference or the literal "mapEdge" (sail). */
  | { kind: "regionOrEdge" }
  | { kind: "look" }
  /** An `AudioRef`: a `sound:*` / `music:*` catalog entry or an audio asset uploaded with the map. */
  | { audio: AudioKind; kind: "audio" }
  | { kind: "uiTarget" }
  | { kind: "rewards" }
  | { kind: "goods" }
  | { kind: "soldiers" }
  /**
   * An expression typed by the variable named in slot `of`: its element type always (append, contains) or only
   * when an `index` slot is set (set variable).
   */
  | { element: "always" | "withIndex"; kind: "variableValue"; of: string };

export type SlotTypeKind = SlotType["kind"];

export interface SlotDef {
  name: string;
  optional: boolean;
  type: SlotType;
}

/** Where an event comes from (§5 legend); `arch` = the client archipelago executor. */
export type EventSource = "sim" | "cmd" | "eng" | "pres" | "arch";

/** v1 = first release; v2 = later lanes (validated, but a warning says it does not run yet). */
export type CatalogueRelease = 1 | 2;

export interface EventDef {
  /** The capability the subject's entries declare in `actor.capabilities`; null = any scriptable entry. */
  capability: string | null;
  /** Reads the world environment (hour, weather; ENV0). */
  environment?: boolean;
  /** The lane that must land before it fires (editor info), e.g. "PRES0", "HUNT2". */
  pending?: string;
  responses: readonly EventResponseKey[];
  since: CatalogueRelease;
  slots: readonly SlotDef[];
  source: EventSource;
  /** The slot whose owner the event `player` filter tests; it carries no owner of its own. */
  subject: string | null;
}

/** How an action behaves inside a cinematic sequence step: guaranteed, deferred, native, refused (§5.2). */
export type CinematicMode = "guaranteed" | "deferred" | "native" | "refused";

export interface ActionDef {
  args: readonly SlotDef[];
  /** Runs in the client archipelago executor (colony expiry/cancel lists, §8.2). */
  archipelago?: boolean;
  cinematic: CinematicMode;
  /** Writes the world environment (counts for `scriptReadsEnvironment`). */
  environment?: boolean;
  /** Event kinds the action itself may raise (self-feeding trigger warning). */
  emits?: readonly string[];
  pending?: string;
  /** A presentation effect (UI): never recorded, deferred in cinematics. */
  presentation?: boolean;
  since: CatalogueRelease;
  /** Outcomes of "wait until done"; null = the action cannot be waited on. */
  wait: readonly string[] | null;
}

export interface PredicateDef {
  args: readonly SlotDef[];
  environment?: boolean;
}

export interface FunctionDef {
  args: readonly SlotDef[];
  environment?: boolean;
  result: ValueType;
}

const define = (name: string, type: SlotType, optional = false): SlotDef => ({ name, optional, type });

/** Slot builders: the catalogue tables read like the design's sentence templates. */
export const slot = {
  actor: (name: string, requires: string | null, options: Omit<Extract<SlotType, { kind: "actor" }>, "kind" |
    "requires"> = {}, optional = false) => define(name, { kind: "actor", requires, ...options }, optional),
  audio: (name: string, audio: AudioKind, optional = false) => define(name, { audio, kind: "audio" }, optional),
  actorType: (name: string, requires: string | null, kinds?: readonly ContentKind[], optional = false) =>
    define(name, { kind: "actorType", kinds, requires }, optional),
  choice: (name: string, values: readonly string[], optional = false) =>
    define(name, { kind: "choice", values }, optional),
  content: (name: string, kinds: readonly ContentKind[], optional = false) =>
    define(name, { kind: "content", kinds }, optional),
  of: (name: string, kind: Exclude<SlotTypeKind, "actor" | "actorType" | "audio" | "choice" | "content" | "ref" | "value" |
    "variableValue">, optional = false) => define(name, { kind } as SlotType, optional),
  player: (name: string, optional = false) => define(name, { kind: "player" }, optional),
  ref: (name: string, ref: ScriptRefKind, optional = false) => define(name, { kind: "ref", ref }, optional),
  value: (name: string, type: ValueType, optional = false) => define(name, { kind: "value", type }, optional),
  variableValue: (name: string, of: string, element: "always" | "withIndex" = "withIndex", optional = false) =>
    define(name, { element, kind: "variableValue", of }, optional)
};
