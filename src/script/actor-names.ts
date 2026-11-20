import type { TranslatableText } from "../campaign/campaign-text.ts";
import { ACTOR_LOOK_DEFAULT_NAMES } from "./constants.ts";
import type { ActorLook, ScriptActor } from "./types/actors.ts";
import type { MapScript } from "./types/script.ts";

/**
 * Display names of script actors (owner 2026-11-13): the name the map maker gave, else the English default of a
 * pirate or bandit look. Pure; the map editor, the Ready check and the cinematic speaker panel share it.
 */

type SpecialLook = keyof typeof ACTOR_LOOK_DEFAULT_NAMES;

const isSpecialLook = (kind: ActorLook["kind"]): kind is SpecialLook => kind in ACTOR_LOOK_DEFAULT_NAMES;

/** The default name of a look that is no nation (pirates, bandits); null for nation looks. */
export const defaultLookName = (look: ActorLook): TranslatableText | null =>
  (isSpecialLook(look.kind) ? { en: ACTOR_LOOK_DEFAULT_NAMES[look.kind] } : null);

/** The name players read for an actor, or null when it has none (an unnamed actor of a nation look). */
export const actorDisplayName = (actor: ScriptActor): TranslatableText | null => {
  if (actor.displayName?.en.trim()) return actor.displayName;
  return actor.binding === "spawn" ? defaultLookName(actor.look) : null;
};

/** Ids of the actors that have a display name: a cinematic speak step may name one as its speaker. */
export const namedActorIds = (script: Pick<MapScript, "actors">): ReadonlySet<string> =>
  new Set(script.actors.filter(actor => actorDisplayName(actor) !== null).map(actor => actor.id));
