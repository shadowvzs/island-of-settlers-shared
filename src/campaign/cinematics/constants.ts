/**
 * Campaign cinematics constants (campaign/campaign-cinematics-plan-2026-11-11.md, lane CIN1). Pure and worker-safe;
 * no other cinematics file holds a magic number.
 */
export const CINEMATIC_STEP_STARTS = ["afterPrevious", "withPrevious"] as const;
export const CINEMATIC_EASES = ["linear", "easeIn", "easeOut", "easeInOut"] as const;
export const CINEMATIC_FADE_TARGETS = ["black", "white", "clear"] as const;
export const CINEMATIC_SPEAK_TIMINGS = ["auto", "fixed"] as const;
export const CINEMATIC_SPEAKER_SIDES = ["left", "right"] as const;
/** Portrait expressions besides the required `neutral` one. */
export const CINEMATIC_SPEAKER_EXPRESSIONS = ["happy", "worried", "angry", "surprised"] as const;
/** Mirrors the client's WeatherState (src/app/weather-states.ts); the shared package cannot import the client. */
export const CINEMATIC_WEATHER_STATES = ["clear", "cloudy", "rain", "snow", "storm"] as const;

/** Section 3.6: auto line duration = base + characters × msPerChar, clamped per page. */
export const SPEAK_BASE_MS = 2000;
export const SPEAK_MS_PER_CHAR = 60;
export const SPEAK_MIN_MS = 2500;
export const SPEAK_MAX_MS = 12_000;
/** Longer lines are paged at sentence boundaries (and warned about in the editor). */
export const SPEAK_PAGE_MAX_CHARS = 140;
/** The player's "Dialogue speed" setting multiplies only the per-character time. */
export const DIALOGUE_SPEED_MS_PER_CHAR = Object.freeze({ fast: 45, normal: SPEAK_MS_PER_CHAR, slow: 75 });

/** Validation limits (section 2.6). */
export const CINEMATIC_MAX_SEQUENCE_MS = 120_000;
/** A sequence that keeps the world running longer than this lets the enemy act while the player has no input. */
export const CINEMATIC_RUNNING_WORLD_WARNING_MS = 20_000;

/** Shot pitch range, mirroring MIN_PITCH / MAX_PITCH of the client's render-common/camera-state.ts. */
export const CINEMATIC_MIN_PITCH = (12 * Math.PI) / 180;
export const CINEMATIC_MAX_PITCH = (85 * Math.PI) / 180;
/** Minimal and touch devices clamp shots to at least this pitch (section 6); flatter shots get a warning. */
export const CINEMATIC_MINIMAL_MIN_PITCH = (30 * Math.PI) / 180;

/** Structural limits of stored cinematic data: they bound documents, not gameplay. */
export const CINEMATIC_LIMITS = Object.freeze({
  cameraShots: 200,
  lightningStrikes: 20,
  maxDistance: 10_000,
  maxFieldOfView: Math.PI,
  maxShakeStrength: 1,
  maxStepMs: 600_000,
  sequences: 100,
  speakers: 50,
  stepsPerSequence: 200
});
