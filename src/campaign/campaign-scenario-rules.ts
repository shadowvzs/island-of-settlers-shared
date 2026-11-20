import { CAMPAIGN_LODGE_BUILDING_TYPE, CAMPAIGN_PROTECTED_BUILDING_TYPES } from "./campaign-constants.ts";
import type { CampaignMap } from "./campaign-model.ts";

/** The campaign rule fields of the runtime map scenario (C3 reads them: `MapScenario.disabledBuildings` etc.). */
export interface CampaignScenarioRules {
  commanderAllowed: boolean;
  /** Unique, ascending, fully banned catalog ids; never a protected type. */
  disabledBuildings: number[];
}

/**
 * What the run's map scenario gets from the campaign map (C9a applies it over the map file). Single source of
 * truth for the Lodge (C7a): `lodgeAllowed` alone decides it, so the Lodge is banned exactly when the flag is off,
 * whatever the building list says. The runtime still requires `commanderAllowed` for the Lodge (C3, review R11).
 * Max-level caps (`maxLevel` set) are not bans and stay with the campaign map.
 */
export const campaignScenarioRules = (
  map: Pick<CampaignMap, "commanderAllowed" | "disabledBuildings" | "lodgeAllowed">
): CampaignScenarioRules => {
  const banned = new Set(map.disabledBuildings.filter(entry => entry.maxLevel === null)
    .map(entry => entry.buildingType));
  banned.delete(CAMPAIGN_LODGE_BUILDING_TYPE);
  if (!map.lodgeAllowed) banned.add(CAMPAIGN_LODGE_BUILDING_TYPE);
  for (const protectedType of CAMPAIGN_PROTECTED_BUILDING_TYPES) banned.delete(protectedType);
  return {
    commanderAllowed: map.commanderAllowed,
    disabledBuildings: [...banned].sort((first, second) => first - second)
  };
};
