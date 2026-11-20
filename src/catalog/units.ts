import { catalogEntries, entriesOfKind, entryByKey, getContentEntry } from "./loader.ts";
import type { CommanderEntry, SettlerEntry, SoldierEntry } from "./types/units.ts";

/** Every active settler job in workforce order (categories, then file order). */
export const settlerEntries = (): readonly SettlerEntry[] => entriesOfKind("settler");

let byJob: ReadonlyMap<string, SettlerEntry> | null = null;
/** The settler entry of a persisted job string ("Woodcutter"); undefined for unknown jobs. */
export const settlerByJob = (job: string): SettlerEntry | undefined => {
  byJob ??= new Map(settlerEntries().map(entry => [entry.settler.job, entry]));
  return byJob.get(job);
};

/** The persisted job string of a `settler:*` id ("settler:ironFounder" → "Iron founder"). */
export const settlerJob = (id: string): string => {
  const entry = getContentEntry(id);
  if (entry?.kind !== "settler") throw new Error(`Unknown settler ${id}`);
  return entry.settler.job;
};

/** The tool ware a job takes from storage; undefined for jobs without a tool. */
export const settlerTool = (job: string): string | undefined => settlerByJob(job)?.settler.tool;

let soldiers: readonly SoldierEntry[] | null = null;
/** Every troop type in display order, retired ones included (saved riders keep their profile). */
export const soldierEntries = (): readonly SoldierEntry[] =>
  soldiers ??= Object.freeze(catalogEntries().filter((entry): entry is SoldierEntry => entry.kind === "soldier"));

/** The troop type of a persisted key, retired ones included. */
export const soldierEntry = (type: string): SoldierEntry | undefined => entryByKey("soldier", type);

/** Every national commander in nation order. */
export const commanderEntries = (): readonly CommanderEntry[] => entriesOfKind("commander");

/** The commander of a nation key. */
export const commanderEntry = (nation: string): CommanderEntry | undefined => entryByKey("commander", nation);
