import { BuildingType } from "../src/building-types.ts";
import { createCampaign, createCampaignMap, type Campaign, type CampaignMap } from "../src/campaign/campaign-model.ts";
import type { CampaignQuest } from "../src/campaign/campaign-quest.ts";
import type { CampaignReadyContext } from "../src/campaign/campaign-ready-validation.ts";

/** Shared campaign test fixtures: a valid Ready map and the game knowledge it is validated against. */
export const readyContext = (overrides: Partial<CampaignReadyContext> = {}): CampaignReadyContext => ({
  buildingMaxLevels: new Map<number, number>([
    [BuildingType.Barracks, 5], [BuildingType.Sawmill, 5], [BuildingType.Harbour, 5], [BuildingType.Storehouse, 5],
    [BuildingType.CommandersLodge, 5], [BuildingType.MilitaryAcademy, 5], [BuildingType.Guardhouse, 5]
  ]),
  imageIds: new Set(["image-intro"]),
  languages: ["en", "hu"],
  scenarioBuildings: new Map([[7, BuildingType.Guardhouse]]),
  shipCapacity: 528,
  soldierSources: {
    archer: [BuildingType.MilitaryAcademy],
    heavy: [BuildingType.MilitaryAcademy],
    shield: [BuildingType.Barracks]
  },
  wares: new Set(["planks", "stone", "hammer"]),
  ...overrides
});

export const quest = (id: string, overrides: Partial<CampaignQuest> = {}): CampaignQuest => ({
  claimEffects: [],
  highlightRegion: false,
  homeReward: null,
  id,
  imageId: null,
  mapReward: null,
  prerequisites: [],
  repeat: "once",
  text: { en: `Text ${id}`, hu: `Szöveg ${id}` },
  timeLimitSeconds: null,
  title: { en: `Title ${id}`, hu: `Cím ${id}` },
  trigger: { kind: "mapStart" },
  ...overrides
});

export const readyMap = (overrides: Partial<CampaignMap> = {}): CampaignMap => ({
  ...createCampaignMap("map-1", "campaign-1", { hash: null, id: "campaign/campaign-1/map-1" }),
  name: { en: "First landing", hu: "Első partraszállás" },
  nextRegionNumber: 2,
  quests: [
    quest("q-intro", { imageId: "image-intro" }),
    quest("q-gate", {
      claimEffects: [{ hour: 20, kind: "timeOfDay" }, { kind: "revealFog", regionId: "region-1" }],
      prerequisites: ["q-intro"],
      trigger: { kind: "areaReached", regionId: "region-1", unitFilter: "soldier" }
    })
  ],
  regions: [{ id: "region-1", name: "Gate", shape: { centerX: 10, centerZ: 12, kind: "circle", radius: 4 } }],
  requiredCargo: { goods: [{ amount: 20, ware: "planks" }], settlers: 4, soldiers: [{ amount: 6, type: "shield" }] },
  soldierCap: 30,
  state: "ready",
  supplyRequests: { maxRequests: 2, soldiers: [], wares: [{ maxAmount: 100, ware: "stone" }] },
  victory: { buildingId: 7, kind: "destroyTarget" },
  ...overrides
});

export const readyCampaign = (overrides: Partial<Campaign> = {}): Campaign => ({
  ...createCampaign("campaign-1"),
  imageId: "image-1",
  mapIds: ["map-1"],
  mapNodes: [{ mapId: "map-1", u: 0.25, v: 0.5 }],
  name: { en: "The northern isles", hu: "Az északi szigetek" },
  state: "ready",
  ...overrides
});
