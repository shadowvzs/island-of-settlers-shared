import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

import {
  audioEntries, audioEntry, audioPayload, categoriesOfKind, CORE_CATEGORIES, CORE_DATA_FILES, musicEntries,
  soundEntries, validateCatalog
} from "../src/catalog/index.ts";
import type { CatalogSource, ContentKind } from "../src/catalog/index.ts";

const CLIENT_ASSETS = join(import.meta.dirname, "../../island-of-settlers-client/assets");
const AUDIO_EXTENSIONS = /\.(ogg|mp3|wav|opus|flac|m4a)$/;

const codesWith = (kind: ContentKind, entry: unknown) => {
  const raw = structuredClone({ categories: CORE_CATEGORIES, files: CORE_DATA_FILES }) as CatalogSource;
  return validateCatalog({ ...raw, files: [...raw.files, { entries: [entry], file: "t.json", kind }] })
    .map(issue => issue.code);
};
const thunder = (sound: Record<string, unknown> = {}) => ({
  ...structuredClone(audioEntry("sound", "sound:thunder")), id: "sound:test", key: "test",
  text: { name: { en: "Test", key: "content.sound.test.name" } },
  sound: { ...audioEntry("sound", "sound:thunder")!.sound, ...sound }
});
const track = (music: Record<string, unknown> = {}) => ({
  ...structuredClone(audioEntry("music", "music:harbour-lanterns")), id: "music:test", key: "test",
  text: { name: { en: "Test", key: "content.music.test.name" } },
  music: { ...audioEntry("music", "music:harbour-lanterns")!.music, ...music }
});

const shippedAudioFiles = (folder: string): string[] => readdirSync(folder).flatMap(name => {
  const path = join(folder, name);
  if (statSync(path).isDirectory()) return shippedAudioFiles(path);
  return AUDIO_EXTENSIONS.test(name) ? [relative(CLIENT_ASSETS, path).replaceAll("\\", "/")] : [];
});

const filePathOf = (entry: ReturnType<typeof audioEntries>[number]) => {
  const { source } = audioPayload(entry);
  return source.kind === "file" ? source.file.path : null;
};

test("the audio catalog lists the shipped music collections and sounds", () => {
  assert.equal(musicEntries().length, 89);
  assert.equal(soundEntries().length, 10);
  assert.deepEqual(categoriesOfKind("music").map(category => category.id), [
    "music.roman", "music.viking", "music.japanese", "music.nubian", "music.chinese", "music.persian", "music.maya",
    "music.indigenous", "music.neutral"
  ]);
  for (const category of categoriesOfKind("music"))
    assert.ok(musicEntries().some(entry => entry.category === category.id), category.id);
  for (const category of categoriesOfKind("sound"))
    assert.ok(soundEntries().some(entry => entry.category === category.id), category.id);
  assert.ok(musicEntries().every(entry => entry.music.type === "music"));
  assert.deepEqual([...new Set(soundEntries().map(entry => entry.sound.type))].sort(), ["ambient", "fanfare"]);
  assert.equal(audioEntry("music", "sound:thunder"), undefined);
  assert.equal(audioEntry("sound", "sound:thunder")?.sound.source.kind, "cue");
});

const SKIP_WITHOUT_CLIENT = { skip: !existsSync(CLIENT_ASSETS) };

test("every audio entry's file and credits text exist in the client assets", SKIP_WITHOUT_CLIENT, () => {
  for (const entry of [...musicEntries(), ...soundEntries()]) {
    const payload = audioPayload(entry);
    assert.equal(payload.credits.root, "clientAssets", entry.id);
    assert.ok(existsSync(join(CLIENT_ASSETS, payload.credits.path)), `${entry.id}: ${payload.credits.path}`);
    const path = filePathOf(entry);
    if (path) assert.ok(existsSync(join(CLIENT_ASSETS, path)), `${entry.id}: ${path}`);
  }
});

test("no shipped audio file is missing from the catalog and no file is listed twice", SKIP_WITHOUT_CLIENT, () => {
  const listed = [...musicEntries(), ...soundEntries()].flatMap(entry => filePathOf(entry) ?? []);
  assert.equal(new Set(listed).size, listed.length);
  assert.deepEqual(shippedAudioFiles(CLIENT_ASSETS).sort(), [...listed].sort());
});

test("audio payload rules: source, licence, duration, collection", () => {
  assert.deepEqual(codesWith("sound", thunder()), []);
  assert.deepEqual(codesWith("music", track()), []);
  assert.ok(codesWith("sound", thunder({ source: { cue: "thunder", kind: "cue" } })).includes("payload"));
  assert.ok(codesWith("sound", thunder({ licence: "unknown" })).includes("payload"));
  assert.ok(codesWith("sound", thunder({ durationSeconds: 0 })).includes("payload"));
  assert.ok(codesWith("sound", thunder({ loop: "yes" })).includes("payload"));
  assert.ok(codesWith("sound", thunder({ type: "music" })).includes("payload"));
  assert.ok(codesWith("sound", thunder({ type: undefined })).includes("payload"));
  assert.ok(codesWith("music", track({ type: "ambient" })).includes("payload"));
  assert.ok(codesWith("sound", thunder({ extra: 1 })).includes("payload"));
  const wav = { file: { path: "audio/x.wav", root: "clientAssets" }, kind: "file" };
  assert.ok(codesWith("sound", thunder({ source: wav })).includes("payload"));
  assert.ok(codesWith("music", track({ source: { cue: "cue:weather.thunder", kind: "cue" } })).includes("payload"));
  assert.ok(codesWith("music", track({ collection: "atlantean" })).includes("reference"));
  assert.ok(codesWith("music", track({ collection: "roman" })).includes("payload"));
});
