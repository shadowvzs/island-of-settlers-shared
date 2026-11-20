import assert from "node:assert/strict";
import { test } from "node:test";

import {
  base64ByteLength, checkMapAudioAssets, MAP_AUDIO_LIMITS, type MapAudioAsset, mapAudioAssetKinds,
  mapAudioAssetRefusal
} from "../src/script/audio.ts";
import { hashScriptRunState } from "../src/script/engine/hash.ts";
import { formatScriptIssue } from "../src/script/issues.ts";
import { validateMapScript } from "../src/script/validate.ts";
import { createEngine, createFakeWorld, runTicks } from "./script-engine-fixtures.ts";
import { doStep, emptyScript, num, str, trigger } from "./script-fixtures.ts";

/** AUDIO-CATALOG: typed audio slots, their Ready rules, uploaded map audio limits and the presentation effects. */

const catalogRef = (id: string) => ({ id, kind: "catalog" as const });
const uploadRef = (assetId: string) => ({ assetId, kind: "upload" as const });
const scriptOf = (...actions: ReturnType<typeof doStep>[]) => emptyScript({ triggers: [trigger("t1", { actions })] });
const codesOf = (script: unknown, audioAssets?: ReadonlyMap<string, "music" | "sound">) => {
  const result = validateMapScript(script, { audioAssets, mapKind: "home" });
  return [...result.errors, ...result.warnings].map(issue => `${issue.code}@${issue.path.replace(/^.*args\./, "")}`);
};
const asset = (fields: Partial<MapAudioAsset> = {}): MapAudioAsset => ({
  data: "AAAA", durationSeconds: 2, id: "audio-1", kind: "sound", mimeType: "audio/ogg", name: "Horn", ...fields
});

test("audio slots accept catalog entries of their kind and every option", () => {
  assert.deepEqual(codesOf(scriptOf(
    doStep("s1", "playSound", { cue: catalogRef("sound:thunder"), volume: num(0.5) }),
    doStep("s2", "playMusic", { fadeInSeconds: num(2), fadeOutSeconds: num(0), mode: str("once"),
      track: catalogRef("music:harbour-lanterns"), volume: num(1) }),
    doStep("s3", "stopMusic", { fadeOutSeconds: num(3) }),
    doStep("s4", "stopMusic", {})
  )), []);
});

test("audio slots refuse unknown entries, the wrong kind, bare strings and malformed references", () => {
  assert.deepEqual(codesOf(scriptOf(doStep("s1", "playSound", { cue: catalogRef("sound:kazoo") }))),
    ["unknownContent@cue.id"]);
  assert.deepEqual(codesOf(scriptOf(doStep("s1", "playSound", { cue: catalogRef("music:harbour-lanterns") }))),
    ["audioKindMismatch@cue.id"]);
  assert.deepEqual(codesOf(scriptOf(doStep("s1", "playMusic", { track: catalogRef("sound:thunder") }))),
    ["audioKindMismatch@track.id"]);
  assert.deepEqual(codesOf(scriptOf(doStep("s1", "playMusic", { track: catalogRef("ware:logs") }))),
    ["audioKindMismatch@track.id"]);
  assert.deepEqual(codesOf(scriptOf(doStep("s1", "playSound", { cue: "thunder" }))), ["slotTypeMismatch@cue"]);
  assert.deepEqual(codesOf(scriptOf(doStep("s1", "playSound", { cue: str("thunder") }))).length, 1);
  assert.deepEqual(codesOf(scriptOf(doStep("s1", "playMusic", {}))), ["missingSlot@track"]);
  assert.deepEqual(codesOf(scriptOf(doStep("s1", "playMusic", { mode: str("shuffle"),
    track: catalogRef("music:harbour-lanterns") }))), ["slotTypeMismatch@mode"]);
});

test("literal audio options must lie in their range", () => {
  const codes = codesOf(scriptOf(
    doStep("s1", "playSound", { cue: catalogRef("sound:thunder"), volume: num(1.5) }),
    doStep("s2", "playMusic", { fadeInSeconds: num(-1), fadeOutSeconds: num(31),
      track: catalogRef("music:harbour-lanterns") }),
    doStep("s3", "stopMusic", { fadeOutSeconds: num(60) })));
  assert.deepEqual(codes, ["audioOptionOutOfRange@volume", "audioOptionOutOfRange@fadeInSeconds",
    "audioOptionOutOfRange@fadeOutSeconds", "audioOptionOutOfRange@fadeOutSeconds"]);
  const message = formatScriptIssue({ code: "audioOptionOutOfRange", params: { max: 1, min: 0, option: "volume" },
    path: "Step 1", severity: "error" }, "hu");
  assert.equal(message, "Step 1: a(z) volume értéknek 0 és 1 között kell lennie.");
});

test("uploaded audio references are checked against the map's assets when the caller knows them", () => {
  const script = scriptOf(doStep("s1", "playSound", { cue: uploadRef("audio-1") }),
    doStep("s2", "playMusic", { track: uploadRef("audio-1") }), doStep("s3", "playSound", { cue: uploadRef("audio-9") }));
  assert.deepEqual(codesOf(script), [], "not checked without the asset list");
  assert.deepEqual(codesOf(script, mapAudioAssetKinds([asset()])),
    ["audioKindMismatch@track.assetId", "unknownAudioAsset@cue.assetId"]);
});

test("uploaded map audio: formats, per-kind size and duration limits, count and total size", () => {
  assert.equal(base64ByteLength("AAAA"), 3);
  assert.equal(base64ByteLength("AAA="), 2);
  assert.equal(base64ByteLength("AA=="), 1);
  assert.equal(mapAudioAssetRefusal(asset()), null);
  assert.equal(mapAudioAssetRefusal(asset({ mimeType: "audio/wav" as never })), "unsupportedFormat");
  assert.equal(mapAudioAssetRefusal(asset({ durationSeconds: MAP_AUDIO_LIMITS.sound.seconds + 1 })), "tooLong");
  assert.equal(mapAudioAssetRefusal(asset({ durationSeconds: 200, kind: "music" })), null);
  const overSound = "A".repeat(Math.ceil((MAP_AUDIO_LIMITS.sound.bytes + 3) / 3) * 4);
  assert.equal(mapAudioAssetRefusal(asset({ data: overSound })), "tooLarge");
  assert.equal(mapAudioAssetRefusal(asset({ data: overSound, kind: "music" })), null);
  assert.equal(mapAudioAssetRefusal(asset({ data: "not base64!" })), "invalidAsset");
  assert.equal(mapAudioAssetRefusal(asset({ name: "" })), "invalidAsset");
  assert.deepEqual(checkMapAudioAssets([asset(), asset({ id: "audio-2" })]), []);
  assert.deepEqual(checkMapAudioAssets([asset(), asset()]), [{ index: 1, reason: "duplicateId" }]);
  assert.deepEqual(checkMapAudioAssets({}), [{ index: -1, reason: "invalidAsset" }]);
  const many = Array.from({ length: MAP_AUDIO_LIMITS.assets + 1 }, (_, index) => asset({ id: `audio-${index}` }));
  assert.deepEqual(checkMapAudioAssets(many), [{ index: -1, reason: "tooManyAssets" }]);
  const big = "A".repeat(Math.floor(MAP_AUDIO_LIMITS.music.bytes / 3) * 4);
  assert.deepEqual(checkMapAudioAssets([asset({ data: big, id: "a", kind: "music" }),
    asset({ data: big, id: "b", kind: "music" })]), [{ index: -1, reason: "totalTooLarge" }]);
});

const audioScript = () => scriptOf(
  doStep("s1", "playSound", { cue: catalogRef("sound:thunder"), volume: num(4) }),
  doStep("s2", "playMusic", { mode: str("once"), track: uploadRef("audio-1") }),
  doStep("s3", "stopMusic", { fadeOutSeconds: num(2.5) }));

test("audio actions become outbox effects with clamped options and defaults; nothing reaches the world", () => {
  const world = createFakeWorld();
  const engine = createEngine(audioScript(), world);
  runTicks(engine, world, 1);
  assert.deepEqual(engine.takeUiEffects(), [
    { kind: "playSound", sound: { id: "sound:thunder", kind: "catalog" }, volume: 1 },
    { fadeInSeconds: 1, fadeOutSeconds: 1, kind: "playMusic", loop: false, track: { assetId: "audio-1", kind: "upload" },
      volume: 1 },
    { fadeOutSeconds: 2.5, kind: "stopMusic" }
  ]);
  assert.equal(world.actions.length, 0);
  assert.equal(engine.state.runs.length, 0);
});

test("audio effects are never saved or hashed: a drained client and an undrained verifier agree", () => {
  const client = createFakeWorld(), verifier = createFakeWorld();
  const clientEngine = createEngine(audioScript(), client);
  const verifierEngine = createEngine(audioScript(), verifier);
  let played = 0;
  for (let tick = 0; tick < 3; tick++) {
    runTicks(clientEngine, client, 1);
    played += clientEngine.takeUiEffects().length;
    runTicks(verifierEngine, verifier, 1);
  }
  assert.equal(played, 3);
  assert.equal(hashScriptRunState(clientEngine.state), hashScriptRunState(verifierEngine.state));
  assert.deepEqual(clientEngine.state, verifierEngine.state);
  assert.ok(!("uiOutbox" in verifierEngine.state), "the outbox is not part of the saved run state");
  const saved = JSON.stringify(verifierEngine.state);
  assert.equal(verifierEngine.takeUiEffects().length, 3);
  assert.equal(JSON.stringify(verifierEngine.state), saved, "draining the outbox changes no saved state");
});

test("catch-up plays no audio", () => {
  const world = createFakeWorld();
  const engine = createEngine(emptyScript({ triggers: [trigger("t1", { actions: [
    { id: "s0", k: "wait", seconds: num(1) }, ...audioScript().triggers[0]!.actions] })] }), world);
  runTicks(engine, world, 1);
  engine.setMode("catchUp");
  runTicks(engine, world, 100);
  engine.drainPending();
  assert.equal(engine.takeUiEffects().length, 0);
});
