import {
  CAMPAIGN_LIMITS, CAMPAIGN_QUEST_REPEAT_MODES, CAMPAIGN_SOLDIER_TYPES, CAMPAIGN_UNIT_FILTERS, CAMPAIGN_WEATHERS
} from "./campaign-constants.ts";
import {
  amount, arrayOf, booleanValue, discriminatedUnion, hour, identifier, integerIn, kindUnion, nullable, objectOf,
  oneOf, optional, translatableText
} from "./campaign-shape-checks.ts";
import { questCinematicFields } from "./cinematics/shape.ts";

export { hour } from "./campaign-shape-checks.ts";

/** Shape checks shared by the map and quest documents. */
export const buildingType = integerIn(0, 1000);
export const scenarioBuildingId = integerIn(1, 1_000_000);
export const seconds = integerIn(1, CAMPAIGN_LIMITS.maxDurationSeconds);
export const soldierType = oneOf(CAMPAIGN_SOLDIER_TYPES);
export const wareAmounts = arrayOf(objectOf({ amount, ware: identifier }), CAMPAIGN_LIMITS.cargoLines);
export const soldierAmounts = arrayOf(objectOf({ amount, type: soldierType }), CAMPAIGN_SOLDIER_TYPES.length);
export const rewards = objectOf({
  coins: integerIn(0, CAMPAIGN_LIMITS.maxAmount),
  decorations: arrayOf(objectOf({ amount, item: identifier }), CAMPAIGN_LIMITS.decorationLines),
  gems: integerIn(0, CAMPAIGN_LIMITS.maxAmount),
  goods: wareAmounts,
  xp: integerIn(0, CAMPAIGN_LIMITS.maxAmount)
});
/** Campaign map rewards: the shared rewards plus optional ranked soldiers and settlers (owner 2026-11-11). */
export const mapRewards = objectOf({
  coins: integerIn(0, CAMPAIGN_LIMITS.maxAmount),
  decorations: arrayOf(objectOf({ amount, item: identifier }), CAMPAIGN_LIMITS.decorationLines),
  gems: integerIn(0, CAMPAIGN_LIMITS.maxAmount),
  goods: wareAmounts,
  settlers: optional(integerIn(0, CAMPAIGN_LIMITS.maxCount)),
  soldiers: optional(arrayOf(objectOf({
    amount, rank: optional(integerIn(0, CAMPAIGN_LIMITS.maxSoldierRank)), type: soldierType
  }), CAMPAIGN_SOLDIER_TYPES.length * (CAMPAIGN_LIMITS.maxSoldierRank + 2))),
  xp: integerIn(0, CAMPAIGN_LIMITS.maxAmount)
});
const questCount = integerIn(1, CAMPAIGN_LIMITS.maxCount);

const trigger = kindUnion({
  areaReached: { regionId: identifier, unitFilter: oneOf(CAMPAIGN_UNIT_FILTERS) },
  buildingCompleted: { buildingType, count: questCount },
  clockTime: { hour },
  defeat: {},
  elapsedTime: { seconds },
  enemiesDefeated: { count: questCount },
  enemyBuildingDestroyed: { buildingId: nullable(scenarioBuildingId) },
  mapStart: {},
  prerequisitesDone: {},
  soldierCount: { count: questCount, soldierType: oneOf([...CAMPAIGN_SOLDIER_TYPES, "total"]) },
  stockLevel: { amount, ware: identifier },
  victory: {}
});

const waveArrival = discriminatedUnion("mode", {
  instant: { spawnRegionId: identifier }, ship: { landingRegionId: identifier }
});

const claimEffect = kindUnion({
  buildingAvailability: { available: booleanValue, buildingType },
  enemyWave: { arrival: waveArrival, soldiers: soldierAmounts, targetRegionId: identifier },
  revealFog: { regionId: identifier },
  timeOfDay: { hour },
  weather: { weather: oneOf(CAMPAIGN_WEATHERS) }
});

export const quest = objectOf({
  ...questCinematicFields,
  claimEffects: arrayOf(claimEffect, CAMPAIGN_LIMITS.claimEffects),
  highlightRegion: booleanValue,
  homeReward: nullable(rewards),
  id: identifier,
  imageId: nullable(identifier),
  mapReward: nullable(objectOf({ goods: wareAmounts, soldiers: soldierAmounts })),
  prerequisites: arrayOf(identifier, CAMPAIGN_LIMITS.prerequisites),
  repeat: oneOf(CAMPAIGN_QUEST_REPEAT_MODES),
  text: translatableText(CAMPAIGN_LIMITS.textLength),
  timeLimitSeconds: nullable(seconds),
  title: translatableText(CAMPAIGN_LIMITS.nameLength),
  trigger
});
