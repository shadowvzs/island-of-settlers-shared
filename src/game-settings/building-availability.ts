import { RESOURCE_TIERS } from "../catalog/balance/materials.ts";

/**
 * MAP BUILDING AVAILABILITY (owner 2026-11-17): one model for every map kind. `tier` is the highest building
 * level AND the highest material tier (level 2 hardwood + marble … level 5 mahogany + granite), so level and
 * material can never contradict. `banned` removes building types; `levelCaps` lowers single types further.
 * Absent fields narrow nothing. Pure and worker-safe: the simulation, editor, verifier and API share it.
 */
export interface BuildingLevelCap {
  level: number;
  type: number;
}

export interface BuildingAvailability {
  /** Unique, ascending catalog ids the player (and computer factions) may not build here. */
  banned?: number[];
  /** Per-type highest building level (1..tier), ascending by type. */
  levelCaps?: BuildingLevelCap[];
  /** Highest building level and material tier, 1..5; absent = 5. */
  tier?: number;
}

export const MIN_BUILDING_TIER = 1;
export const MAX_BUILDING_TIER = 5;
export const MAX_BANNED_BUILDINGS = 128;

const isTier = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= MIN_BUILDING_TIER && (value as number) <= MAX_BUILDING_TIER;

const ascendingIds = (values: readonly number[]) =>
  values.every((id, index) => Number.isSafeInteger(id) && id >= 0 && (index === 0 || id > values[index - 1]!));

const isLevelCap = (value: unknown): value is BuildingLevelCap => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const { level, type } = value as Record<string, unknown>;
  return Object.keys(value).length === 2 && isTier(level) && Number.isSafeInteger(type) && (type as number) >= 0;
};

const validBanned = (value: unknown) =>
  value === undefined || (Array.isArray(value) && value.length <= MAX_BANNED_BUILDINGS && ascendingIds(value));

const validLevelCaps = (value: unknown) => {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > MAX_BANNED_BUILDINGS || !value.every(isLevelCap)) return false;
  return ascendingIds(value.map(cap => cap.type));
};

const ALLOWED_KEYS = new Set(["banned", "levelCaps", "tier"]);

/** The stored shape (map file, save, command argument); catalog ids are checked by the caller. */
export const isBuildingAvailability = (value: unknown): value is BuildingAvailability => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (!Object.keys(record).every(key => ALLOWED_KEYS.has(key))) return false;
  if (record.tier !== undefined && !isTier(record.tier)) return false;
  return validBanned(record.banned) && validLevelCaps(record.levelCaps);
};

/** The player's home-island override: map-shaped rules plus the sandbox unlock (every level gate open). */
export interface HomeBuildingRules extends BuildingAvailability {
  unlockAll?: true;
}

/** Saved / command shape of the home override. */
export const isHomeBuildingRules = (value: unknown): value is HomeBuildingRules => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const { unlockAll, ...rest } = value as Record<string, unknown>;
  return (unlockAll === undefined || unlockAll === true) && isBuildingAvailability(rest);
};

/** The effective highest tier (absent = every tier). */
export const availabilityTier = (rules: BuildingAvailability | undefined) => rules?.tier ?? MAX_BUILDING_TIER;

export const isBuildingBanned = (rules: BuildingAvailability | undefined, typeId: number) =>
  !!rules?.banned?.includes(typeId);

/** The highest building level (1-based, as shown) a type may reach: the tier, lowered by its own cap. */
export const buildingLevelLimit = (rules: BuildingAvailability | undefined, typeId: number) => {
  const cap = rules?.levelCaps?.find(entry => entry.type === typeId)?.level ?? MAX_BUILDING_TIER;
  return Math.min(availabilityTier(rules), cap);
};

/** A material resource tier (0 softwood/stone … 4 mahogany/granite) is allowed when the map tier reaches it. */
export const isResourceTierAllowed = (rules: BuildingAvailability | undefined, resourceTier: number) =>
  resourceTier + 1 <= availabilityTier(rules);

const wareResourceTiers: ReadonlyMap<string, number> = new Map(RESOURCE_TIERS.flatMap(pair =>
  [pair.logs, pair.planks, pair.stone].map(ware => [ware, pair.tier] as const)));

/** The material resource tier of a ware; undefined for every non-material ware. */
export const wareResourceTier = (ware: string) => wareResourceTiers.get(ware);

/** Quest and market pools keep a ware only when the map tier allows its material tier (others always). */
export const isWareAllowedByTier = (rules: BuildingAvailability | undefined, ware: string) => {
  const tier = wareResourceTier(ware);
  return tier === undefined || isResourceTierAllowed(rules, tier);
};

/**
 * Two layers narrowed into one: the union of bans, the lower tier and the lower per-type cap. Used to put a
 * campaign record's blacklist over the map file's own rules. Returns undefined when nothing narrows.
 */
export const narrowBuildingAvailability = (
  base: BuildingAvailability | undefined, extra: BuildingAvailability | undefined
): BuildingAvailability | undefined => {
  if (!base) return extra;
  if (!extra) return base;
  const banned = [...new Set([...(base.banned ?? []), ...(extra.banned ?? [])])].sort((a, b) => a - b);
  const caps = new Map<number, number>();
  for (const cap of [...(base.levelCaps ?? []), ...(extra.levelCaps ?? [])])
    caps.set(cap.type, Math.min(cap.level, caps.get(cap.type) ?? MAX_BUILDING_TIER));
  const levelCaps = [...caps].sort(([a], [b]) => a - b).map(([type, level]) => ({ level, type }));
  const tier = Math.min(availabilityTier(base), availabilityTier(extra));
  return {
    ...(banned.length ? { banned } : {}),
    ...(levelCaps.length ? { levelCaps } : {}),
    ...(tier < MAX_BUILDING_TIER ? { tier } : {})
  };
};
