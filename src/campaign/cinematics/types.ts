import type { TranslatableText } from "../campaign-text.ts";
import type {
  CINEMATIC_EASES, CINEMATIC_FADE_TARGETS, CINEMATIC_SPEAK_TIMINGS, CINEMATIC_SPEAKER_EXPRESSIONS,
  CINEMATIC_SPEAKER_SIDES, CINEMATIC_STEP_STARTS, CINEMATIC_WEATHER_STATES
} from "./constants.ts";

/**
 * Campaign cinematic data (plan section 2). Sequences, camera shots and the map hooks live on the campaign map;
 * speakers live on the campaign. Region ids are ids of the map's region library (`CampaignMap.regions`, CIN0).
 */
export type CinematicEase = (typeof CINEMATIC_EASES)[number];
/** When a step starts relative to the step before it. */
export type StepStart = (typeof CINEMATIC_STEP_STARTS)[number];
export type CinematicWeatherState = (typeof CINEMATIC_WEATHER_STATES)[number];
export type CinematicSpeakTiming = (typeof CINEMATIC_SPEAK_TIMINGS)[number];
export type CinematicSpeakerExpression = "neutral" | (typeof CINEMATIC_SPEAKER_EXPRESSIONS)[number];

/** A recorded camera, stored in world terms so it frames the same ground on any viewport. */
export interface CameraShot {
  /** Eye-to-target distance in world units (the "zoom"/height of the shot). */
  distance: number;
  /** Vertical field of view in radians; defaults to the perspective rig's field of view. */
  fov?: number;
  id: string;
  name: string;
  /** Radians above the horizon, within [CINEMATIC_MIN_PITCH, CINEMATIC_MAX_PITCH]. */
  pitch: number;
  /** Orbit target on the ground (y follows the terrain unless `targetY` is set). */
  targetX: number;
  targetY?: number;
  targetZ: number;
  /** Radians, the same sense as CameraState.yaw (0 = iso view direction). */
  yaw: number;
}

/** A recurring story figure of one campaign (the advisor), referenced by id from every map. */
export interface CampaignSpeaker {
  id: string;
  name: TranslatableText;
  /** Campaign image record ids per expression (WebP); `neutral` is required and the fallback. */
  portraits: { neutral: string } & Partial<Record<Exclude<CinematicSpeakerExpression, "neutral">, string>>;
  /** Panel side; defaults to left. */
  side?: (typeof CINEMATIC_SPEAKER_SIDES)[number];
}

/** Optional slow move after a camera step arrives; every delta is relative to the arrived shot. */
export interface CameraDrift {
  /** Dolly in/out to this distance. */
  distanceTo?: number;
  durationMs: number;
  ease: CinematicEase;
  /** Optical zoom; use sparingly. */
  fovTo?: number;
  /** Tilt (radians, signed). */
  pitchBy?: number;
  /** Pan the target to a region. */
  targetToRegionId?: string;
  /** Orbit (radians, signed). */
  yawBy?: number;
}

/**
 * What a spawn step places (owner answer Q7, 2026-11-11). Decorations are always fixed scenery: never the player's,
 * not selectable, no pick-up. Units (soldiers) and wares are scenery unless `grantToPlayer`: granted soldiers join
 * the player's army at the spawn point; granted wares lie as a ground pile there until a carrier fetches them.
 */
export type SpawnObject =
  | { count: number; grantToPlayer: boolean; kind: "unit"; unitType: string }
  | { amount: number; grantToPlayer: boolean; kind: "ware"; ware: string }
  | { decorationId: string; kind: "decoration" };

/** A unit placed in the map (authored script id) or spawned earlier in this sequence. */
export type ActorRef = string;

interface StepBase {
  /** Wait before the step starts (ms, real presentation time), measured from the anchor chosen by `start`. */
  delayMs: number;
  id: string;
  start: StepStart;
}

export type CinematicStepBody =
  | { kind: "cinematicMode"; letterbox: boolean; on: boolean; transitionMs: number }
  | { durationMs: number; kind: "fade"; to: (typeof CINEMATIC_FADE_TARGETS)[number] }
  | { drift?: CameraDrift; ease: CinematicEase; kind: "camera"; shotId: string; transitionMs: number }
  | { actorRef: ActorRef; distance?: number; durationMs: number; kind: "cameraFollow" }
  | { durationMs: number; kind: "cameraShake"; strength: number }
  /** `fixed` lasts exactly `durationMs`; `auto` sums the auto duration of every page of the shown language. */
  | {
    durationMs?: number; expression?: CinematicSpeakerExpression; kind: "speak"; speakerId: string;
    text: TranslatableText; timing: CinematicSpeakTiming; waitForClick?: boolean;
  }
  /**
   * `actorRef` names the spawned object for later steps of the same sequence. `facing` overrides the facing of a
   * point region (radians).
   */
  | { actorRef?: ActorRef; facing?: number; kind: "spawn"; object: SpawnObject; regionId: string }
  | { actorRef: ActorRef; kind: "walk"; regionId: string; timeoutMs: number; waitUntilArrived: boolean }
  | { actorRef: ActorRef; facing: number; kind: "face" }
  | { kind: "weather"; state: CinematicWeatherState; transitionMs: number }
  | { count: number; kind: "lightning"; regionId?: string }
  | { hour: number; kind: "timeOfDay" }
  | { kind: "highlight"; on: boolean; regionId: string }
  | { cueId: string; kind: "sound" }
  | { fadeMs: number; kind: "music"; trackId: string | null };

export type CinematicStep = StepBase & CinematicStepBody;
export type CinematicStepKind = CinematicStep["kind"];
export type CinematicStepOf<K extends CinematicStepKind> = Extract<CinematicStep, { kind: K }>;

export interface CinematicSequence {
  id: string;
  /** Editor-only label. */
  name: string;
  /**
   * Owner answer Q3: "Pause the world" (default true) holds the simulation during the sequence and freezes quest
   * countdowns; false keeps the world running (required for walk steps) and countdowns keep going.
   */
  pauseWorld: boolean;
  /** Owner answer Q5: always skippable with two presses; kept as data for later maps. */
  skippable: boolean;
  steps: CinematicStep[];
}

/** Map-level sequence hooks (quests carry their own start/completion hooks). */
export interface CampaignMapSequenceHooks {
  defeatSequenceId?: string;
  startSequenceId?: string;
  victorySequenceId?: string;
}
