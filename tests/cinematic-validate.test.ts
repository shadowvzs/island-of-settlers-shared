import assert from "node:assert/strict";
import test from "node:test";

import { BuildingType } from "../src/building-types.ts";
import { type CampaignIssue, formatCampaignIssue } from "../src/campaign/campaign-issues.ts";
import type { CampaignMap } from "../src/campaign/campaign-model.ts";
import type { CampaignReadyContext } from "../src/campaign/campaign-ready-validation.ts";
import { validateCampaignMapReady, validateCampaignReady } from "../src/campaign/campaign-ready-validation.ts";
import { checkCampaignMapShape, checkCampaignShape } from "../src/campaign/campaign-shape.ts";
import type { CinematicSequence, CinematicStep, CinematicStepOf } from "../src/campaign/cinematics/types.ts";
import { validateSequences } from "../src/campaign/cinematics/validate.ts";
import { quest, readyCampaign, readyContext, readyMap } from "./campaign-fixtures.ts";
import { advisor, inCinematicMode, sequence, shot } from "./cinematic-fixtures.ts";

const summary = (issues: CampaignIssue[]) => issues.map(issue => `${issue.code}@${issue.path}`);

const cinematicMap = (overrides: Partial<CampaignMap> = {}) => readyMap({
  cameraShots: [shot("shot-a"), shot("shot-b")],
  quests: [quest("q-intro", { completeSequenceId: "intro", startSequenceId: "intro" })],
  sequences: [sequence("intro")],
  startSequenceId: "intro",
  ...overrides
});
const cinematicContext = (overrides: Partial<CampaignReadyContext> = {}) =>
  readyContext({ speakers: [advisor()], ...overrides });

/** Validates one sequence of `steps` on the cinematic map. */
const check = (
  steps: CinematicStep[], sequenceOverrides: Partial<CinematicSequence> = {},
  context: Partial<CampaignReadyContext> = {}, mapOverrides: Partial<CampaignMap> = {}
) => validateSequences(cinematicMap({ sequences: [sequence("intro", { steps, ...sequenceOverrides })],
  ...mapOverrides }), cinematicContext(context));

const camera = (id: string, start: CinematicStep["start"] = "afterPrevious"): CinematicStepOf<"camera"> =>
  ({ delayMs: 0, ease: "linear", id, kind: "camera", shotId: "shot-a", start, transitionMs: 1000 });
const speak = (text: Record<string, string> & { en: string }, extra: object = {}): CinematicStepOf<"speak"> =>
  ({ delayMs: 0, id: "line", kind: "speak", speakerId: "advisor", start: "afterPrevious", text, timing: "auto",
    ...extra });
const walk = (actorRef: string): CinematicStep => ({ actorRef, delayMs: 0, id: "walk", kind: "walk",
  regionId: "region-1", start: "afterPrevious", timeoutMs: 5000, waitUntilArrived: true });
const spawnUnit = (unitType: string, grantToPlayer: boolean, actorRef = "unit"): CinematicStep => ({ actorRef,
  delayMs: 0, id: `spawn-${actorRef}`, kind: "spawn", object: { count: 2, grantToPlayer, kind: "unit", unitType },
  regionId: "region-1", start: "afterPrevious" });
const fade = (durationMs: number): CinematicStep =>
  ({ delayMs: 0, durationMs, id: "fade", kind: "fade", start: "afterPrevious", to: "black" });

test("the owner example on a Ready map passes without errors or warnings", () => {
  const result = validateCampaignMapReady(cinematicMap(), cinematicContext());
  assert.deepEqual(result, { errors: [], ready: true, warnings: [] });
  assert.equal(checkCampaignMapShape({ ...cinematicMap(), revision: 1 }).length, 0);
});

test("unknown shot, region, speaker, actor, cue and sequence references are errors", () => {
  const steps = inCinematicMode([
    { ...camera("cam"), drift: { durationMs: 100, ease: "linear", targetToRegionId: "region-gone" }, shotId: "x" },
    { ...speak({ en: "Hi", hu: "Szia" }), speakerId: "ghost" },
    { actorRef: "nobody", delayMs: 0, facing: 0, id: "face", kind: "face", start: "afterPrevious" },
    { cueId: "boom", delayMs: 0, id: "sound", kind: "sound", start: "afterPrevious" },
    { delayMs: 0, fadeMs: 0, id: "music", kind: "music", start: "afterPrevious", trackId: "theme" },
    { delayMs: 0, id: "glint", kind: "highlight", on: true, regionId: "region-gone", start: "afterPrevious" }
  ]);
  const map = { quests: [quest("q-intro", { startSequenceId: "gone" })], victorySequenceId: "gone" };
  const context = { actorIds: new Set(["guard"]), musicTrackIds: new Set(["calm"]), soundCueIds: new Set(["bell"]) };
  assert.deepEqual(summary(check(steps, {}, context, map).errors), [
    "missingShotReference@sequences[0].steps[1].shotId",
    "missingSpeakerReference@sequences[0].steps[2].speakerId",
    "missingActorReference@sequences[0].steps[3].actorRef",
    "missingCueReference@sequences[0].steps[4].cueId",
    "missingCueReference@sequences[0].steps[5].trackId",
    "missingSequenceReference@victorySequenceId",
    "missingSequenceReference@quests[0].startSequenceId",
    "missingRegionReference@sequences[0].steps[1].drift.targetToRegionId",
    "missingRegionReference@sequences[0].steps[6].regionId"
  ]);
  const known = { ...context, actorIds: new Set(["nobody"]), musicTrackIds: new Set(["theme"]),
    soundCueIds: new Set(["boom"]) };
  const fixed = inCinematicMode([camera("cam"), speak({ en: "Hi", hu: "Szia" }),
    { actorRef: "nobody", delayMs: 0, facing: 0, id: "face", kind: "face", start: "afterPrevious" }]);
  assert.deepEqual(check(fixed, {}, known).errors, []);
});

test("camera, speak and walk steps need cinematic mode on", () => {
  const steps: CinematicStep[] = [camera("cam"), speak({ en: "Hi", hu: "Szia" }), spawnUnit("shield", false),
    walk("unit")];
  assert.deepEqual(summary(check(steps, { pauseWorld: false }).errors), [
    "stepOutsideCinematicMode@sequences[0].steps[0]",
    "stepOutsideCinematicMode@sequences[0].steps[1]",
    "stepOutsideCinematicMode@sequences[0].steps[3]"
  ]);
  assert.deepEqual(check(inCinematicMode(steps), { pauseWorld: false }).errors, []);
  const afterOff = [...inCinematicMode([]), camera("late")];
  assert.deepEqual(summary(check(afterOff).errors), ["stepOutsideCinematicMode@sequences[0].steps[2]"]);
  assert.deepEqual(check([fade(500)]).errors, []);
});

test("a walk step needs a running world and a unit actor", () => {
  const ware: CinematicStep = { actorRef: "pile", delayMs: 0, id: "pile", kind: "spawn", regionId: "region-1",
    object: { amount: 5, grantToPlayer: true, kind: "ware", ware: "planks" }, start: "afterPrevious" };
  const steps = inCinematicMode([spawnUnit("shield", false), walk("unit")]);
  assert.deepEqual(summary(check(steps).errors), ["walkInPausedSequence@sequences[0].steps[2]"]);
  assert.deepEqual(check(steps, { pauseWorld: false }).errors, []);
  assert.deepEqual(summary(check(inCinematicMode([ware, walk("pile")]), { pauseWorld: false }).errors),
    ["actorNotUnit@sequences[0].steps[2].actorRef"]);
  const beforeSpawn = inCinematicMode([walk("unit"), spawnUnit("shield", false)]);
  assert.deepEqual(summary(check(beforeSpawn, { pauseWorld: false }, { actorIds: new Set() }).errors),
    ["missingActorReference@sequences[0].steps[1].actorRef"]);
});

test("two camera steps running at the same time are an error", () => {
  const parallel = inCinematicMode([camera("one"), camera("two", "withPrevious")]);
  assert.deepEqual(summary(check(parallel).errors), ["overlappingCameraSteps@sequences[0].steps[2]"]);
  assert.equal(check(parallel).errors[0]?.params.first, "one");
  assert.deepEqual(check(inCinematicMode([camera("one"), camera("two")])).errors, []);
  const follow: CinematicStep = { actorRef: "unit", delayMs: 500, durationMs: 2000, id: "follow",
    kind: "cameraFollow", start: "withPrevious" };
  const following = inCinematicMode([spawnUnit("shield", false), camera("one"), follow]);
  assert.deepEqual(summary(check(following).errors), ["overlappingCameraSteps@sequences[0].steps[3]"]);
});

test("spawned unit types must be known, and granted units trainable on the map", () => {
  const banned = { disabledBuildings: [{ buildingType: BuildingType.Barracks, maxLevel: null }] };
  assert.deepEqual(summary(check([spawnUnit("cavalry", false)]).errors),
    ["unknownUnitType@sequences[0].steps[0].object.unitType"]);
  assert.deepEqual(summary(check([spawnUnit("shield", true)], {}, {}, banned).errors),
    ["blacklistedUnitType@sequences[0].steps[0].object.unitType"]);
  assert.deepEqual(check([spawnUnit("shield", false)], {}, {}, banned).errors, []);
  assert.deepEqual(check([spawnUnit("shield", true)]).errors, []);
  assert.deepEqual(check([spawnUnit("settler", true)], {}, { unitTypes: new Set(["settler"]) }).errors, []);
  const unknownWare: CinematicStep = { delayMs: 0, id: "pile", kind: "spawn", regionId: "region-1",
    object: { amount: 5, grantToPlayer: false, kind: "ware", ware: "unobtainium" }, start: "afterPrevious" };
  assert.deepEqual(summary(check([unknownWare]).errors), ["unknownWare@sequences[0].steps[0].object.ware"]);
  assert.deepEqual(summary(check([spawnUnit("shield", false, "a"), spawnUnit("heavy", false, "a")]).errors),
    ["duplicateId@sequences[0].steps", "duplicateId@sequences[0].steps[1].actorRef"]);
});

test("weather steps follow the season rule of the map start", () => {
  const snow: CinematicStep = { delayMs: 0, id: "snow", kind: "weather", start: "afterPrevious", state: "snow",
    transitionMs: 1000 };
  assert.deepEqual(summary(check([snow]).warnings), ["weatherSeasonMismatch@sequences[0].steps[0].state"]);
  const winter = { start: { hour: 8, season: "winter" as const, weather: "clear" as const } };
  assert.deepEqual(check([snow], {}, {}, winter).warnings, []);
});

test("sequences above 120 s are errors; running-world sequences above 20 s are warnings", () => {
  assert.deepEqual(summary(check([fade(120_001)]).errors), ["sequenceTooLong@sequences[0]"]);
  assert.deepEqual(check([fade(120_000)]).errors, []);
  assert.deepEqual(summary(check([fade(20_001)], { pauseWorld: false }).warnings),
    ["longRunningSequence@sequences[0]"]);
  assert.deepEqual(check([fade(20_001)]).warnings, []);
  assert.deepEqual(check([fade(20_000)], { pauseWorld: false }).warnings, []);
  const issue = check([fade(120_001)]).errors[0];
  assert.ok(issue);
  assert.equal(formatCampaignIssue(issue, "en"), "Sequence intro lasts 120 s; at most 120 s are allowed.");
  assert.equal(formatCampaignIssue(issue, "hu"), "A(z) intro jelenet 120 mp hosszú; legfeljebb 120 mp megengedett.");
});

test("speak lines: long lines and missing translations warn, missing English and fixed without time fail", () => {
  const long = "x".repeat(141);
  const result = check(inCinematicMode([speak({ en: long, hu: "Rövid." })]));
  assert.deepEqual(summary(result.warnings), ["speakLineTooLong@sequences[0].steps[1].text.en"]);
  assert.deepEqual(summary(check(inCinematicMode([speak({ en: "Hi" })])).warnings),
    ["missingTranslation@sequences[0].steps[1].text"]);
  assert.deepEqual(summary(check(inCinematicMode([speak({ en: " ", hu: "Szia" })])).errors),
    ["missingFallbackText@sequences[0].steps[1].text"]);
  assert.deepEqual(summary(check(inCinematicMode([speak({ en: "Hi", hu: "Szia" }, { timing: "fixed" })])).errors),
    ["invalidField@sequences[0].steps[1].durationMs"]);
  assert.deepEqual(check(inCinematicMode([speak({ en: "Hi", hu: "Szia" }, { durationMs: 900, timing: "fixed" })]))
    .errors, []);
  assert.deepEqual(summary(check(inCinematicMode([speak({ en: "Hi", hu: "Szia" }, { expression: "angry" })]))
    .warnings), ["missingSpeakerExpression@sequences[0].steps[1].expression"]);
});

test("shots flatter than the Minimal clamp warn; duplicate shot and sequence ids fail", () => {
  const map = cinematicMap({ cameraShots: [shot("shot-a", { pitch: 0.3 }), shot("shot-b"), shot("shot-b")],
    sequences: [sequence("intro"), sequence("intro")] });
  const result = validateSequences(map, cinematicContext());
  assert.deepEqual(summary(result.errors), ["duplicateId@cameraShots", "duplicateId@sequences"]);
  assert.deepEqual(summary(result.warnings), ["shotBelowMinimalPitch@cameraShots[0].pitch"]);
});

test("hidden quests need no title or text; visible ones still do", () => {
  const blank = { text: { en: "" }, title: { en: "" } };
  const hidden = validateCampaignMapReady(cinematicMap({ quests: [quest("q-hidden", { ...blank, hidden: true })] }),
    cinematicContext());
  assert.deepEqual(hidden.errors, []);
  const visible = validateCampaignMapReady(cinematicMap({ quests: [quest("q-shown", blank)] }), cinematicContext());
  assert.deepEqual(summary(visible.errors),
    ["missingFallbackText@quests[0].title", "missingFallbackText@quests[0].text"]);
});

test("a speak step may name a script actor with a display name instead of a campaign speaker", () => {
  const line = { ...speak({ en: "Hand over the cargo!", hu: "Ide a rakománnyal!" }), speakerId: "actor-1" };
  const unknown = "missingSpeakerReference@sequences[0].steps[1].speakerId";
  assert.deepEqual(summary(check(inCinematicMode([line])).errors), [unknown]);
  assert.deepEqual(summary(check(inCinematicMode([line]), {}, { namedActorIds: new Set(["actor-2"]) }).errors),
    [unknown]);
  const named = check(inCinematicMode([{ ...line, expression: "angry" }]), {},
    { namedActorIds: new Set(["actor-1"]) });
  assert.deepEqual([summary(named.errors), summary(named.warnings)], [[], []]);
});

test("campaign speakers: unique ids, translated names, existing portrait images", () => {
  const portraits = { angry: "gone", neutral: "image-intro" };
  const speakers = [advisor(), advisor({ name: { en: "Advisor" }, portraits })];
  const result = validateCampaignReady(readyCampaign({ speakers }), [readyMap()],
    { imageIds: new Set(["image-1", "image-intro"]) });
  assert.deepEqual(summary(result.errors),
    ["duplicateId@speakers", "missingPortraitImage@speakers[1].portraits.angry"]);
  assert.deepEqual(summary(result.warnings), ["missingTranslation@speakers[1].name"]);
  assert.equal(validateCampaignReady(readyCampaign({ speakers: [advisor()] }), [readyMap()]).ready, true);
});

test("stored shapes accept the cinematic fields and reject malformed steps and speakers", () => {
  const stored = { ...cinematicMap(), revision: 1 };
  assert.deepEqual(checkCampaignMapShape({ ...stored, quests: [quest("q", { hidden: true })] }), []);
  const badStep = { ...camera("cam"), ease: "bounce" };
  const badMap = { ...stored, cameraShots: [shot("low", { pitch: 0.01 })],
    sequences: [{ ...sequence("intro"), steps: [badStep, { ...fade(10), extra: 1 }] }] };
  assert.deepEqual(summary(checkCampaignMapShape(badMap)), [
    "invalidField@map.cameraShots[0].pitch",
    "invalidField@map.sequences[0].steps[0].ease",
    "invalidField@map.sequences[0].steps[1].extra"
  ]);
  assert.deepEqual(checkCampaignShape(readyCampaign({ speakers: [advisor()] })), []);
  const badSpeaker = advisor({ portraits: { neutral: "" }, side: "middle" as "left" });
  assert.deepEqual(summary(checkCampaignShape(readyCampaign({ speakers: [badSpeaker] }))),
    ["invalidField@campaign.speakers[0].portraits.neutral", "invalidField@campaign.speakers[0].side"]);
});
