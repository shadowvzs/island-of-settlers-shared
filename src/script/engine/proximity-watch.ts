import type { ScriptEventKind } from "../catalog/events.ts";
import type { ActorSelector } from "../types/actors.ts";
import type { MapScript } from "../types/script.ts";
import type { EventSlotValue } from "../types/triggers.ts";
import { isSelector } from "./subscriptions.ts";

/**
 * Proximity watch plan (trigger design §5.1.2, §5.1.3, §6.4, lane TRG4b): which "came near" circles and whether
 * bridge steps the settlement adapter has to watch. Pure and worker-safe. A circle is watched when a `cameNear` /
 * `cameNearMoving` event names a target and a literal radius; the adapter resolves the target to live objects
 * every tick (a building: an auto-circle in the per-cell lists; a unit: a distance check).
 */

export type ProximityEventKind = Extract<ScriptEventKind, "cameNear" | "cameNearMoving">;

export const PROXIMITY_EVENT_KINDS: readonly ProximityEventKind[] = ["cameNear", "cameNearMoving"];

/** Largest watched circle around a static target, in cells (design §5.1.2: radius ≤ 8). */
export const PROXIMITY_STATIC_RADIUS_MAX = 8;
/** Largest watched circle around a moving target, in cells. */
export const PROXIMITY_MOVING_RADIUS_MAX = 32;

/** One watched "came near" form: every trigger event with the same kind, target and radius shares it. */
export interface ProximityWatchEntry {
  kind: ProximityEventKind;
  /** The authored radius (the emitted `radius` value the slot filter compares). */
  radius: number;
  target: ActorSelector;
}

const isProximityKind = (kind: ScriptEventKind): kind is ProximityEventKind =>
  (PROXIMITY_EVENT_KINDS as readonly ScriptEventKind[]).includes(kind);

/** A literal positive radius; expressions are not watched (the circle must be known without a run). */
const literalRadius = (value: EventSlotValue | undefined) => {
  const expr = value as { k?: unknown; value?: unknown } | null | undefined;
  if (expr?.k !== "lit" || typeof expr.value !== "number") return undefined;
  return Number.isFinite(expr.value) && expr.value > 0 ? expr.value : undefined;
};

/** The watched "came near" forms of the script, each once, in script order (stable zone order). */
export const proximityWatchEntries = (script: MapScript): ProximityWatchEntry[] => {
  const entries = new Map<string, ProximityWatchEntry>();
  for (const trigger of script.triggers) {
    for (const event of trigger.events) {
      if (!isProximityKind(event.kind)) continue;
      const radius = literalRadius(event.slots.radius), target = event.slots.target;
      if (radius === undefined || !isSelector(target)) continue;
      const key = `${event.kind}|${radius}|${JSON.stringify(target)}`;
      if (!entries.has(key)) entries.set(key, { kind: event.kind, radius, target });
    }
  }
  return [...entries.values()];
};

/** Some trigger listens to `bridgeStepped`: the adapter watches the bridge decks. */
export const watchesBridgeSteps = (script: MapScript) =>
  script.triggers.some(trigger => trigger.events.some(event => event.kind === "bridgeStepped"));
