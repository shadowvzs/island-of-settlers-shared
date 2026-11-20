import { number } from "../../validation/index.ts";
import { CAMPAIGN_LIMITS } from "../campaign-constants.ts";
import {
  amount, arrayOf, booleanValue, guard, hour, identifier, integerIn, kindUnion, nullable, numberIn, objectOf, oneOf,
  optional, type ShapeFields, stringUpTo, translatableText
} from "../campaign-shape-checks.ts";
import {
  CINEMATIC_EASES, CINEMATIC_FADE_TARGETS, CINEMATIC_LIMITS, CINEMATIC_MAX_PITCH, CINEMATIC_MIN_PITCH,
  CINEMATIC_SPEAK_TIMINGS, CINEMATIC_SPEAKER_EXPRESSIONS, CINEMATIC_SPEAKER_SIDES, CINEMATIC_STEP_STARTS,
  CINEMATIC_WEATHER_STATES
} from "./constants.ts";

/** Structural checks of the stored cinematic data; reference and timing rules are in validate.ts. */
const finite = number();
const positiveUpTo = (max: number) => guard(value => typeof value === "number" && Number.isFinite(value) &&
  value > 0 && value <= max);
const milliseconds = integerIn(0, CINEMATIC_LIMITS.maxStepMs);
const coordinate = numberIn(0, 100_000);
const distance = positiveUpTo(CINEMATIC_LIMITS.maxDistance);
const fieldOfView = positiveUpTo(CINEMATIC_LIMITS.maxFieldOfView);
const pitch = guard(value => typeof value === "number" && value >= CINEMATIC_MIN_PITCH &&
  value <= CINEMATIC_MAX_PITCH);
const ease = oneOf(CINEMATIC_EASES);
const name = stringUpTo(CAMPAIGN_LIMITS.nameLength);
const expressions = ["neutral", ...CINEMATIC_SPEAKER_EXPRESSIONS];

export const cameraShot = objectOf({
  distance,
  fov: optional(fieldOfView),
  id: identifier,
  name,
  pitch,
  targetX: coordinate,
  targetY: optional(finite),
  targetZ: coordinate,
  yaw: finite
});

const drift = objectOf({
  distanceTo: optional(distance),
  durationMs: milliseconds,
  ease,
  fovTo: optional(fieldOfView),
  pitchBy: optional(finite),
  targetToRegionId: optional(identifier),
  yawBy: optional(finite)
});

const spawnObject = kindUnion({
  decoration: { decorationId: identifier },
  unit: { count: integerIn(1, CAMPAIGN_LIMITS.maxCount), grantToPlayer: booleanValue, unitType: identifier },
  ware: { amount, grantToPlayer: booleanValue, ware: identifier }
});

const stepBodies: Readonly<Record<string, ShapeFields>> = {
  camera: { drift: optional(drift), ease, shotId: identifier, transitionMs: milliseconds },
  cameraFollow: { actorRef: identifier, distance: optional(distance), durationMs: milliseconds },
  cameraShake: { durationMs: milliseconds, strength: positiveUpTo(CINEMATIC_LIMITS.maxShakeStrength) },
  cinematicMode: { letterbox: booleanValue, on: booleanValue, transitionMs: milliseconds },
  face: { actorRef: identifier, facing: finite },
  fade: { durationMs: milliseconds, to: oneOf(CINEMATIC_FADE_TARGETS) },
  highlight: { on: booleanValue, regionId: identifier },
  lightning: { count: integerIn(1, CINEMATIC_LIMITS.lightningStrikes), regionId: optional(identifier) },
  music: { fadeMs: milliseconds, trackId: nullable(identifier) },
  sound: { cueId: identifier },
  spawn: { actorRef: optional(identifier), facing: optional(finite), object: spawnObject, regionId: identifier },
  speak: {
    durationMs: optional(milliseconds), expression: optional(oneOf(expressions)), speakerId: identifier,
    text: translatableText(CAMPAIGN_LIMITS.textLength), timing: oneOf(CINEMATIC_SPEAK_TIMINGS),
    waitForClick: optional(booleanValue)
  },
  timeOfDay: { hour },
  walk: { actorRef: identifier, regionId: identifier, timeoutMs: milliseconds, waitUntilArrived: booleanValue },
  weather: { state: oneOf(CINEMATIC_WEATHER_STATES), transitionMs: milliseconds }
};

const stepBase: ShapeFields = { delayMs: milliseconds, id: identifier, start: oneOf(CINEMATIC_STEP_STARTS) };
const step = kindUnion(Object.fromEntries(Object.entries(stepBodies)
  .map(([kind, fields]) => [kind, { ...stepBase, ...fields }])));

export const cinematicSequence = objectOf({
  id: identifier,
  name,
  pauseWorld: booleanValue,
  skippable: booleanValue,
  steps: arrayOf(step, CINEMATIC_LIMITS.stepsPerSequence)
});

export const campaignSpeaker = objectOf({
  id: identifier,
  name: translatableText(CAMPAIGN_LIMITS.nameLength),
  portraits: objectOf(Object.fromEntries(expressions
    .map(expression => [expression, expression === "neutral" ? identifier : optional(identifier)]))),
  side: optional(oneOf(CINEMATIC_SPEAKER_SIDES))
});

/** The optional cinematic fields of a campaign map document. */
export const mapCinematicFields: ShapeFields = {
  cameraShots: optional(arrayOf(cameraShot, CINEMATIC_LIMITS.cameraShots)),
  defeatSequenceId: optional(identifier),
  sequences: optional(arrayOf(cinematicSequence, CINEMATIC_LIMITS.sequences)),
  startSequenceId: optional(identifier),
  victorySequenceId: optional(identifier)
};

/** The optional cinematic hooks of a quest. */
export const questCinematicFields: ShapeFields = {
  completeSequenceId: optional(identifier),
  hidden: optional(booleanValue),
  startSequenceId: optional(identifier)
};

export const campaignSpeakers = optional(arrayOf(campaignSpeaker, CINEMATIC_LIMITS.speakers));
