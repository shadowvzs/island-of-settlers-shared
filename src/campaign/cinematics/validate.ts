import { CAMPAIGN_DEFAULT_LANGUAGES } from "../campaign-constants.ts";
import { campaignIssue, type CampaignIssue, campaignValidationResult } from "../campaign-issues.ts";
import type { CampaignMap } from "../campaign-model.ts";
import {
  type CampaignReadyContext, type CampaignReadyRun, checkDuplicates, checkRegionReferences, checkTranslations,
  createReadyRun
} from "../campaign-ready-context.ts";
import { regionReferences } from "../campaign-region-library.ts";
import {
  CINEMATIC_MAX_SEQUENCE_MS, CINEMATIC_MINIMAL_MIN_PITCH, CINEMATIC_RUNNING_WORLD_WARNING_MS
} from "./constants.ts";
import { type CinematicStepTiming, scheduleSequence, sequenceDurationMs } from "./schedule.ts";
import type { CampaignSpeaker, CinematicSequence, CinematicStepKind } from "./types.ts";
import { checkStep, type SequenceWalk } from "./validate-steps.ts";

/** Steps that move the camera; two of them must never run at the same time. */
const CAMERA_KINDS: ReadonlySet<CinematicStepKind> = new Set(["camera", "cameraFollow"]);
const MS_PER_SECOND = 1000;
const toSeconds = (ms: number) => Math.round(ms / (MS_PER_SECOND / 10)) / 10;

const overlaps = (first: CinematicStepTiming, second: CinematicStepTiming) => first.startMs === second.startMs ||
  (first.startMs < second.endMs && second.startMs < first.endMs);

/** Index pairs "first:second" of camera steps whose scheduled intervals overlap. */
const overlappingCameraPairs = (sequence: CinematicSequence, timings: readonly CinematicStepTiming[]) => {
  const cameraIndexes = sequence.steps.flatMap((step, index) => CAMERA_KINDS.has(step.kind) ? [index] : []);
  const pairs: string[] = [];
  cameraIndexes.forEach((first, position) => {
    for (const second of cameraIndexes.slice(position + 1)) {
      const a = timings[first], b = timings[second];
      if (a && b && overlaps(a, b)) pairs.push(`${first}:${second}`);
    }
  });
  return pairs;
};

/** Length and camera overlaps over every validated language (speak durations differ per language). */
const checkTiming = (run: CampaignReadyRun, sequence: CinematicSequence, path: string) => {
  const languages = new Set(["en", ...(run.context.languages ?? CAMPAIGN_DEFAULT_LANGUAGES)]);
  const pairs = new Set<string>();
  let longestMs = 0;
  for (const language of languages) {
    const timings = scheduleSequence(sequence.steps, { language });
    longestMs = Math.max(longestMs, sequenceDurationMs(timings));
    for (const pair of overlappingCameraPairs(sequence, timings)) pairs.add(pair);
  }
  for (const pair of pairs) {
    const [first = 0, second = 0] = pair.split(":").map(Number);
    run.issues.push(campaignIssue("error", "overlappingCameraSteps", `${path}.steps[${second}]`,
      { first: sequence.steps[first]?.id ?? "", second: sequence.steps[second]?.id ?? "" }));
  }
  const params = { seconds: toSeconds(longestMs), sequenceId: sequence.id };
  if (longestMs > CINEMATIC_MAX_SEQUENCE_MS) run.issues.push(campaignIssue("error", "sequenceTooLong", path,
    { ...params, limit: toSeconds(CINEMATIC_MAX_SEQUENCE_MS) }));
  if (!sequence.pauseWorld && longestMs > CINEMATIC_RUNNING_WORLD_WARNING_MS)
    run.issues.push(campaignIssue("warning", "longRunningSequence", path, params));
};

type WalkBase = Pick<SequenceWalk, "run" | "shotIds" | "speakers">;

const checkSequence = (run: CampaignReadyRun, sequence: CinematicSequence, path: string, walkBase: WalkBase) => {
  checkDuplicates(run, sequence.steps.map(step => step.id), `${path}.steps`);
  const walk: SequenceWalk = { ...walkBase, cinematicMode: false, sequence, spawned: new Map() };
  sequence.steps.forEach((step, index) => checkStep(walk, step, `${path}.steps[${index}]`));
  checkTiming(run, sequence, path);
};

const checkShots = (run: CampaignReadyRun) => {
  const shots = run.map.cameraShots ?? [];
  checkDuplicates(run, shots.map(shot => shot.id), "cameraShots");
  shots.forEach((shot, index) => {
    if (shot.pitch < CINEMATIC_MINIMAL_MIN_PITCH)
      run.issues.push(campaignIssue("warning", "shotBelowMinimalPitch", `cameraShots[${index}].pitch`,
        { shotId: shot.id }));
  });
};

/** Map hooks, quest hooks and exit epilogues must name existing sequences. */
const checkHooks = (run: CampaignReadyRun, sequenceIds: ReadonlySet<string>) => {
  const { defeatSequenceId, exits, quests, startSequenceId, victorySequenceId } = run.map;
  const hooks: [string | undefined, string][] = [[startSequenceId, "startSequenceId"],
    [victorySequenceId, "victorySequenceId"], [defeatSequenceId, "defeatSequenceId"]];
  quests.forEach((quest, index) => hooks.push([quest.startSequenceId, `quests[${index}].startSequenceId`],
    [quest.completeSequenceId, `quests[${index}].completeSequenceId`]));
  exits?.forEach((exit, index) => hooks.push([exit.victorySequenceId, `exits[${index}].victorySequenceId`]));
  for (const [sequenceId, path] of hooks)
    if (sequenceId !== undefined && !sequenceIds.has(sequenceId))
      run.issues.push(campaignIssue("error", "missingSequenceReference", path, { sequenceId }));
};

const speakerMap = (speakers: readonly CampaignSpeaker[] | undefined) =>
  speakers ? new Map(speakers.map(speaker => [speaker.id, speaker])) : null;

/**
 * Cinematics checks of the Ready validation (plan section 2.6): references (shot, region, speaker, actor, cue,
 * sequence), mode-bound steps outside cinematic mode, walking in a paused world, overlapping camera steps, spawned
 * unit types, weather vs season, sequence length; warnings for long running-world sequences, long lines, missing
 * translations and shots flatter than the Minimal clamp. Pure and deterministic.
 */
export const checkCinematics = (run: CampaignReadyRun) => {
  const sequences = run.map.sequences ?? [];
  checkShots(run);
  checkDuplicates(run, sequences.map(sequence => sequence.id), "sequences");
  const walkBase = {
    run,
    shotIds: new Set((run.map.cameraShots ?? []).map(shot => shot.id)),
    speakers: speakerMap(run.context.speakers)
  };
  sequences.forEach((sequence, index) => checkSequence(run, sequence, `sequences[${index}]`, walkBase));
  checkHooks(run, new Set(sequences.map(sequence => sequence.id)));
};

/** The cinematics checks alone (the editor's step list); Ready runs them inside validateCampaignMapReady. */
export const validateSequences = (map: CampaignMap, context: CampaignReadyContext) => {
  const run = createReadyRun(map, context);
  checkCinematics(run);
  checkRegionReferences(run, regionReferences(map).filter(reference => reference.user.kind === "sequence"));
  return campaignValidationResult(run.issues);
};

/** Campaign-level speaker checks: unique ids, translated names, portrait images that exist. */
export const checkSpeakers = (
  run: { context: Partial<Pick<CampaignReadyContext, "imageIds" | "languages">>; issues: CampaignIssue[] },
  speakers: readonly CampaignSpeaker[]
) => {
  checkDuplicates(run, speakers.map(speaker => speaker.id), "speakers");
  const { imageIds } = run.context;
  speakers.forEach((speaker, index) => {
    const path = `speakers[${index}]`;
    checkTranslations(run, speaker.name, `${path}.name`);
    if (!imageIds) return;
    for (const [expression, imageId] of Object.entries(speaker.portraits))
      if (imageId !== undefined && !imageIds.has(imageId)) run.issues.push(campaignIssue("error",
        "missingPortraitImage", `${path}.portraits.${expression}`, { imageId }));
  });
};
