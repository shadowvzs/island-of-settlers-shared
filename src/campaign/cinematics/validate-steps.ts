import { CAMPAIGN_DEFAULT_LANGUAGES, CAMPAIGN_SOLDIER_TYPES, CAMPAIGN_WEATHERS } from "../campaign-constants.ts";
import { campaignIssue, type CampaignIssueCode } from "../campaign-issues.ts";
import type { CampaignSoldierType, CampaignWeather } from "../campaign-model.ts";
import {
  type CampaignReadyRun, checkTranslations, checkWeather, isSoldierTypeTrainable
} from "../campaign-ready-context.ts";
import { SPEAK_PAGE_MAX_CHARS } from "./constants.ts";
import { speakCharacterCount } from "./speak-timing.ts";
import type {
  CampaignSpeaker, CinematicSequence, CinematicStep, CinematicStepKind, CinematicStepOf, SpawnObject
} from "./types.ts";

/** State of one pass over a sequence's steps in list order. */
export interface SequenceWalk {
  cinematicMode: boolean;
  readonly run: CampaignReadyRun;
  readonly sequence: CinematicSequence;
  readonly shotIds: ReadonlySet<string>;
  /** Actors spawned by earlier steps of this sequence, with what they are. */
  readonly spawned: Map<string, SpawnObject["kind"]>;
  readonly speakers: ReadonlyMap<string, CampaignSpeaker> | null;
}

type StepCheck<K extends CinematicStepKind> = (walk: SequenceWalk, step: CinematicStepOf<K>, path: string) => void;

/** Steps that drive the camera, the dialogue or units: they would fight player input outside cinematic mode. */
const MODE_BOUND_KINDS: ReadonlySet<CinematicStepKind> = new Set(["camera", "cameraFollow", "cameraShake", "speak",
  "walk"]);

const report = (walk: SequenceWalk, severity: "error" | "warning", code: CampaignIssueCode, path: string,
  params: Readonly<Record<string, string | number>> = {}) => {
  walk.run.issues.push(campaignIssue(severity, code, path, params));
};

/** Spawned earlier in the sequence, or an authored unit (only checked when the context lists them). */
const checkActor = (walk: SequenceWalk, actorRef: string, path: string, needsUnit: boolean) => {
  const spawnedKind = walk.spawned.get(actorRef);
  if (spawnedKind !== undefined) {
    if (needsUnit && spawnedKind !== "unit") report(walk, "error", "actorNotUnit", path, { actorRef });
    return;
  }
  const authored = walk.run.context.actorIds;
  if (authored && !authored.has(actorRef)) report(walk, "error", "missingActorReference", path, { actorRef });
};

const checkCue = (walk: SequenceWalk, known: ReadonlySet<string> | undefined, cueId: string, path: string) => {
  if (known && !known.has(cueId)) report(walk, "error", "missingCueReference", path, { cueId });
};

const checkSpeakerExpression = (walk: SequenceWalk, step: CinematicStepOf<"speak">, path: string) => {
  if (!walk.speakers) return;
  const speaker = walk.speakers.get(step.speakerId);
  // A named script actor (a pirate captain, a bandit chief) speaks under its display name, without expressions.
  if (!speaker && walk.run.context.namedActorIds?.has(step.speakerId)) return;
  if (!speaker) {
    report(walk, "error", "missingSpeakerReference", `${path}.speakerId`, { speakerId: step.speakerId });
    return;
  }
  const { expression } = step;
  if (expression && !speaker.portraits[expression]) report(walk, "warning", "missingSpeakerExpression",
    `${path}.expression`, { expression, speakerId: step.speakerId });
};

const checkSpeak: StepCheck<"speak"> = (walk, step, path) => {
  checkSpeakerExpression(walk, step, path);
  if (step.timing === "fixed" && step.durationMs === undefined)
    walk.run.issues.push(campaignIssue("error", "invalidField", `${path}.durationMs`));
  checkTranslations(walk.run, step.text, `${path}.text`);
  const languages = walk.run.context.languages ?? CAMPAIGN_DEFAULT_LANGUAGES;
  for (const language of new Set(["en", ...languages])) {
    const length = speakCharacterCount(step.text[language] ?? "");
    if (length > SPEAK_PAGE_MAX_CHARS) report(walk, "warning", "speakLineTooLong", `${path}.text.${language}`,
      { language, length, limit: SPEAK_PAGE_MAX_CHARS });
  }
};

const isSoldierType = (unitType: string): unitType is CampaignSoldierType =>
  (CAMPAIGN_SOLDIER_TYPES as readonly string[]).includes(unitType);

const checkSpawnObject = (walk: SequenceWalk, object: SpawnObject, path: string) => {
  if (object.kind === "ware" && !walk.run.context.wares.has(object.ware))
    report(walk, "error", "unknownWare", `${path}.ware`, { ware: object.ware });
  if (object.kind !== "unit") return;
  const { grantToPlayer, unitType } = object;
  const known = walk.run.context.unitTypes ?? new Set<string>(CAMPAIGN_SOLDIER_TYPES);
  if (!known.has(unitType)) { report(walk, "error", "unknownUnitType", `${path}.unitType`, { unitType }); return; }
  if (grantToPlayer && isSoldierType(unitType) && !isSoldierTypeTrainable(walk.run, unitType))
    report(walk, "error", "blacklistedUnitType", `${path}.unitType`, { unitType });
};

const checkSpawn: StepCheck<"spawn"> = (walk, step, path) => {
  checkSpawnObject(walk, step.object, `${path}.object`);
  if (step.actorRef === undefined) return;
  if (walk.spawned.has(step.actorRef)) report(walk, "error", "duplicateId", `${path}.actorRef`, { id: step.actorRef });
  walk.spawned.set(step.actorRef, step.object.kind);
};

const checkWalk: StepCheck<"walk"> = (walk, step, path) => {
  if (walk.sequence.pauseWorld)
    report(walk, "error", "walkInPausedSequence", path, { sequenceId: walk.sequence.id });
  checkActor(walk, step.actorRef, `${path}.actorRef`, true);
};

const checkCamera: StepCheck<"camera"> = (walk, step, path) => {
  if (!walk.shotIds.has(step.shotId))
    report(walk, "error", "missingShotReference", `${path}.shotId`, { shotId: step.shotId });
};

const isCampaignWeather = (state: string): state is CampaignWeather =>
  (CAMPAIGN_WEATHERS as readonly string[]).includes(state);

const STEP_CHECKS: { readonly [K in CinematicStepKind]?: StepCheck<K> } = {
  camera: checkCamera,
  cameraFollow: (walk, step, path) => checkActor(walk, step.actorRef, `${path}.actorRef`, false),
  cinematicMode: (walk, step) => { walk.cinematicMode = step.on; },
  face: (walk, step, path) => checkActor(walk, step.actorRef, `${path}.actorRef`, true),
  music: (walk, step, path) => {
    if (step.trackId !== null) checkCue(walk, walk.run.context.musicTrackIds, step.trackId, `${path}.trackId`);
  },
  sound: (walk, step, path) => checkCue(walk, walk.run.context.soundCueIds, step.cueId, `${path}.cueId`),
  spawn: checkSpawn,
  speak: checkSpeak,
  walk: checkWalk,
  weather: (walk, step, path) => {
    if (isCampaignWeather(step.state)) checkWeather(walk.run, step.state, walk.run.map.start.season, `${path}.state`);
  }
};

/**
 * Reference, mode and ownership checks of one step; `walk` carries the mode and spawned actors forward. Region
 * references are checked once per map through `regionReferences`.
 */
export const checkStep = (walk: SequenceWalk, step: CinematicStep, path: string) => {
  if (MODE_BOUND_KINDS.has(step.kind) && !walk.cinematicMode)
    report(walk, "error", "stepOutsideCinematicMode", path, { kind: step.kind });
  const check = STEP_CHECKS[step.kind] as StepCheck<typeof step.kind> | undefined;
  check?.(walk, step as never, path);
};
