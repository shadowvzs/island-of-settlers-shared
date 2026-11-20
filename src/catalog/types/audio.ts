import type { ContentEntryBase } from "./entry.ts";
import type { AssetRef, CueId } from "./refs.ts";

/** Where an audio entry's samples come from: a shipped file, or a cue the client synthesizes at run time. */
export type AudioSource =
  | { file: AssetRef; kind: "file" }
  | { cue: CueId; kind: "cue" };

/** Licence of a shipped audio entry; the full text is the `credits` file. */
export type AudioLicence = "cc0" | "originalFluidR3" | "originalSynthesis" | "ownerMidiFluidR3";

/** What the entry is for: a music track, a background ambience / nature sound, a one-shot effect, a fanfare. */
export type AudioType = "ambient" | "effect" | "fanfare" | "music";

/** What every audio entry declares (catalog README, "Audio"). */
export interface AudioPayload {
  /** The credits / licence text shipped beside the asset. */
  credits: AssetRef;
  /** Length of the file; an approximate length for synthesized cues (their variants differ). */
  durationSeconds: number;
  licence: AudioLicence;
  /** Whether the entry is made to repeat (music beds) or to play once (effects). */
  loop: boolean;
  source: AudioSource;
  /** `music` for every `music:*` entry; `ambient`, `effect` or `fanfare` for a `sound:*` entry. */
  type: AudioType;
}

/** A short effect a map script or a cinematic may play. Its category is the picker tab. */
export interface SoundEntry extends ContentEntryBase<"sound"> {
  sound: AudioPayload;
}

/** A bundled music track. Its category is the collection tab (a nation or `neutral`). */
export interface MusicEntry extends ContentEntryBase<"music"> {
  music: AudioPayload & {
    /** A nation key or `neutral`: the music player's collection. */
    collection: string;
  };
}

export type AudioEntry = MusicEntry | SoundEntry;
export type AudioKind = AudioEntry["kind"];
