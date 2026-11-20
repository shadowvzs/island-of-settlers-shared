import type { CAMPAIGN_QUEST_REPEAT_MODES, CAMPAIGN_UNIT_FILTERS } from "./campaign-constants.ts";
import type {
  CampaignRewards, CampaignSoldierAmount, CampaignSoldierType, CampaignWareAmount, CampaignWeather
} from "./campaign-model.ts";
import type { TranslatableText } from "./campaign-text.ts";

/** Which player units count in an area trigger; enemy units never count. */
export type CampaignUnitFilter = (typeof CAMPAIGN_UNIT_FILTERS)[number];
/** once; repeatable after a failure; repeatable after a failure and after a success. */
export type CampaignQuestRepeatMode = (typeof CAMPAIGN_QUEST_REPEAT_MODES)[number];

/**
 * A quest IS the task: its trigger condition is the goal, evaluated from events on a coarse cadence (never a
 * per-tick scan). `mapStart`, `defeat` and `victory` entries are pure story messages.
 */
export type CampaignQuestTrigger =
  | { kind: "mapStart" }
  /** A player unit enters a library region (CIN0: any region shape; a point region is its one cell). */
  | { kind: "areaReached"; regionId: string; unitFilter: CampaignUnitFilter }
  | { buildingType: number; count: number; kind: "buildingCompleted" }
  | { count: number; kind: "soldierCount"; soldierType: CampaignSoldierType | "total" }
  | { kind: "defeat" }
  | { kind: "victory" }
  /** Game clock hour of the campaign map (0 ≤ hour < 24); a quest is never active twice at once. */
  | { hour: number; kind: "clockTime" }
  /** `buildingId: null` is any enemy building; otherwise one authored scenario building. */
  | { buildingId: number | null; kind: "enemyBuildingDestroyed" }
  | { count: number; kind: "enemiesDefeated" }
  | { amount: number; kind: "stockLevel"; ware: string }
  /** Game seconds since the map started (pause-aware: campaign maps never catch up offline). */
  | { kind: "elapsedTime"; seconds: number }
  | { kind: "prerequisitesDone" };

export type CampaignQuestTriggerKind = CampaignQuestTrigger["kind"];

/**
 * How an enemy wave arrives: by ship to a landing region, or appearing in a spawn region. Regions are library ids;
 * a point region also gives the facing.
 */
export type CampaignWaveArrival =
  | { landingRegionId: string; mode: "ship" }
  | { mode: "instant"; spawnRegionId: string };

/**
 * Side effects applied in list order when the player claims a successful quest. The former camera glide is the
 * quest's "Sequence on completion" now (cinematics owner answer Q8).
 */
export type CampaignClaimEffect =
  /** Forward-only fast transition to this game clock hour (3–6 s, owner 2026-11-09). */
  | { hour: number; kind: "timeOfDay" }
  /** Spawn capped by the map's maxEnemySoldiers; occupied cells fall back to the nearest free ones. */
  | {
    arrival: CampaignWaveArrival; kind: "enemyWave"; soldiers: CampaignSoldierAmount[]; targetRegionId: string;
  }
  | { kind: "revealFog"; regionId: string }
  /** Unlock overrides the map blacklist; block keeps existing buildings working and prevents new ones. */
  | { available: boolean; buildingType: number; kind: "buildingAvailability" }
  | { kind: "weather"; weather: CampaignWeather };

export type CampaignClaimEffectKind = CampaignClaimEffect["kind"];

/** Delivered at once to the campaign harbour: goods (tools included) and soldiers only. */
export interface CampaignQuestMapReward {
  goods: CampaignWareAmount[];
  soldiers: CampaignSoldierAmount[];
}

export interface CampaignQuest {
  claimEffects: CampaignClaimEffect[];
  /** Cinematic played when the player claims or closes the success, before the claim effects. */
  completeSequenceId?: string;
  /** A trigger-only quest: no log entry and no story panel; it exists to fire its sequences. */
  hidden?: boolean;
  /** Editor-enabled in-game glint over the trigger region while the quest is active. */
  highlightRegion: boolean;
  /** Accrued during the run and paid on win, loss or give-up (outcome-bound final quests: on that outcome). */
  homeReward: CampaignRewards | null;
  id: string;
  /** A stored campaign image record id (WebP), or null. */
  imageId: string | null;
  mapReward: CampaignQuestMapReward | null;
  /** Quest ids that must be completed first (quest chains). */
  prerequisites: string[];
  repeat: CampaignQuestRepeatMode;
  /** Cinematic played when the quest activates, before its story panel opens. */
  startSequenceId?: string;
  text: TranslatableText;
  /** Game-time countdown from activation; expiry fails the quest. Null: no limit. */
  timeLimitSeconds: number | null;
  title: TranslatableText;
  trigger: CampaignQuestTrigger;
}
