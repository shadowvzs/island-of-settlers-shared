import type { AudioKind } from "../catalog/types/audio.ts";
import { isPlainObject } from "../validation/index.ts";
import { SCRIPT_ID_PATTERN } from "./constants.ts";

/**
 * Audio of the map script (owner 2026-11-12): `playSound` / `playMusic` name a content catalog entry (`sound:*`,
 * `music:*`) or an audio file the author uploaded with the map. Uploaded assets live in the map file header beside
 * the script (`audioAssets`), never inside it: the script and its hash stay small and unchanged by the bytes.
 */

/** What an audio slot stores. */
export type AudioRef =
  | { id: string; kind: "catalog" }
  | { assetId: string; kind: "upload" };

export const MAP_AUDIO_MIME_TYPES = Object.freeze(["audio/ogg", "audio/mpeg"] as const);
export type MapAudioMimeType = (typeof MAP_AUDIO_MIME_TYPES)[number];

/** An audio file uploaded with the map (owner's own or licence-free material, confirmed on upload). */
export interface MapAudioAsset {
  /** Base64 of the file bytes (the JSON map header carries no binary). */
  data: string;
  durationSeconds: number;
  id: string;
  kind: AudioKind;
  mimeType: MapAudioMimeType;
  /** The author's label (the uploaded file name by default). */
  name: string;
}

/** Limits of uploaded map audio: per file by kind, and per map (the map file is synced whole). */
export const MAP_AUDIO_LIMITS = Object.freeze({
  assets: 12,
  music: Object.freeze({ bytes: 1536 * 1024, seconds: 300 }),
  nameLength: 80,
  sound: Object.freeze({ bytes: 256 * 1024, seconds: 15 }),
  totalBytes: 2 * 1024 * 1024
});

/** Ranges of the `playSound` / `playMusic` / `stopMusic` options. */
export const AUDIO_OPTION_RANGES = Object.freeze({
  fadeInSeconds: Object.freeze({ max: 30, min: 0 }),
  fadeOutSeconds: Object.freeze({ max: 30, min: 0 }),
  volume: Object.freeze({ max: 1, min: 0 })
});
export type AudioOptionName = keyof typeof AUDIO_OPTION_RANGES;

/** Fade of a music change when the action names none (seconds). */
export const AUDIO_DEFAULT_FADE_SECONDS = 1;

/** `loop` repeats the track until other music starts; `once` plays it one time. */
export const MUSIC_MODES = Object.freeze(["loop", "once"] as const);
export type MusicMode = (typeof MUSIC_MODES)[number];

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const BASE64_GROUP = 4;
const BYTES_PER_GROUP = 3;

/** Byte length of a base64 text without decoding it. */
export const base64ByteLength = (data: string) => {
  const padding = data.endsWith("==") ? 2 : Number(data.endsWith("="));
  return Math.floor(data.length / BASE64_GROUP) * BYTES_PER_GROUP - padding;
};

export type MapAudioRefusal =
  | "duplicateId" | "invalidAsset" | "tooLarge" | "tooLong" | "tooManyAssets" | "totalTooLarge" | "unsupportedFormat";

export interface MapAudioIssue {
  /** Index of the refused asset; -1 for a whole-list refusal. */
  index: number;
  reason: MapAudioRefusal;
}

const isAudioKind = (value: unknown): value is AudioKind => value === "sound" || value === "music";

const hasAssetFields = (asset: Record<string, unknown>) =>
  typeof asset.id === "string" && SCRIPT_ID_PATTERN.test(asset.id) && isAudioKind(asset.kind) &&
  typeof asset.name === "string" && asset.name.length > 0 && asset.name.length <= MAP_AUDIO_LIMITS.nameLength &&
  typeof asset.data === "string" && asset.data.length > 0 && asset.data.length % BASE64_GROUP === 0 &&
  BASE64_PATTERN.test(asset.data) && typeof asset.durationSeconds === "number" &&
  Number.isFinite(asset.durationSeconds) && asset.durationSeconds > 0;

/** Why one asset is refused, or null. Also what the editor checks before it stores an upload. */
export const mapAudioAssetRefusal = (asset: unknown): MapAudioRefusal | null => {
  if (!isPlainObject(asset) || !hasAssetFields(asset)) return "invalidAsset";
  if (!(MAP_AUDIO_MIME_TYPES as readonly unknown[]).includes(asset.mimeType)) return "unsupportedFormat";
  const limits = MAP_AUDIO_LIMITS[asset.kind as AudioKind];
  if (base64ByteLength(asset.data as string) > limits.bytes) return "tooLarge";
  if ((asset.durationSeconds as number) > limits.seconds) return "tooLong";
  return null;
};

/** Structural check of a map's uploaded audio list (map file reader, editor); empty = valid. */
export const checkMapAudioAssets = (value: unknown): MapAudioIssue[] => {
  if (!Array.isArray(value)) return [{ index: -1, reason: "invalidAsset" }];
  const issues: MapAudioIssue[] = [];
  if (value.length > MAP_AUDIO_LIMITS.assets) issues.push({ index: -1, reason: "tooManyAssets" });
  const seen = new Set<string>();
  let totalBytes = 0;
  value.forEach((asset: unknown, index) => {
    const reason = mapAudioAssetRefusal(asset);
    if (reason) {
      issues.push({ index, reason });
      return;
    }
    const { data, id } = asset as MapAudioAsset;
    if (seen.has(id)) issues.push({ index, reason: "duplicateId" });
    seen.add(id);
    totalBytes += base64ByteLength(data);
  });
  if (totalBytes > MAP_AUDIO_LIMITS.totalBytes) issues.push({ index: -1, reason: "totalTooLarge" });
  return issues;
};

/** Asset id → kind: what the script validator needs to check `upload` references. */
export const mapAudioAssetKinds = (assets: readonly Pick<MapAudioAsset, "id" | "kind">[] | undefined) =>
  new Map((assets ?? []).map(asset => [asset.id, asset.kind]));
