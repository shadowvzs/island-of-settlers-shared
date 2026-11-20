import { resolveTranslatableText } from "../campaign-text.ts";
import {
  SPEAK_BASE_MS, SPEAK_MAX_MS, SPEAK_MIN_MS, SPEAK_MS_PER_CHAR, SPEAK_PAGE_MAX_CHARS
} from "./constants.ts";
import type { CinematicStepOf } from "./types.ts";

/** Displayed characters (code points) of a line, without surrounding whitespace. */
export const speakCharacterCount = (text: string) => Array.from(text.trim()).length;

/** Section 3.6: base + characters × msPerChar, clamped to [SPEAK_MIN_MS, SPEAK_MAX_MS]. */
export const autoDurationMs = (text: string, msPerChar = SPEAK_MS_PER_CHAR) => {
  const raw = SPEAK_BASE_MS + speakCharacterCount(text) * msPerChar;
  return Math.min(SPEAK_MAX_MS, Math.max(SPEAK_MIN_MS, raw));
};

const SENTENCE_END = /(?<=[.!?…])\s+/u;
const WHITESPACE = /\s+/u;

/** Packs `parts` greedily into chunks of at most `maxChars`, joined by single spaces. */
const packParts = (parts: readonly string[], maxChars: number) => {
  const chunks: string[] = [];
  let current = "";
  for (const part of parts) {
    const joined = current ? `${current} ${part}` : part;
    if (speakCharacterCount(joined) <= maxChars) { current = joined; continue; }
    if (current) chunks.push(current);
    current = part;
  }
  if (current) chunks.push(current);
  return chunks;
};

/** A part that alone is too long: split at word boundaries, a single over-long word by characters. */
const splitOversized = (part: string, maxChars: number): string[] => {
  if (speakCharacterCount(part) <= maxChars) return [part];
  const words = part.split(WHITESPACE);
  if (words.length > 1) return packParts(words.flatMap(word => splitOversized(word, maxChars)), maxChars);
  const characters = Array.from(part), pieces: string[] = [];
  for (let index = 0; index < characters.length; index += maxChars)
    pieces.push(characters.slice(index, index + maxChars).join(""));
  return pieces;
};

/** Pages of at most `maxChars` characters, broken at sentence boundaries where possible. */
export const pageSpeakText = (text: string, maxChars = SPEAK_PAGE_MAX_CHARS) => {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (speakCharacterCount(trimmed) <= maxChars) return [trimmed];
  const sentences = trimmed.split(SENTENCE_END).flatMap(sentence => splitOversized(sentence, maxChars));
  return packParts(sentences, maxChars);
};

/** The speak step's duration in `language` (English fallback): fixed, or the sum of its pages' auto durations. */
export const speakDurationMs = (step: CinematicStepOf<"speak">, language: string, msPerChar = SPEAK_MS_PER_CHAR) => {
  if (step.timing === "fixed") return step.durationMs ?? 0;
  const pages = pageSpeakText(resolveTranslatableText(step.text, language));
  if (!pages.length) return 0;
  return pages.reduce((sum, page) => sum + autoDurationMs(page, msPerChar), 0);
};
