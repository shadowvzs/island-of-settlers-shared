import { CAMPAIGN_REGION_DEFAULT_COLOR, CAMPAIGN_REGION_ID_PREFIX } from "./campaign-constants.ts";
import type { CampaignMap } from "./campaign-model.ts";
import type { CampaignClaimEffect, CampaignQuest } from "./campaign-quest.ts";
import type { MapRegion, RegionShape, RegionShapeKind } from "./campaign-regions.ts";
import type { CinematicSequence, CinematicStep } from "./cinematics/types.ts";

/**
 * Region library operations (CIN0) and the one list of every field that references a region. The editor's
 * AreaPicker is "pick a region or draw a new one": drawing calls `addRegion` and stores the returned id, so every
 * user (quests, the victory rule, claim effects, cinematic steps) holds a region id, never inline geometry.
 * Every operation is pure and returns a new map; ids are `region-<n>` and never reused.
 */
export type RegionLibraryMap = Pick<CampaignMap, "nextRegionNumber" | "quests" | "regions" | "sequences" | "victory">;

/** Who holds a region reference. */
export type RegionUser =
  | { kind: "quest"; questId: string }
  | { kind: "sequence"; sequenceId: string; stepId: string }
  | { kind: "victory" };

export interface RegionReference {
  /** Field path in the map document, e.g. `quests[2].trigger.regionId`. */
  path: string;
  regionId: string;
  user: RegionUser;
}

export interface RegionDraft {
  color?: string;
  name: string;
  shape: RegionShape;
}

export type RegionDeletion<T> = { deleted: true; map: T } | { deleted: false; users: RegionReference[] };

/** One row of the editor's region list. */
export interface RegionLibraryRow {
  color: string;
  id: string;
  name: string;
  shapeKind: RegionShapeKind;
  users: RegionReference[];
}

type ReferenceSink = (regionId: string | undefined, path: string) => void;

const effectReferences = (effect: CampaignClaimEffect, path: string, add: ReferenceSink) => {
  if (effect.kind === "revealFog") add(effect.regionId, `${path}.regionId`);
  if (effect.kind !== "enemyWave") return;
  const { arrival } = effect;
  if (arrival.mode === "ship") add(arrival.landingRegionId, `${path}.arrival.landingRegionId`);
  else add(arrival.spawnRegionId, `${path}.arrival.spawnRegionId`);
  add(effect.targetRegionId, `${path}.targetRegionId`);
};

const questReferences = (quest: CampaignQuest, path: string, add: ReferenceSink) => {
  if (quest.trigger.kind === "areaReached") add(quest.trigger.regionId, `${path}.trigger.regionId`);
  quest.claimEffects.forEach((effect, index) => effectReferences(effect, `${path}.claimEffects[${index}]`, add));
};

const stepReferences = (step: CinematicStep, path: string, add: ReferenceSink) => {
  if (step.kind === "camera") add(step.drift?.targetToRegionId, `${path}.drift.targetToRegionId`);
  if (step.kind === "spawn" || step.kind === "walk" || step.kind === "highlight" || step.kind === "lightning")
    add(step.regionId, `${path}.regionId`);
};

const sequenceReferences = (sequence: CinematicSequence, path: string, add: (user: RegionUser) => ReferenceSink) => {
  sequence.steps.forEach((step, index) =>
    stepReferences(step, `${path}.steps[${index}]`, add({ kind: "sequence", sequenceId: sequence.id,
      stepId: step.id })));
};

/** Every region reference of the map in document order (victory, quests, sequences). */
export const regionReferences = (map: Omit<RegionLibraryMap, "nextRegionNumber" | "regions">) => {
  const references: RegionReference[] = [];
  const sink = (user: RegionUser): ReferenceSink => (regionId, path) => {
    if (regionId !== undefined) references.push({ path, regionId, user });
  };
  const { victory } = map;
  if (victory.kind === "holdArea" && victory.target.kind === "region")
    sink({ kind: "victory" })(victory.target.regionId, "victory.target.regionId");
  map.quests.forEach((quest, index) =>
    questReferences(quest, `quests[${index}]`, sink({ kind: "quest", questId: quest.id })));
  (map.sequences ?? []).forEach((sequence, index) => sequenceReferences(sequence, `sequences[${index}]`, sink));
  return references;
};

/** The references to one region: the users listed when its deletion is refused. */
export const regionUsers = (map: RegionLibraryMap, regionId: string) =>
  regionReferences(map).filter(reference => reference.regionId === regionId);

const regionNumber = (id: string) => {
  if (!id.startsWith(CAMPAIGN_REGION_ID_PREFIX)) return 0;
  const number = Number(id.slice(CAMPAIGN_REGION_ID_PREFIX.length));
  return Number.isSafeInteger(number) ? number : 0;
};

/** The next free number: the stored counter, or past any imported `region-<n>` id above it. */
const nextNumber = (map: RegionLibraryMap) =>
  Math.max(map.nextRegionNumber, ...map.regions.map(region => regionNumber(region.id) + 1));

/** Adds a region with a fresh id (drawing in the AreaPicker); the caller stores `region.id` in its field. */
export const addRegion = <T extends RegionLibraryMap>(map: T, draft: RegionDraft): { map: T; region: MapRegion } => {
  const number = nextNumber(map);
  const region: MapRegion = { ...draft, id: `${CAMPAIGN_REGION_ID_PREFIX}${number}` };
  return { map: { ...map, nextRegionNumber: number + 1, regions: [...map.regions, region] }, region };
};

const updateRegion = <T extends RegionLibraryMap>(map: T, regionId: string, change: Partial<MapRegion>): T => {
  if (!map.regions.some(region => region.id === regionId)) return map;
  return { ...map, regions: map.regions.map(region => region.id === regionId ? { ...region, ...change } : region) };
};

export const renameRegion = <T extends RegionLibraryMap>(map: T, regionId: string, name: string) =>
  updateRegion(map, regionId, { name });

/** Redraws a region in place; its id, and so every reference, stays. */
export const reshapeRegion = <T extends RegionLibraryMap>(map: T, regionId: string, shape: RegionShape) =>
  updateRegion(map, regionId, { shape });

/** Deletes an unused region; refused while referenced, listing the users. An unknown id leaves the map as is. */
export const deleteRegion = <T extends RegionLibraryMap>(map: T, regionId: string): RegionDeletion<T> => {
  const users = regionUsers(map, regionId);
  if (users.length) return { deleted: false, users };
  return { deleted: true, map: { ...map, regions: map.regions.filter(region => region.id !== regionId) } };
};

/** The editor list: every region with its colour, shape kind and users (a region with users cannot be deleted). */
export const regionLibraryRows = (map: RegionLibraryMap): RegionLibraryRow[] => {
  const references = regionReferences(map);
  return map.regions.map(region => ({
    color: region.color ?? CAMPAIGN_REGION_DEFAULT_COLOR,
    id: region.id,
    name: region.name,
    shapeKind: region.shape.kind,
    users: references.filter(reference => reference.regionId === region.id)
  }));
};
