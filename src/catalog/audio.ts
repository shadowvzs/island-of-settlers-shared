import { entriesOfKind, getContentEntry } from "./loader.ts";
import type { AudioEntry, AudioKind, AudioPayload, MusicEntry, SoundEntry } from "./types/audio.ts";

/** Every active sound effect in catalog order. */
export const soundEntries = (): readonly SoundEntry[] => entriesOfKind("sound");

/** Every active bundled music track in catalog order (collections in tab order). */
export const musicEntries = (): readonly MusicEntry[] => entriesOfKind("music");

export const audioEntries = (kind: AudioKind): readonly AudioEntry[] =>
  (kind === "music" ? musicEntries() : soundEntries());

/** The active audio entry of an id (`sound:thunder`, `music:harbour-lanterns`) when it is of `kind`. */
export const audioEntry = (kind: AudioKind, id: string): AudioEntry | undefined => {
  const entry = getContentEntry(id);
  return entry && entry.kind === kind && !entry.retired ? entry as AudioEntry : undefined;
};

/** The audio payload of an entry of either kind. */
export const audioPayload = (entry: AudioEntry): AudioPayload =>
  (entry.kind === "music" ? entry.music : entry.sound);
