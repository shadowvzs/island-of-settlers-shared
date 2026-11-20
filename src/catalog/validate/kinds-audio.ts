import { isNonEmptyString, isPlainObject } from "../../validation/index.ts";
import {
  AUDIO_LICENCES, AUDIO_MAX_DURATION_SECONDS, CUE_ID_PATTERN, MUSIC_AUDIO_TYPE, NEUTRAL_MUSIC_COLLECTION,
  SOUND_AUDIO_TYPES
} from "../constants.ts";
import { checkFields, type FieldRules, isOneOf, rule } from "./fields.ts";
import type { PayloadCheck } from "./kinds.ts";
import { checkAssetRef, checkContentRef } from "./refs.ts";

const NO_TOKENS: ReadonlySet<string> = new Set();
const AUDIO_FILE_PATTERN = /\.(ogg|mp3)$/;
const SHAPE = "{ credits, durationSeconds, licence, loop, source, type }";

const isDuration = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 && value <= AUDIO_MAX_DURATION_SECONDS;

const AUDIO_RULES: FieldRules = {
  credits: rule(isPlainObject, "An asset reference to the credits text"),
  durationSeconds: rule(isDuration, `Seconds above 0, at most ${AUDIO_MAX_DURATION_SECONDS}`),
  licence: rule(isOneOf(AUDIO_LICENCES), `One of ${AUDIO_LICENCES.join(", ")}`),
  loop: rule(value => typeof value === "boolean", "A boolean"),
  source: rule(isPlainObject, "{ kind: file, file } or { kind: cue, cue }"),
  type: rule(isOneOf(SOUND_AUDIO_TYPES), `One of ${SOUND_AUDIO_TYPES.join(", ")}`)
};
const MUSIC_RULES: FieldRules = {
  ...AUDIO_RULES,
  collection: rule(isNonEmptyString, "A nation key or neutral"),
  type: rule(value => value === MUSIC_AUDIO_TYPE, `Music entries have the type ${MUSIC_AUDIO_TYPE}`)
};

const checkFileSource = (source: Record<string, unknown>, path: string, sink: Parameters<PayloadCheck>[2]) => {
  checkAssetRef(source.file, `${path}.file`, NO_TOKENS, sink);
  const filePath = isPlainObject(source.file) ? source.file.path : undefined;
  if (typeof filePath === "string" && !AUDIO_FILE_PATTERN.test(filePath))
    sink.add("payload", `${path}.file.path`, "Audio files are .ogg or .mp3");
};

const checkSource = (source: unknown, path: string, sink: Parameters<PayloadCheck>[2], allowCue: boolean) => {
  if (!isPlainObject(source)) return;
  const fields = Object.keys(source).length;
  if (source.kind === "file" && fields === 2) return checkFileSource(source, path, sink);
  if (allowCue && source.kind === "cue" && fields === 2 && typeof source.cue === "string" &&
    CUE_ID_PATTERN.test(source.cue)) return;
  sink.add("payload", path, allowCue ? "{ kind: file, file } or { kind: cue, cue: cue:<group>.<name> }"
    : "{ kind: file, file }");
};

const checkAudio = (
  payload: unknown, path: string, sink: Parameters<PayloadCheck>[2], rules: FieldRules, allowCue: boolean
) => {
  const fields = checkFields(payload, path, sink, rules, SHAPE);
  if (!fields) return null;
  if (isPlainObject(fields.credits)) checkAssetRef(fields.credits, `${path}.credits`, NO_TOKENS, sink);
  checkSource(fields.source, `${path}.source`, sink, allowCue);
  return fields;
};

const checkSound: PayloadCheck = (payload, path, sink) => {
  checkAudio(payload, path, sink, AUDIO_RULES, true);
};

/** Music is always a shipped file; its collection is a nation or `neutral` and names its category. */
const checkMusic: PayloadCheck = (payload, path, sink, context, entry) => {
  const fields = checkAudio(payload, path, sink, MUSIC_RULES, false);
  if (!fields || !isNonEmptyString(fields.collection)) return;
  if (fields.collection !== NEUTRAL_MUSIC_COLLECTION)
    checkContentRef(`nation:${fields.collection}`, ["nation"], `${path}.collection`, sink, context);
  if (entry.category !== `music.${fields.collection}`)
    sink.add("payload", `${path}.collection`, "The category is music.<collection>");
};

export const AUDIO_KIND_RULES = {
  music: { check: checkMusic, payload: "music" },
  sound: { check: checkSound, payload: "sound" }
} as const;
