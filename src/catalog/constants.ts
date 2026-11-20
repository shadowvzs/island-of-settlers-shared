import type { AiPosture } from "./types/ai.ts";
import type { AudioLicence } from "./types/audio.ts";
import type { AssetRoot, ContentKind } from "./types/refs.ts";

export const CONTENT_KINDS: readonly ContentKind[] = Object.freeze([
  "ware", "building", "bandit", "settler", "soldier", "commander", "ship", "boat",
  "animal", "critter", "fish", "whale", "bird", "butterfly",
  "tree", "stone", "plant", "shell", "deposit", "decoration",
  "item", "offer", "nation", "sound", "music"
]);

export const ASSET_ROOTS: readonly AssetRoot[] = Object.freeze(["clientAssets", "clientPublic", "workerRepo"]);

/** Licences a shipped audio entry may name (`sound:*`, `music:*`). */
export const AUDIO_LICENCES: readonly AudioLicence[] =
  Object.freeze(["cc0", "originalFluidR3", "originalSynthesis", "ownerMidiFluidR3"]);
/** The `type` of a `music:*` entry, and the types a `sound:*` entry may have. */
export const MUSIC_AUDIO_TYPE = "music";
export const SOUND_AUDIO_TYPES: readonly string[] = Object.freeze(["ambient", "effect", "fanfare"]);
/** Longest catalog audio entry (seconds). */
export const AUDIO_MAX_DURATION_SECONDS = 900;
/** The music collection that belongs to no nation. */
export const NEUTRAL_MUSIC_COLLECTION = "neutral";

/** Persisted key: letters/digits first, then letters, digits, `.`, `_` or `-` ("logs", "banditCamp.small"). */
export const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** Kebab-case identifier inside a payload (offer ids, ornamental species). */
export const KEBAB_KEY_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
/** Dotted family path, most general first; segments are camelCase words ("animal.deer"). */
export const FAMILY_PATTERN = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)*$/;
/** Lingui message id: dotted segments ("domain.ware.logs", "content.ware.logs.name"). */
export const TRANSLATION_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z0-9_-]+)+$/;
/** Tag: one camelCase word. */
export const TAG_PATTERN = /^[a-z][A-Za-z0-9]*$/;
/** Category id: dotted camelCase segments ("ware.food"). */
export const CATEGORY_PATTERN = FAMILY_PATTERN;
/** Code reference ids by prefix (catalog README, "References"). */
export const RULE_ID_PATTERN = /^rule:[a-z][A-Za-z0-9]*(\.[A-Za-z0-9-]+)+$/;
export const RECIPE_ID_PATTERN = /^recipe:[a-z][A-Za-z0-9]*(\.[A-Za-z0-9-]+)+$/;
export const CUE_ID_PATTERN = /^cue:[a-z][A-Za-z0-9]*(\.[A-Za-z0-9-]+)+$/;
/** An entry's model recipe id template: segments may hold `{token}`s (`recipe:building.mill.{nation}.level{level}`). */
export const RECIPE_TEMPLATE_PATTERN = /^recipe:[a-z][A-Za-z0-9]*(\.[A-Za-z0-9{}-]+)+$/;
/** Relative POSIX path segment: no empty, `.` or `..` segments, no backslashes. */
export const PATH_SEGMENT_PATTERN = /^(?!\.{1,2}$)[A-Za-z0-9._{}-]+$/;
/** Template tokens inside asset and sidecar paths and model recipe id templates. */
export const PATH_TOKEN_PATTERN = /\{([A-Za-z]+)\}/g;
/** Tokens every entry can fill besides its declared variant axes. */
export const ENTRY_PATH_TOKENS: readonly string[] = Object.freeze(["code", "key"]);

/** Actor capability / action name in an entry's `actor` block: one camelCase word. */
export const ACTOR_CAPABILITY_PATTERN = TAG_PATTERN;

/** Fields of each reward line kind besides `kind` (`validateRewardEntries`). */
export const REWARD_ENTRY_FIELDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  buildingUnlock: ["buildingType"],
  coins: ["amount"],
  decoration: ["amount", "item"],
  gems: ["amount"],
  settlers: ["amount"],
  soldier: ["amount", "rank", "soldierType"],
  ware: ["amount", "ware"],
  xp: ["amount"]
});
/** Largest amount of one reward line (the campaign limit `maxAmount`). */
export const REWARD_MAX_AMOUNT = 1_000_000;
/** Soldier ranks are 0-based: 0..2. */
export const REWARD_MAX_SOLDIER_RANK = 2;

/** The strategic postures a build program weighs its goal groups by (`BuildGoalGroup.postures`). */
export const AI_POSTURES: readonly AiPosture[] = Object.freeze(["grow", "fortify"]);
