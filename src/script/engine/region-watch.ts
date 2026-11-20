import { type MapRegion, rasterizeRegion } from "../../campaign/campaign-regions.ts";
import type { ContentEntryBase } from "../../catalog/types/entry.ts";
import type { ScriptEventKind } from "../catalog/events.ts";
import type { MapScript } from "../types/script.ts";
import type { ScriptEvent } from "../types/triggers.ts";

/**
 * Region watch plan (trigger design §6.4, lane TRG4): which regions the cell watch tracks and their per-cell lists
 * in CSR form. Pure and worker-safe; the settlement adapter samples actor cells against it, the validator reads the
 * wildlife pins. A region is watched when an enter/leave event names it or a region read (`actorInRegion`,
 * `countInRegion`) depends on it, so its waits wake on the tick the membership changes.
 */

export const REGION_EVENT_KINDS: readonly ScriptEventKind[] = ["enteredRegion", "leftRegion"];

const REGION_READS: ReadonlySet<string> = new Set(["actorInRegion", "countInRegion"]);

/** Per-cell region lists: the regions of cell `c` are `ids[start[c]] .. ids[start[c + 1] - 1]` (ascending). */
export interface RegionCellLists {
  /** Indexes into the watched region list, sorted per cell. */
  ids: Uint16Array;
  /** `cells + 1` offsets into `ids`; an empty slice is an unwatched cell. */
  start: Uint32Array;
}

const isRegionEvent = (event: ScriptEvent) => REGION_EVENT_KINDS.includes(event.kind);

const regionSlotId = (event: ScriptEvent) => (event.slots.region as { id?: string } | null | undefined)?.id;

const refId = (value: unknown) => {
  const ref = value as { id?: unknown; k?: unknown } | undefined;
  return ref?.k === "ref" && typeof ref.id === "string" ? ref.id : undefined;
};

/** The `region` argument of a region predicate (`{ k: "is" }`) or function (`{ k: "fn" }`) node, if any. */
const regionReadId = (node: Record<string, unknown>) => {
  const name = node.k === "is" ? node.pred : node.fn;
  if ((node.k !== "is" && node.k !== "fn") || !REGION_READS.has(name as string)) return undefined;
  return refId((node.args as Record<string, unknown> | undefined)?.region);
};

/** Collects the regions read by predicates and functions anywhere inside a JSON-like value. */
const collectRegionReads = (value: unknown, found: Set<string>) => {
  if (Array.isArray(value)) {
    for (const item of value) collectRegionReads(item, found);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const node = value as Record<string, unknown>;
  const id = regionReadId(node);
  if (id !== undefined) found.add(id);
  for (const child of Object.values(node)) collectRegionReads(child, found);
};

/** Regions of the script the cell watch tracks, in the script's region order (stable region indexes). */
export const watchedRegions = (script: MapScript): MapRegion[] => {
  const referenced = new Set<string>();
  for (const trigger of script.triggers) {
    for (const event of trigger.events) {
      const id = isRegionEvent(event) ? regionSlotId(event) : undefined;
      if (id !== undefined) referenced.add(id);
    }
  }
  collectRegionReads(script.triggers, referenced);
  collectRegionReads(script.quests.quests, referenced);
  return script.regions.filter(region => referenced.has(region.id));
};

/** The catalog lookups the wildlife pin rule needs (the validator's catalog view, or the content catalog). */
export interface WildlifeCatalogLookup {
  entry: (id: string) => ContentEntryBase | undefined;
  family: (path: string) => readonly ContentEntryBase[];
}

/** An event subject selector that can name a simulated animal (a type or family covering an `animal:*` entry). */
export const isWildlifeSubject = (subject: unknown, catalog: WildlifeCatalogLookup) => {
  const selector = subject as { family?: { id: string }; kind?: string; type?: { type: { id: string } } } | undefined;
  const id = selector?.kind === "family" ? selector.family?.id : selector?.type?.type.id;
  if (!id) return false;
  const entries = selector!.kind === "family" ? catalog.family(id) : [catalog.entry(id)];
  return entries.some(entry => entry?.kind === "animal");
};

/**
 * Regions an animal enter/leave event names (§6.4 wildlife pins): they stay awake, so their animals are stepped
 * per tick and the watch sees them move. `isWildlifeSubject` decides from the event's subject selector.
 */
export const wildlifePinnedRegionIds = (
  script: MapScript, isWildlifeSubject: (subject: unknown) => boolean
): string[] => {
  const pinned = new Set<string>();
  for (const trigger of script.triggers) {
    for (const event of trigger.events) {
      if (!isRegionEvent(event) || !isWildlifeSubject(event.slots.subject)) continue;
      pinned.add(regionSlotId(event) ?? "");
    }
  }
  return [...pinned];
};

/** CSR lists of the watched regions over a `cellsX × cellsZ` map (region index = position in `regions`). */
export const buildRegionCellLists = (
  regions: readonly Pick<MapRegion, "shape">[], cellsX: number, cellsZ: number
): RegionCellLists => {
  const cellCount = cellsX * cellsZ;
  const rasters = regions.map(region => rasterizeRegion(region, cellsX, cellsZ));
  const start = new Uint32Array(cellCount + 1);
  for (const cells of rasters) for (const cell of cells) start[cell + 1] = start[cell + 1]! + 1;
  for (let cell = 0; cell < cellCount; cell++) start[cell + 1] = start[cell + 1]! + start[cell]!;
  const ids = new Uint16Array(start[cellCount]!);
  const fill = start.slice(0, cellCount);
  // Regions are visited in index order, so every cell's slice comes out sorted.
  rasters.forEach((cells, index) => {
    for (const cell of cells) {
      ids[fill[cell]!] = index;
      fill[cell] = fill[cell]! + 1;
    }
  });
  return { ids, start };
};
