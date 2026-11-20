import {
  type CAMPAIGN_DIFFICULTIES, type CAMPAIGN_PUBLICATION_STATES, type CAMPAIGN_SEASONS, type CAMPAIGN_SOLDIER_TYPES,
  type CAMPAIGN_WEATHERS, DEFAULT_MAX_ENEMY_SOLDIERS
} from "./campaign-constants.ts";
import type { CampaignQuest } from "./campaign-quest.ts";
import type { MapRegion } from "./campaign-regions.ts";
import { createTranslatableText, type TranslatableText } from "./campaign-text.ts";
import type {
  CameraShot, CampaignMapSequenceHooks, CampaignSpeaker, CinematicSequence
} from "./cinematics/types.ts";

/** Draft documents skip Ready validation; only Ready campaigns and maps are visible to players. */
export type CampaignPublicationState = (typeof CAMPAIGN_PUBLICATION_STATES)[number];
/** One fixed level per map, chosen by the admin; never player-selectable. */
export type CampaignDifficulty = (typeof CAMPAIGN_DIFFICULTIES)[number];
export type CampaignSeason = (typeof CAMPAIGN_SEASONS)[number];
export type CampaignWeather = (typeof CAMPAIGN_WEATHERS)[number];
export type CampaignSoldierType = (typeof CAMPAIGN_SOLDIER_TYPES)[number];

/**
 * Every document the repositories store. `revision` is owned by the repository (optimistic concurrency: an update
 * must carry the revision it read); `updatedAt` is UTC milliseconds of the last write.
 */
export interface CampaignStoredRecord {
  id: string;
  revision: number;
  updatedAt: number;
}

export interface CampaignWareAmount {
  amount: number;
  ware: string;
}
export interface CampaignSoldierAmount {
  amount: number;
  type: CampaignSoldierType;
}
export interface CampaignDecorationAmount {
  amount: number;
  item: string;
}

/** Goods (tools included), soldiers and settlers shipped from home. */
export interface CampaignCargo {
  goods: CampaignWareAmount[];
  settlers: number;
  soldiers: CampaignSoldierAmount[];
}

/** Map, campaign and quest-home rewards; gems go to the account, the rest arrives on the reward ship. */
export interface CampaignRewards {
  coins: number;
  decorations: CampaignDecorationAmount[];
  gems: number;
  goods: CampaignWareAmount[];
  xp: number;
}

/** A rewarded soldier line: type and optional 0-based rank (absent: the base recruit). */
export interface CampaignRewardSoldier {
  amount: number;
  rank?: number;
  type: CampaignSoldierType;
}

/**
 * A campaign map's victory rewards (owner 2026-11-11): the shared rewards plus soldiers and settlers. Optional, so
 * stored maps stay valid. They are recorded and validated only; the reward ship delivers them in C12.
 */
export interface CampaignMapRewards extends CampaignRewards {
  settlers?: number;
  soldiers?: CampaignRewardSoldier[];
}

/** Owner 2026-11-09 unlock conditions; all of them must hold. */
export type CampaignUnlockCondition =
  /** The map before this one in its campaign's order is completed. */
  | { kind: "previousMapCompleted" }
  | { kind: "playerLevel"; level: number }
  /** Goods that must be present in home storage (checked, not shipped; the shipment is `requiredCargo`). */
  | { goods: CampaignWareAmount[]; kind: "homeGoods" }
  | { buildingType: number; count: number; kind: "homeBuilding"; minLevel: number };

/** What `holdArea` must keep: a library region or the landing harbour. */
export type CampaignHoldTarget = { kind: "region"; regionId: string } | { kind: "landingHarbour" };

/** One victory rule per map (owner answers to the plan review). */
export type CampaignVictoryRule =
  | { kind: "destroyHeadquarters" }
  | { kind: "eliminateArmy" }
  | { kind: "totalVictory" }
  /** `buildingId` is the authored scenario building id of the target. */
  | { buildingId: number; kind: "destroyTarget" }
  | { kind: "holdArea"; seconds: number; target: CampaignHoldTarget }
  | { kind: "surviveWaves"; waves: number }
  | { kind: "surviveTime"; seconds: number };

/** `maxLevel: null` bans the type; a number caps its level (SelectionPanel max-level mode). */
export interface CampaignDisabledBuilding {
  buildingType: number;
  maxLevel: number | null;
}

/** The editor level of an authored (preset) building, by scenario building id. */
export interface CampaignPresetBuildingLevel {
  buildingId: number;
  level: number;
}

export interface CampaignSupplyWare {
  maxAmount: number;
  ware: string;
}
export interface CampaignSupplySoldier {
  maxAmount: number;
  type: CampaignSoldierType;
}
/** Home supply requests: at most `maxRequests` ships, each limited to these lines (amount ≤ one ship). */
export interface CampaignSupplyRequests {
  maxRequests: number;
  soldiers: CampaignSupplySoldier[];
  wares: CampaignSupplyWare[];
}

/** Start state of the campaign map's own clock and sky (each island keeps its own clock). */
export interface CampaignStartEnvironment {
  /** Game clock hour, 0 ≤ hour < 24 (fractions are minutes), like EnvironmentDefaults.hour. */
  hour: number;
  season: CampaignSeason;
  weather: CampaignWeather;
}

/** The authored map file a campaign map plays: an editor map slot/revision id and its content hash. */
export interface CampaignMapFileRef {
  hash: string | null;
  id: string;
}

/** A map's node on the campaign map view (C6): u,v are 0–1 fractions of the campaign image width and height. */
export interface CampaignMapNode {
  mapId: string;
  u: number;
  v: number;
}

/** A named way to win a map; the map script picks it with `endMap(victory, exit)` (BR0). */
export interface CampaignMapExit {
  /** `exit-<n>` from `CampaignMap.nextExitNumber`; never reused. */
  id: string;
  /** Shown on the completed node in the player window and in the editor ("The village was spared"). */
  name: TranslatableText;
  /** Optional epilogue of this exit; absent: the map's `victorySequenceId`. */
  victorySequenceId?: string;
}

/**
 * One unlock rule of the campaign graph (BR0): when `from` was first won through `exit`, `to` becomes available;
 * `to: null` ends the campaign. Phase 2 (BR5/BR6) adds conditions and player choice; they are not part of this shape.
 */
export interface CampaignEdge {
  /** `CAMPAIGN_DEFAULT_EXIT` or an exit id of `from`. */
  exit: string;
  /** A listed map id. */
  from: string;
  /** `edge-<n>` from `Campaign.nextEdgeNumber`; stable, never reused. */
  id: string;
  /** A listed map id, or null: the campaign is completed. */
  to: string | null;
}

/** A campaign: translatable names, ordered maps, an optional availability window and a completion reward. */
export interface Campaign extends CampaignStoredRecord {
  /** UTC milliseconds; null on either side leaves that side open. Started runs may finish after it ends. */
  availability: { from: number | null; until: number | null };
  description: TranslatableText;
  /** The campaign graph (BR0). Absent: the linear graph of `mapIds` (`campaignGraphOf`). */
  edges?: CampaignEdge[];
  /** The campaign map view image (a WebP campaign image record id, owner art only); absent until uploaded (C6). */
  imageId?: string;
  /**
   * The graph's nodes in editor order (the play order of a campaign without `edges`); every listed map names this
   * campaign as its `campaignId`.
   */
  mapIds: string[];
  /** Node positions of the listed maps on the campaign image (C6); consecutive maps are joined by a path. */
  mapNodes?: CampaignMapNode[];
  name: TranslatableText;
  /** Number of the next `edge-<n>` id; only grows, so a deleted edge's id is never reused. */
  nextEdgeNumber?: number;
  rewards: CampaignRewards;
  /** Recurring story figures of the cinematics speak steps, shared by every map (CIN1). */
  speakers?: CampaignSpeaker[];
  /** Maps available from the start of the campaign (BR0). Absent: derived (`campaignGraphOf`). */
  startMapIds?: string[];
  state: CampaignPublicationState;
}

/** One campaign map: belongs to exactly one campaign and carries everything the run clones at start. */
export interface CampaignMap extends CampaignStoredRecord, CampaignMapSequenceHooks {
  /** Named, reusable camera shots of the cinematics (CIN1). */
  cameraShots?: CameraShot[];
  campaignId: string;
  /** The shipped commander may join this map (owner Q9 follow-up); independent of the Lodge (owner answers). */
  commanderAllowed: boolean;
  difficulty: CampaignDifficulty;
  disabledBuildings: CampaignDisabledBuilding[];
  /** Named victory exits besides the implicit `victory` (BR0); the campaign's edges start from them. */
  exits?: CampaignMapExit[];
  /** Optional additions the player may ship on top of `requiredCargo` (caps per line). */
  extraCargo: CampaignCargo;
  /**
   * The Commander's Lodge (re-summoning) is buildable here. The single source of truth for the Lodge: it never goes
   * into `disabledBuildings`; `campaignScenarioRules` bans it on the runtime map when this is off.
   */
  lodgeAllowed: boolean;
  mapFile: CampaignMapFileRef;
  /** Required setting: waves above it spawn only up to this many living enemy soldiers. */
  maxEnemySoldiers: number;
  /** Track id; handled by a later audio lane. */
  music: string;
  name: TranslatableText;
  /** Number of the next `exit-<n>` id; only grows, so a deleted exit's id is never reused. */
  nextExitNumber?: number;
  /** Number of the next `region-<n>` id; only grows, so a deleted region's id is never reused (CIN0). */
  nextRegionNumber: number;
  presetBuildingLevels: CampaignPresetBuildingLevel[];
  quests: CampaignQuest[];
  /** The map's region library (CIN0), referenced by id from quests, the victory rule and cinematics. */
  regions: MapRegion[];
  requiredCargo: CampaignCargo;
  rewards: CampaignMapRewards;
  /** Cinematic sequences, played through the map and quest hooks (CIN1). */
  sequences?: CinematicSequence[];
  /** Most player soldiers allowed on the map; overflow waits in the HQ reserve at home. */
  soldierCap: number;
  start: CampaignStartEnvironment;
  state: CampaignPublicationState;
  supplyRequests: CampaignSupplyRequests;
  unlock: CampaignUnlockCondition[];
  /** Default off (owner Q8 follow-up). */
  upgradesAllowed: boolean;
  victory: CampaignVictoryRule;
}

export const createCampaignCargo = (): CampaignCargo => ({ goods: [], settlers: 0, soldiers: [] });
export const createCampaignRewards = (): CampaignRewards => ({ coins: 0, decorations: [], gems: 0, goods: [], xp: 0 });

export const createCampaign = (id: string): Campaign => ({
  availability: { from: null, until: null },
  description: createTranslatableText(),
  id,
  mapIds: [],
  name: createTranslatableText(),
  revision: 0,
  rewards: createCampaignRewards(),
  state: "draft",
  updatedAt: 0
});

/** A new draft map with the owner defaults: no commander/Lodge/upgrades, 100 enemy soldiers at most. */
export const createCampaignMap = (id: string, campaignId: string, mapFile: CampaignMapFileRef): CampaignMap => ({
  campaignId,
  commanderAllowed: false,
  difficulty: "normal",
  disabledBuildings: [],
  extraCargo: createCampaignCargo(),
  id,
  lodgeAllowed: false,
  mapFile,
  maxEnemySoldiers: DEFAULT_MAX_ENEMY_SOLDIERS,
  music: "",
  name: createTranslatableText(),
  nextRegionNumber: 1,
  presetBuildingLevels: [],
  quests: [],
  regions: [],
  requiredCargo: createCampaignCargo(),
  revision: 0,
  rewards: createCampaignRewards(),
  soldierCap: 0,
  start: { hour: 8, season: "summer", weather: "clear" },
  state: "draft",
  supplyRequests: { maxRequests: 0, soldiers: [], wares: [] },
  unlock: [{ kind: "previousMapCompleted" }],
  updatedAt: 0,
  upgradesAllowed: false,
  victory: { kind: "totalVictory" }
});
