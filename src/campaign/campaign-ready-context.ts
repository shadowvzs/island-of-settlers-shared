import { CAMPAIGN_DEFAULT_LANGUAGES, CAMPAIGN_LODGE_BUILDING_TYPE } from "./campaign-constants.ts";
import { campaignIssue, type CampaignIssue } from "./campaign-issues.ts";
import type {
  CampaignMap, CampaignSeason, CampaignSoldierType, CampaignWareAmount, CampaignWeather
} from "./campaign-model.ts";
import type { RegionReference } from "./campaign-region-library.ts";
import type { MapRegion, RegionBounds } from "./campaign-regions.ts";
import { missingTranslations, type TranslatableText } from "./campaign-text.ts";
import type { CampaignSpeaker } from "./cinematics/types.ts";

/**
 * Game knowledge the pure Ready validation needs. The caller (editor, C7a) builds it from the building catalog,
 * the ware list, the repository's image ids and the map file, so this module stays free of client imports.
 */
export interface CampaignReadyContext {
  /** Authored scenario unit script ids that cinematic steps may reference; omitted: those refs are not checked. */
  actorIds?: ReadonlySet<string>;
  /** Catalog building type → its highest level; also the set of known building types. */
  buildingMaxLevels: ReadonlyMap<number, number>;
  /** Image record ids that exist in the campaign repository. */
  imageIds: ReadonlySet<string>;
  /** Optional world check: false when the region lies in water or cannot be reached from the landing. */
  isRegionReachable?: (region: MapRegion) => boolean;
  /** Languages a Ready map should fill; default CAMPAIGN_DEFAULT_LANGUAGES. English is always required. */
  languages?: readonly string[];
  /** The map file's size in cells; omitted: regions are not checked against the map bounds. */
  mapBounds?: RegionBounds;
  /** Known music track ids; omitted: music steps are not checked. */
  musicTrackIds?: ReadonlySet<string>;
  /**
   * Script actors of the map file that have a display name (`namedActorIds`): a speak step may name one instead of
   * a campaign speaker. Omitted: only campaign speakers are accepted.
   */
  namedActorIds?: ReadonlySet<string>;
  /** Authored scenario building id → its building type, from the map file. */
  scenarioBuildings: ReadonlyMap<number, number>;
  /** Units of one ware (or soldier type) one supply ship carries. */
  shipCapacity: number;
  /** Building types that train each soldier type. */
  soldierSources: Readonly<Record<CampaignSoldierType, readonly number[]>>;
  /** Known sound cue ids; omitted: sound steps are not checked. */
  soundCueIds?: ReadonlySet<string>;
  /** The campaign manifest's speakers; omitted: speak steps' speakers are not checked. */
  speakers?: readonly CampaignSpeaker[];
  /** Unit types a cinematic may spawn; default CAMPAIGN_SOLDIER_TYPES. */
  unitTypes?: ReadonlySet<string>;
  wares: ReadonlySet<string>;
}

/** Shared state of one map validation run. */
export interface CampaignReadyRun {
  /** Fully banned types (the Lodge too when `lodgeAllowed` is off) that no quest claim effect unlocks again. */
  readonly blockedBuildingTypes: ReadonlySet<number>;
  readonly context: CampaignReadyContext;
  readonly issues: CampaignIssue[];
  readonly map: CampaignMap;
}

const blockedBuildingTypes = (map: CampaignMap) => {
  const unlocked = new Set(map.quests.flatMap(quest => quest.claimEffects)
    .flatMap(effect => effect.kind === "buildingAvailability" && effect.available ? [effect.buildingType] : []));
  const banned = map.disabledBuildings.filter(entry => entry.maxLevel === null).map(entry => entry.buildingType);
  if (!map.lodgeAllowed) banned.push(CAMPAIGN_LODGE_BUILDING_TYPE);
  return new Set(banned.filter(buildingType => !unlocked.has(buildingType)));
};

export const createReadyRun = (map: CampaignMap, context: CampaignReadyContext): CampaignReadyRun => ({
  blockedBuildingTypes: blockedBuildingTypes(map),
  context,
  issues: [],
  map
});

export const checkDuplicates = (run: Pick<CampaignReadyRun, "issues">, ids: readonly string[], path: string) => {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) run.issues.push(campaignIssue("error", "duplicateId", path, { id }));
    seen.add(id);
  }
};

/** True when a building that trains `type` exists in the catalog and is not fully banned on this map. */
export const isSoldierTypeTrainable = (run: CampaignReadyRun, type: CampaignSoldierType) =>
  run.context.soldierSources[type]
    .some(source => run.context.buildingMaxLevels.has(source) && !run.blockedBuildingTypes.has(source));

/** Missing English is an error (it is the fallback); any other missing language is a warning. */
export const checkTranslations = (run: Pick<CampaignReadyRun, "issues"> & {
  context: Pick<CampaignReadyContext, "languages">;
}, text: TranslatableText, path: string) => {
  if (!text.en.trim()) run.issues.push(campaignIssue("error", "missingFallbackText", path));
  const languages = run.context.languages ?? CAMPAIGN_DEFAULT_LANGUAGES;
  for (const language of missingTranslations(text, languages.filter(language => language !== "en")))
    run.issues.push(campaignIssue("warning", "missingTranslation", path, { language }));
};

export const checkWares = (run: CampaignReadyRun, lines: readonly CampaignWareAmount[], path: string) => {
  lines.forEach((line, index) => {
    if (!run.context.wares.has(line.ware))
      run.issues.push(campaignIssue("error", "unknownWare", `${path}[${index}].ware`, { ware: line.ware }));
  });
};

/** False (with an error) when `buildingType` is not in the catalog. */
export const checkBuildingType = (run: CampaignReadyRun, buildingType: number, path: string) => {
  if (run.context.buildingMaxLevels.has(buildingType)) return true;
  run.issues.push(campaignIssue("error", "unknownBuildingType", path, { buildingType }));
  return false;
};

/** References to regions that are not in the map's library (deleted or never drawn). */
export const checkRegionReferences = (run: CampaignReadyRun, references: readonly RegionReference[]) => {
  const regionIds = new Set(run.map.regions.map(region => region.id));
  for (const { path, regionId } of references)
    if (!regionIds.has(regionId)) run.issues.push(campaignIssue("error", "missingRegionReference", path, { regionId }));
};

export const checkScenarioBuilding = (run: CampaignReadyRun, buildingId: number, path: string) => {
  if (!run.context.scenarioBuildings.has(buildingId))
    run.issues.push(campaignIssue("error", "missingScenarioBuilding", path, { buildingId }));
};

/** Snowfall does not suit summer (owner edge case 10: an editor warning). */
export const checkWeather = (run: CampaignReadyRun, weather: CampaignWeather, season: CampaignSeason, path: string) => {
  if (weather === "snow" && season === "summer")
    run.issues.push(campaignIssue("warning", "weatherSeasonMismatch", path, { season, weather }));
};
