import type { CinematicStep, CinematicStepOf } from "../../campaign/cinematics/types.ts";
import type { ScriptActionKind } from "../catalog/actions.ts";
import type { ActorSelector } from "../types/actors.ts";
import type { ActiveCinematic, RunContextValue } from "../types/run-state.ts";
import type { ScriptRef, ScriptRefKind } from "../types/refs.ts";
import type { ActionArg } from "../types/triggers.ts";

/**
 * Cinematic world steps as script actions (CIN4, cinematics plan §3.4, trigger design §5.2.5): spawn, walk and face
 * always change the simulation; weather and time of day do so only on an island whose script owns a world
 * environment (ENV0), where the world clock would otherwise override a presentation-only change. Each world step
 * becomes the same action request a trigger would send, so the TRG5a/ENV0 handlers apply it.
 */

/** The world port request of one world step, without the engine's evaluation scope. */
export interface CinematicActionSpec {
  args: Record<string, ActionArg>;
  op: ScriptActionKind;
  /** Walk with "wait until arrived": the order reports its arrival (action id). */
  wait: boolean;
}

const RADIANS_TO_DEGREES = 180 / Math.PI;
const MS_PER_SECOND = 1000;
const PLAYER_FACTION = 0;
const SOLDIER_CONTENT_PREFIX = "soldier:";
/** Cinematic weather → the world environment's three states (cloudy counts as clear, a storm as rain). */
const WORLD_WEATHER: Readonly<Record<CinematicStepOf<"weather">["state"], string>> = {
  clear: "clear", cloudy: "clear", rain: "rain", snow: "snow", storm: "rain"
};

const ALWAYS_WORLD: ReadonlySet<string> = new Set(["face", "spawn", "walk"]);
const ENVIRONMENT_WORLD: ReadonlySet<string> = new Set(["timeOfDay", "weather"]);

/** Whether the step changes the simulation (a recorded command) on a script with or without a world environment. */
export const isCinematicWorldStep = (step: CinematicStep, environment: boolean) =>
  ALWAYS_WORLD.has(step.kind) || (environment && ENVIRONMENT_WORLD.has(step.kind));

const ref = <K extends ScriptRefKind>(kind: K, id: string): ScriptRef<K> => ({ id, k: "ref", kind });
const num = (value: number): ActionArg => ({ k: "lit", type: "number", value });
const text = (value: string): ActionArg => ({ k: "lit", type: "string", value });

/** An actor reference: a unit a spawn step of this sequence named, else an authored actor id. */
export const cinematicActorSelector = (active: ActiveCinematic, actorRef: string): ActorSelector =>
  Object.hasOwn(active.actors, actorRef)
    ? { kind: "local", name: actorRef }
    : { actor: ref("actor", actorRef), kind: "instance" };

/** Loop-local values that resolve the spawned actor references of the sequence. */
export const cinematicLocals = (active: ActiveCinematic): Record<string, RunContextValue> =>
  Object.fromEntries(Object.entries(active.actors).map(([name, handles]) =>
    [name, { type: "actorGroup", value: handles.map(handle => ({ ...handle })) }]));

/**
 * Soldiers granted to the player join the army at the spawn point (owner Q7). Scenery soldiers, wares (ground piles)
 * and decorations have no simulation mechanism yet: null, the step is logged and counted as applied.
 */
const spawnSpec = ({ facing, object, regionId }: CinematicStepOf<"spawn">): CinematicActionSpec | null => {
  if (object.kind !== "unit" || !object.grantToPlayer) return null;
  const args: Record<string, ActionArg> = {
    at: ref("region", regionId), count: num(object.count), owner: { faction: PLAYER_FACTION, kind: "slot" },
    type: { type: ref("content", `${SOLDIER_CONTENT_PREFIX}${object.unitType}`) } as unknown as ActionArg
  };
  if (facing !== undefined) args.facing = num(facing * RADIANS_TO_DEGREES);
  return { args, op: "spawn", wait: false };
};

const walkSpec = (active: ActiveCinematic, step: CinematicStepOf<"walk">): CinematicActionSpec => ({
  args: { actor: cinematicActorSelector(active, step.actorRef), region: ref("region", step.regionId),
    stance: text("passive") },
  op: "move",
  wait: step.waitUntilArrived
});

/** A skipped walk jumps to its end state: the actor stands in the target region. */
const skippedWalkSpec = (active: ActiveCinematic, step: CinematicStepOf<"walk">): CinematicActionSpec => ({
  args: { actor: cinematicActorSelector(active, step.actorRef), region: ref("region", step.regionId) },
  op: "teleport",
  wait: false
});

/**
 * The action request of a world step; null when the step has no simulation mechanism yet. `skipped`: the step is
 * applied by a skip (walks teleport into their region).
 */
export const cinematicActionSpec = (
  active: ActiveCinematic, step: CinematicStep, skipped = false
): CinematicActionSpec | null => {
  switch (step.kind) {
    case "spawn": return spawnSpec(step);
    case "walk": return skipped ? skippedWalkSpec(active, step) : walkSpec(active, step);
    case "face":
      return { args: { actor: cinematicActorSelector(active, step.actorRef),
        angle: num(step.facing * RADIANS_TO_DEGREES) }, op: "face", wait: false };
    case "timeOfDay": return { args: { hour: num(step.hour) }, op: "timeOfDay", wait: false };
    case "weather":
      return { args: { state: text(WORLD_WEATHER[step.state]),
        transitionSeconds: num(step.transitionMs / MS_PER_SECOND) }, op: "setWeather", wait: false };
    default: return null;
  }
};

/** Actor references a sequence names (walk, face, follow, spawned units): its members while it plays. */
export const cinematicActorRefs = (steps: readonly CinematicStep[]) => {
  const refs = new Set<string>();
  for (const step of steps) {
    if ("actorRef" in step && typeof step.actorRef === "string") refs.add(step.actorRef);
  }
  return [...refs].sort();
};
