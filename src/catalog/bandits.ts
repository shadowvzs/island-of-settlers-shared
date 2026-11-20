import { entriesOfKind, entryByCode, getContentEntry } from "./loader.ts";
import type { BanditEntry, BanditSiteRef } from "./types/bandit.ts";

/** Every bandit site in code order. */
export const banditEntries = (): readonly BanditEntry[] => entriesOfKind("bandit");

/** The bandit site with this `bandit:` code (what saves and maps store); undefined for unknown codes. */
export const banditEntry = (code: number): BanditEntry | undefined => entryByCode("bandit", code);

/** A valid saved bandit site reference: a known `bandit:` code and one of its layouts. */
export const isBanditSiteRef = (value: unknown): value is BanditSiteRef => {
  if (typeof value !== "object" || value === null) return false;
  const { code, layout } = value as { code?: unknown; layout?: unknown };
  if (!Number.isSafeInteger(code) || !Number.isSafeInteger(layout) || Object.keys(value).length !== 2) return false;
  return banditEntry(code as number)?.bandit.models[layout as number] !== undefined;
};

let militaryBuildingCodes: ReadonlyMap<number, number> | null = null;
const loadMilitaryBuildingCodes = () => new Map(banditEntries().map(entry =>
  [entry.code, (getContentEntry(entry.bandit.militaryBuilding) as { code: number }).code]));

/**
 * The building code whose military rules (garrison posts, walls, assault role) the bandit site borrows. It is
 * derived data: the site's identity in saves and maps is its `bandit:` code.
 */
export const banditMilitaryBuildingCode = (code: number): number | undefined => {
  militaryBuildingCodes ??= loadMilitaryBuildingCodes();
  return militaryBuildingCodes.get(code);
};

let byMilitaryBuilding: ReadonlyMap<number, BanditEntry> | null = null;
/**
 * The bandit site that borrows this military building code; undefined for other codes. Used where a rule picks
 * the military strength first (colony fort plans) and by the load-time conversion of the retired format, which
 * stored a site as this building type plus a layout index.
 */
export const banditByMilitaryBuilding = (typeId: number): BanditEntry | undefined => {
  byMilitaryBuilding ??= new Map(banditEntries().map(entry => [banditMilitaryBuildingCode(entry.code)!, entry]));
  return byMilitaryBuilding.get(typeId);
};
