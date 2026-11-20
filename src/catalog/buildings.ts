import { entriesOfKind, entryByCode, entryByKey } from "./loader.ts";
import type { BuildingEntry } from "./types/building.ts";

/** Every active building in building menu order. */
export const buildingEntries = (): readonly BuildingEntry[] => entriesOfKind("building");

/** The building of a persisted BuildingType code, retired ones included; undefined for unknown codes. */
export const buildingEntry = (code: number): BuildingEntry | undefined => entryByCode("building", code);

/** The building of a catalog key ("woodcutter"), retired ones included. */
export const buildingByKey = (key: string): BuildingEntry | undefined => entryByKey("building", key);
