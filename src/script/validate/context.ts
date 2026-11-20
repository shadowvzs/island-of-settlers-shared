import type { AudioKind } from "../../catalog/types/audio.ts";
import { entriesInFamily, getContentEntry } from "../../catalog/loader.ts";
import type { ContentEntryBase } from "../../catalog/types/entry.ts";
import type { ScriptIssueSink } from "../issues.ts";
import type { ScriptActor } from "../types/actors.ts";
import type { ScriptQuest } from "../types/quests.ts";
import type { MapKind } from "../types/refs.ts";
import type { MapScript, ScriptVariable } from "../types/script.ts";
import type { ScriptTrigger } from "../types/triggers.ts";

/** The catalog facts the script validator reads (the real content catalog by default; tests may extend it). */
export interface ScriptCatalogView {
  /** The entry of an id, retired ones included; undefined for an unknown id. */
  entry: (id: string) => ContentEntryBase | undefined;
  /** Active entries whose family the selector covers. */
  family: (path: string) => readonly ContentEntryBase[];
  /** Deck capacity of a ship/boat entry (owner 2026-11-11); undefined until the entry declares it (CAT6/CAT10). */
  shipCapacity: (entry: ContentEntryBase) => ShipCapacity | undefined;
}

/** A ship's deck capacity: units aboard and ware boxes. */
export interface ShipCapacity {
  boxes?: number;
  passengers?: number;
}

/** The catalog payload field ship entries carry (`ship.capacity`); read without assuming the ship lane landed. */
const catalogShipCapacity = (entry: ContentEntryBase): ShipCapacity | undefined =>
  (entry as { ship?: { capacity?: ShipCapacity } }).ship?.capacity;

export const CONTENT_CATALOG_VIEW: ScriptCatalogView = Object.freeze({
  entry: (id: string) => getContentEntry(id),
  family: (path: string) => entriesInFamily(path),
  shipCapacity: catalogShipCapacity
});

/**
 * The map's computer faction AI as the faction AI actions need it (`setFactionAi`, `factionAiPause`; enemy economy
 * AI plan §5.2). The client builds it from `MapScenario.factionAi`; the limits are the map file's own.
 */
export interface ScriptFactionAiView {
  /** The faction's map entry lets it play `develop` (it has start settlers). */
  canDevelop: (faction: number) => boolean;
  /** The most factions that may play the `develop` mode on one map. */
  maxDevelopFactions: number;
  /** The map's mode of every faction a script may address: an AI entry, or authored units or buildings (`none`). */
  modes: ReadonlyMap<number, string>;
  /** The island's people (every AI faction's limits and the player's start) when `faction` plays `mode`. */
  peopleWith: (faction: number, mode: string) => number;
  /** The people one island is planned for. */
  peopleTarget: number;
}

/** Game knowledge the pure Ready check needs; the editor and the API build it (no client imports here). */
export interface ScriptValidationContext {
  /** Uploaded audio of the map (asset id → kind); omitted: `upload` audio references are not checked. */
  audioAssets?: ReadonlyMap<string, AudioKind>;
  /** Building types a `buildingUnlock` reward may name; omitted: any (building core is CAT7a). */
  buildingTypes?: ReadonlySet<number>;
  catalog?: ScriptCatalogView;
  /**
   * The campaign map's exits an `endMap` may name: the implicit `victory` plus the declared ones (`exitsOf`);
   * omitted (no campaign record at hand): exit references are not checked.
   */
  exitIds?: ReadonlySet<string>;
  /** The map's computer faction AI; omitted (no map at hand): faction AI actions are not checked against it. */
  factionAi?: ScriptFactionAiView;
  /** Trigger ids the fire limit switched off in the last play-test (warning). */
  fireLimitedTriggers?: readonly string[];
  /** Languages a Ready map should fill; default ["en", "hu"]. English is always required. */
  languages?: readonly string[];
  /** False when the map has no Commander's Lodge (commander actors refused); omitted: not checked. */
  mapHasCommandersLodge?: boolean;
  mapKind: MapKind;
  /** Troop keys a soldier reward may name; default the campaign soldier types. */
  soldierTypes?: readonly string[];
  /** The campaign manifest's speaker ids; omitted: speaker references are not checked. */
  speakerIds?: ReadonlySet<string>;
}

/** Lookups of one validation run, built once from the script. */
export interface ScriptIndex {
  actors: ReadonlyMap<string, ScriptActor>;
  folders: ReadonlySet<string>;
  groups: ReadonlySet<string>;
  quests: ReadonlyMap<string, ScriptQuest>;
  regions: ReadonlySet<string>;
  rewards: ReadonlySet<string>;
  sequences: ReadonlySet<string>;
  shots: ReadonlySet<string>;
  steps: ReadonlySet<string>;
  triggers: ReadonlyMap<string, ScriptTrigger>;
  variables: ReadonlyMap<string, ScriptVariable>;
}

export interface ValidationRun {
  catalog: ScriptCatalogView;
  context: ScriptValidationContext;
  /** Factions that may play `develop`: the map's, then each one a `setFactionAi` step switches to it. */
  developFactions: Set<number>;
  /** Set when any part reads or writes the world environment (§6.11). */
  environment: { reads: boolean };
  index: ScriptIndex;
  script: MapScript;
  sink: ScriptIssueSink;
}

const byId = <T extends { id: string }>(items: readonly T[]) => new Map(items.map(item => [item.id, item]));
const ids = (items: readonly { id: string }[]) => new Set(items.map(item => item.id));

const collectStepIds = (steps: readonly unknown[], into: Set<string>) => {
  for (const step of steps as readonly Record<string, unknown>[]) {
    into.add(step.id as string);
    for (const field of ["then", "else", "body"])
      if (Array.isArray(step[field])) collectStepIds(step[field] as unknown[], into);
  }
};

const stepIds = (script: MapScript) => {
  const steps = new Set<string>();
  for (const trigger of script.triggers) collectStepIds(trigger.actions, steps);
  for (const quest of script.quests.quests)
    for (const list of [quest.onActivate, quest.onSuccess, quest.onFailure]) collectStepIds(list, steps);
  return steps;
};

export const createValidationRun = (
  script: MapScript, context: ScriptValidationContext, sink: ScriptIssueSink
): ValidationRun => ({
  catalog: context.catalog ?? CONTENT_CATALOG_VIEW,
  context,
  developFactions: new Set([...context.factionAi?.modes ?? []].flatMap(([faction, mode]) =>
    (mode === "develop" ? [faction] : []))),
  environment: { reads: false },
  index: {
    actors: byId(script.actors),
    folders: ids(script.folders),
    groups: ids(script.quests.groups),
    quests: byId(script.quests.quests),
    regions: ids(script.regions),
    rewards: ids(script.homeRewards),
    sequences: ids(script.sequences),
    shots: ids(script.cameraShots),
    steps: stepIds(script),
    triggers: byId(script.triggers),
    variables: byId(script.variables)
  },
  script,
  sink
});
