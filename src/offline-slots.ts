import { SAVE_SLOT_LIMIT } from "./game-settings/constants.ts";
import { type GameSettings, hasHomeIsland } from "./game-settings/game-settings.ts";
import { effectiveSaving } from "./game-settings/setting-availability.ts";
import { isPlainObject } from "./validation/guards.ts";

/**
 * Save slots in the server DB's unverified store (plan §5.6, §7.1, card OFFLINE-CLOUD): the contract the client's
 * server slot repositories and the api share. Offline modes (`home`, `story`) travel as one gzip JSON document
 * `{ meta, records }`: `records` is the browser slot's rows as stored (table level, never a `GameSaveV1`). Signed-in
 * online play without a home (`online`, owner D1b: only while campaign rewards are off) stores `{ meta, save }`, a
 * copy of the verified cloud slot's game; loading one writes it back through the verified save API, so the store
 * itself never gives online value. `meta` is the small description the slot list shows.
 */

/** Route prefix: `GET ?mode=`, then `GET | PUT | DELETE /<mode>/<slot number>`. */
export const OFFLINE_SLOTS_PATH = "/v1/offline-slots";
/**
 * Offline working slots with a home island (`offline.home`) and without one (`offline.story`), and signed-in online
 * play without a home (`online`, copies of the verified cloud slot).
 */
export const OFFLINE_SLOT_MODES = Object.freeze(["home", "story", "online"] as const);
export type OfflineSlotMode = typeof OFFLINE_SLOT_MODES[number];
/** The mode of signed-in online play without a home: Save/Load slots only, its working slot is the cloud slot. */
export const ONLINE_STORY_SLOT_MODE: OfflineSlotMode = "online";
/** Slot number 0 is an offline working slot (the engine's rows); 1 … SAVE_SLOT_LIMIT are the Save/Load slots. */
export const OFFLINE_WORKING_SLOT_NO = 0;

export const OFFLINE_SLOT_LIMITS = Object.freeze({
  /** Stored (compressed) bytes of every slot of one account together. */
  accountBytes: 48 * 1024 * 1024,
  /** One slot's compressed body as stored. */
  compressedBytes: 8 * 1024 * 1024,
  /** One slot's decompressed JSON. */
  jsonBytes: 64 * 1024 * 1024,
  /** The meta's JSON. */
  metaBytes: 2048
});

/** Shape version of a slot meta. */
export const SLOT_META_VERSION = 1;
/** Longest player-given slot name (plan §5.6). */
export const SLOT_LABEL_MAX_LENGTH = 40;
/** What a saved session shows. */
export const SLOT_SHOWS_KINDS = Object.freeze(["adventure", "campaign", "colony", "home"] as const);
export type SlotShowsKind = typeof SLOT_SHOWS_KINDS[number];

export interface SlotShows {
  campaignId?: string;
  kind: SlotShowsKind;
  mapId?: string;
}

/** The description of a saved slot: the list reads only these, never the rows. */
export interface SlotMeta {
  /** The player's name for the slot; absent = the list shows the place and date. */
  label?: string;
  /** The player level of the saved game. */
  level?: number;
  /** The map's name when the game knew it at save time. */
  place?: string;
  savedAt: number;
  shows: SlotShows;
  version: typeof SLOT_META_VERSION;
}

/** One stored offline slot as the list answers it. */
export interface OfflineSlotSummary {
  /** Stored (compressed) size. */
  bytes: number;
  meta: SlotMeta;
  /** Server time of the upload (ISO). */
  savedAt: string;
  slotNo: number;
}

export const isOfflineSlotMode = (value: unknown): value is OfflineSlotMode =>
  (OFFLINE_SLOT_MODES as readonly unknown[]).includes(value);

/** Working slot 0 (offline modes only) or a Save/Load slot 1 … SAVE_SLOT_LIMIT. */
export const isOfflineSlotNumber = (value: unknown, mode: OfflineSlotMode = "home"): value is number => {
  const first = mode === ONLINE_STORY_SLOT_MODE ? OFFLINE_WORKING_SLOT_NO + 1 : OFFLINE_WORKING_SLOT_NO;
  return Number.isInteger(value) && (value as number) >= first && (value as number) <= SAVE_SLOT_LIMIT;
};

const optionalString = (value: unknown, maxLength = Infinity) =>
  value === undefined || (typeof value === "string" && value.length <= maxLength);

const isShowsKind = (value: unknown) => (SLOT_SHOWS_KINDS as readonly unknown[]).includes(value);

const isSlotShows = (value: unknown): value is SlotShows => isPlainObject(value) && isShowsKind(value.kind) &&
  optionalString(value.campaignId) && optionalString(value.mapId);

const isFiniteNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);

/** A well-formed slot meta (browser boot value or server column). */
export const isSlotMeta = (value: unknown): value is SlotMeta => isPlainObject(value) &&
  value.version === SLOT_META_VERSION && isFiniteNumber(value.savedAt) && isSlotShows(value.shows) &&
  optionalString(value.label, SLOT_LABEL_MAX_LENGTH) && optionalString(value.place) &&
  (value.level === undefined || isFiniteNumber(value.level));

/**
 * Whether the deployment's settings let players store slots of `mode`: offline modes while the game is offline;
 * `online` only online without a home and with Save/Load slots effective (D1b: never while campaign rewards are on).
 */
export const acceptsSlotUploads = (settings: GameSettings, mode: OfflineSlotMode) => {
  if (mode !== ONLINE_STORY_SLOT_MODE) return settings.connectivity === "offline";
  return settings.connectivity === "online" && !hasHomeIsland(settings) && effectiveSaving(settings).slots;
};
