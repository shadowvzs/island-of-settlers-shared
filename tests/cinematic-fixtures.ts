import type {
  CameraShot, CampaignSpeaker, CinematicSequence, CinematicStep
} from "../src/campaign/cinematics/types.ts";

/** Shared cinematics fixtures: the owner example of plan section 2.5 on the readyMap fixture's areas. */
export const ADVISOR_LINE = "Look at the ridge. Bandits gather there now.";
export const ADVISOR_LINE_HU = "Nézd a gerincet! Ott gyülekeznek most a banditák.";

export const advisor = (overrides: Partial<CampaignSpeaker> = {}): CampaignSpeaker => ({
  id: "advisor",
  name: { en: "Advisor", hu: "Tanácsadó" },
  portraits: { neutral: "image-intro" },
  ...overrides
});

export const shot = (id: string, overrides: Partial<CameraShot> = {}): CameraShot => ({
  distance: 40,
  id,
  name: `Shot ${id}`,
  pitch: Math.PI / 4,
  targetX: 10,
  targetZ: 12,
  yaw: 0,
  ...overrides
});

export const ownerExampleSteps = (): CinematicStep[] => [
  { delayMs: 0, id: "s1", kind: "cinematicMode", letterbox: true, on: true, start: "afterPrevious",
    transitionMs: 500 },
  { delayMs: 1000, ease: "easeInOut", id: "s2", kind: "camera", shotId: "shot-a", start: "afterPrevious",
    transitionMs: 2000 },
  { delayMs: 1000, facing: Math.PI / 2, id: "s3", kind: "spawn", regionId: "region-1", start: "afterPrevious",
    actorRef: "bandit", object: { count: 3, grantToPlayer: false, kind: "unit", unitType: "shield" } },
  { delayMs: 1000, id: "s4", kind: "speak", speakerId: "advisor", start: "afterPrevious",
    text: { en: ADVISOR_LINE, hu: ADVISOR_LINE_HU }, timing: "auto" },
  { count: 1, delayMs: 1000, id: "s5", kind: "lightning", regionId: "region-1", start: "afterPrevious" },
  { delayMs: 0, id: "s6", kind: "weather", start: "withPrevious", state: "storm", transitionMs: 3000 },
  { delayMs: 1000, drift: { distanceTo: 30, durationMs: 6000, ease: "linear" }, ease: "easeInOut", id: "s7",
    kind: "camera", shotId: "shot-b", start: "afterPrevious", transitionMs: 3000 },
  { delayMs: 0, id: "s8", kind: "cinematicMode", letterbox: true, on: false, start: "afterPrevious",
    transitionMs: 500 }
];

export const sequence = (id: string, overrides: Partial<CinematicSequence> = {}): CinematicSequence => ({
  id,
  name: `Sequence ${id}`,
  pauseWorld: true,
  skippable: true,
  steps: ownerExampleSteps(),
  ...overrides
});

/** Wraps `steps` in cinematic mode on/off so mode-bound steps are valid. */
export const inCinematicMode = (steps: CinematicStep[]): CinematicStep[] => [
  { delayMs: 0, id: "mode-on", kind: "cinematicMode", letterbox: false, on: true, start: "afterPrevious",
    transitionMs: 0 },
  ...steps,
  { delayMs: 0, id: "mode-off", kind: "cinematicMode", letterbox: false, on: false, start: "afterPrevious",
    transitionMs: 0 }
];
