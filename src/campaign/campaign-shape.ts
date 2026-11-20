import { string } from "../validation/index.ts";
import {
  CAMPAIGN_DEFAULT_EXIT, CAMPAIGN_DIFFICULTIES, CAMPAIGN_EDGE_ID_PREFIX, CAMPAIGN_EXIT_ID_PREFIX,
  CAMPAIGN_IMAGE_MAX_BYTES, CAMPAIGN_IMAGE_MAX_EDGE, CAMPAIGN_IMAGE_MIME_TYPE, CAMPAIGN_LIMITS,
  CAMPAIGN_PUBLICATION_STATES, CAMPAIGN_SEASONS, CAMPAIGN_SOLDIER_TYPES, CAMPAIGN_WEATHERS
} from "./campaign-constants.ts";
import type { CampaignIssue } from "./campaign-issues.ts";
import {
  buildingType, hour, mapRewards, quest, rewards, scenarioBuildingId, seconds, soldierAmounts, soldierType, wareAmounts
} from "./campaign-quest-shape.ts";
import {
  amount, arrayOf, booleanValue, checkShape, count, countMap, guard, identifier, integerIn,
  kindUnion, literal, nullable, numberIn, objectOf, oneOf, optional, type ShapeCheck, type ShapeFields, stringUpTo,
  timestamp,
  translatableText
} from "./campaign-shape-checks.ts";
import { campaignSpeakers, mapCinematicFields } from "./cinematics/shape.ts";

const stored: ShapeFields = { id: identifier, revision: integerIn(0, 2_147_483_647), updatedAt: timestamp };
const state = oneOf(CAMPAIGN_PUBLICATION_STATES);
const name = translatableText(CAMPAIGN_LIMITS.nameLength);
const level = integerIn(1, CAMPAIGN_LIMITS.maxBuildingLevel);
const cargo = objectOf({ goods: wareAmounts, settlers: count, soldiers: soldierAmounts });

const coordinate = numberIn(0, 100_000);
/** Structural only; min < max and the map bounds are checked by validateRegions. Shared with the map script. */
export const mapRegionShape = objectOf({
  color: optional(guard(value => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value))),
  id: identifier,
  name: stringUpTo(CAMPAIGN_LIMITS.nameLength),
  shape: kindUnion({
    circle: { centerX: coordinate, centerZ: coordinate, radius: numberIn(0.5, 10_000) },
    point: { facing: guard(value => typeof value === "number" && Number.isFinite(value)), x: coordinate,
      z: coordinate },
    rect: { maxX: coordinate, maxZ: coordinate, minX: coordinate, minZ: coordinate }
  })
});

const unlock = kindUnion({
  homeBuilding: { buildingType, count: integerIn(1, CAMPAIGN_LIMITS.maxCount), minLevel: level },
  homeGoods: { goods: wareAmounts },
  playerLevel: { level: integerIn(1, 1000) },
  previousMapCompleted: {}
});

const victory = kindUnion({
  destroyHeadquarters: {},
  destroyTarget: { buildingId: scenarioBuildingId },
  eliminateArmy: {},
  holdArea: { seconds, target: kindUnion({ landingHarbour: {}, region: { regionId: identifier } }) },
  surviveTime: { seconds },
  surviveWaves: { waves: integerIn(1, CAMPAIGN_LIMITS.maxCount) },
  totalVictory: {}
});

const supplyRequests = objectOf({
  maxRequests: integerIn(0, CAMPAIGN_LIMITS.maxCount),
  soldiers: arrayOf(objectOf({ maxAmount: amount, type: soldierType }), CAMPAIGN_SOLDIER_TYPES.length),
  wares: arrayOf(objectOf({ maxAmount: amount, ware: identifier }), CAMPAIGN_LIMITS.cargoLines)
});

/** A 0–1 fraction (campaign map view u,v), both ends included. */
const unitFraction = guard(value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);

/** A numbered id `<prefix><n>` (n ≥ 1), as the `next…Number` counters issue them. */
const numberedId = (prefix: string) => string({
  maxLength: CAMPAIGN_LIMITS.identifierLength, minLength: 1, pattern: new RegExp(`^${prefix}[1-9]\\d*$`)
});
const nextNumber = optional(integerIn(1, 2_147_483_647));
const exitId = numberedId(CAMPAIGN_EXIT_ID_PREFIX);
/** An edge's exit: the implicit `victory` or a named exit id (whether `from` declares it is a Ready check). */
const edgeExit: ShapeCheck = (value, path, sink) => {
  if (value !== CAMPAIGN_DEFAULT_EXIT) exitId(value, path, sink);
};
const edge = objectOf({
  exit: edgeExit, from: identifier, id: numberedId(CAMPAIGN_EDGE_ID_PREFIX), to: nullable(identifier)
});
const mapExit = objectOf({ id: exitId, name, victorySequenceId: optional(identifier) });

export const campaignShape = objectOf({
  ...stored,
  availability: objectOf({ from: nullable(timestamp), until: nullable(timestamp) }),
  description: translatableText(CAMPAIGN_LIMITS.textLength),
  edges: optional(arrayOf(edge, CAMPAIGN_LIMITS.maps * CAMPAIGN_LIMITS.edgesPerMap)),
  imageId: optional(identifier),
  mapIds: arrayOf(identifier, CAMPAIGN_LIMITS.maps),
  mapNodes: optional(arrayOf(objectOf({ mapId: identifier, u: unitFraction, v: unitFraction }), CAMPAIGN_LIMITS.maps)),
  name,
  nextEdgeNumber: nextNumber,
  rewards,
  speakers: campaignSpeakers,
  startMapIds: optional(arrayOf(identifier, CAMPAIGN_LIMITS.maps)),
  state
});

export const campaignMapShape = objectOf({
  ...stored,
  ...mapCinematicFields,
  campaignId: identifier,
  commanderAllowed: booleanValue,
  difficulty: oneOf(CAMPAIGN_DIFFICULTIES),
  disabledBuildings: arrayOf(objectOf({ buildingType, maxLevel: nullable(level) }), CAMPAIGN_LIMITS.disabledBuildings),
  exits: optional(arrayOf(mapExit, CAMPAIGN_LIMITS.exitsPerMap)),
  extraCargo: cargo,
  lodgeAllowed: booleanValue,
  mapFile: objectOf({ hash: nullable(stringUpTo(128)), id: stringUpTo(256) }),
  maxEnemySoldiers: integerIn(1, CAMPAIGN_LIMITS.maxCount),
  music: stringUpTo(CAMPAIGN_LIMITS.musicLength),
  name,
  nextExitNumber: nextNumber,
  nextRegionNumber: integerIn(1, 2_147_483_647),
  presetBuildingLevels: arrayOf(objectOf({ buildingId: scenarioBuildingId, level }), CAMPAIGN_LIMITS.presetLevels),
  quests: arrayOf(quest, CAMPAIGN_LIMITS.quests),
  regions: arrayOf(mapRegionShape, CAMPAIGN_LIMITS.regions),
  requiredCargo: cargo,
  rewards: mapRewards,
  soldierCap: count,
  start: objectOf({ hour, season: oneOf(CAMPAIGN_SEASONS), weather: oneOf(CAMPAIGN_WEATHERS) }),
  state,
  supplyRequests,
  unlock: arrayOf(unlock, CAMPAIGN_LIMITS.unlockConditions),
  upgradesAllowed: booleanValue,
  victory
});

const imageBytes = guard(value =>
  value instanceof Uint8Array && value.length > 0 && value.length <= CAMPAIGN_IMAGE_MAX_BYTES);

const campaignImageShape = objectOf({
  ...stored,
  bytes: imageBytes,
  campaignId: identifier,
  height: integerIn(1, CAMPAIGN_IMAGE_MAX_EDGE),
  mimeType: literal(CAMPAIGN_IMAGE_MIME_TYPE),
  width: integerIn(1, CAMPAIGN_IMAGE_MAX_EDGE)
});

const campaignStatisticsShape = objectOf({
  ...stored,
  accountId: nullable(identifier),
  attempts: count,
  bestCompletionSeconds: nullable(count),
  campaignId: identifier,
  defeats: count,
  givenUp: count,
  mapId: identifier,
  questCompletions: countMap(CAMPAIGN_LIMITS.statisticsQuestEntries),
  questFailures: countMap(CAMPAIGN_LIMITS.statisticsQuestEntries),
  totalCompletionSeconds: integerIn(0, Number.MAX_SAFE_INTEGER),
  victories: count
});

/** Structural errors of a stored document (draft or ready); an empty list means the shape is valid. */
export const checkCampaignShape = (value: unknown): CampaignIssue[] => checkShape(campaignShape, value, "campaign");
export const checkCampaignMapShape = (value: unknown): CampaignIssue[] => checkShape(campaignMapShape, value, "map");
export const checkCampaignImageShape = (value: unknown): CampaignIssue[] =>
  checkShape(campaignImageShape, value, "image");
export const checkCampaignStatisticsShape = (value: unknown): CampaignIssue[] =>
  checkShape(campaignStatisticsShape, value, "statistics");
