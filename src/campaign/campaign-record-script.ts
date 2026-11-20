import { buildingEntry, soldierEntry, wareEntry } from "../catalog/index.ts";
import type { QuestObjective, QuestRepeat, QuestRewards, ScriptQuest } from "../script/types/quests.ts";
import type { ScriptRef, ScriptRefKind } from "../script/types/refs.ts";
import type { MapScript } from "../script/types/script.ts";
import type { ScriptAction } from "../script/types/triggers.ts";
import type { CampaignMap, CampaignRewards, CampaignSoldierType } from "./campaign-model.ts";
import type {
  CampaignClaimEffect, CampaignQuest, CampaignQuestMapReward, CampaignQuestRepeatMode, CampaignQuestTrigger
} from "./campaign-quest.ts";

/**
 * Campaign storage move (TRG1, QU Q1 = owner answer 34): a C1 campaign map record's quests, region library,
 * cinematic sequences and camera shots as the map file's `MapScript`. Quest triggers become objectives, claim
 * effects become `onSuccess` actions, building/troop/ware keys become catalog content refs. Pure and
 * deterministic: the same record always yields the same script (and hash). Records carry no actors yet (ACT0 types
 * only live in scripts), so `actors` starts empty.
 */

const ref = <K extends ScriptRefKind>(kind: K, id: string): ScriptRef<K> => ({ id, k: "ref", kind });
const lit = (value: number | string | boolean) =>
  ({ k: "lit" as const, type: typeof value as "number" | "string" | "boolean", value });

/** Catalog ids; an unknown key keeps a readable id that the Ready check reports as unknown content. */
const buildingContent = (code: number) => ref("content", buildingEntry(code)?.id ?? `building:code-${code}`);
const soldierContent = (type: CampaignSoldierType) => ref("content", soldierEntry(type)?.id ?? `soldier:${type}`);
const wareContent = (key: string) => ref("content", wareEntry(key)?.id ?? `ware:${key}`);

type ObjectiveOf<K extends CampaignQuestTrigger["kind"]> = (trigger: Extract<CampaignQuestTrigger, { kind: K }>) =>
  QuestObjective;

const OBJECTIVES: { [K in CampaignQuestTrigger["kind"]]: ObjectiveOf<K> } = {
  areaReached: ({ regionId, unitFilter }) => ({ kind: "areaReached", region: ref("region", regionId), unitFilter }),
  buildingCompleted: ({ buildingType, count }) =>
    ({ building: buildingContent(buildingType), count, kind: "buildingCompleted" }),
  clockTime: ({ hour }) => ({ hour, kind: "clockTime" }),
  defeat: () => ({ kind: "defeat" }),
  elapsedTime: ({ seconds }) => ({ kind: "elapsedTime", seconds }),
  enemiesDefeated: ({ count }) => ({ count, kind: "enemiesDefeated" }),
  enemyBuildingDestroyed: ({ buildingId }) => ({ buildingId, kind: "enemyBuildingDestroyed" }),
  mapStart: () => ({ kind: "mapStart" }),
  prerequisitesDone: () => ({ kind: "prerequisitesDone" }),
  soldierCount: ({ count, soldierType }) => ({ count, kind: "soldierCount",
    soldierType: soldierType === "total" ? null : soldierContent(soldierType) }),
  stockLevel: ({ amount, ware }) => ({ amount, kind: "stockLevel", ware: wareContent(ware) }),
  victory: () => ({ kind: "victory" })
};

const objectiveOf = (trigger: CampaignQuestTrigger) =>
  (OBJECTIVES[trigger.kind] as ObjectiveOf<typeof trigger.kind>)(trigger as never);

type EffectArgs<K extends CampaignClaimEffect["kind"]> = (effect: Extract<CampaignClaimEffect, { kind: K }>) =>
  { args: Record<string, unknown>; op: string };

const EFFECTS: { [K in CampaignClaimEffect["kind"]]: EffectArgs<K> } = {
  buildingAvailability: ({ available, buildingType }) =>
    ({ args: { available: lit(available), building: buildingContent(buildingType) }, op: "buildingAvailability" }),
  enemyWave: ({ arrival, soldiers, targetRegionId }) => ({
    args: {
      arrival: lit(arrival.mode),
      from: ref("region", arrival.mode === "ship" ? arrival.landingRegionId : arrival.spawnRegionId),
      soldiers: soldiers.map(({ amount, type }) => ({ amount, type: soldierContent(type) })),
      target: ref("region", targetRegionId)
    },
    op: "enemyWave"
  }),
  revealFog: ({ regionId }) => ({ args: { region: ref("region", regionId) }, op: "revealFog" }),
  timeOfDay: ({ hour }) => ({ args: { hour: lit(hour) }, op: "timeOfDay" }),
  weather: ({ weather }) => ({ args: { state: lit(weather) }, op: "setWeather" })
};

const effectAction = (effect: CampaignClaimEffect, index: number): ScriptAction => {
  const { args, op } = (EFFECTS[effect.kind] as EffectArgs<typeof effect.kind>)(effect as never);
  return { args, id: `s${index + 1}`, k: "do", op } as ScriptAction;
};

const REPEATS: Readonly<Record<CampaignQuestRepeatMode, QuestRepeat>> = {
  afterFail: { kind: "once", retryAfterFail: true },
  always: { kind: "onCompletion", maxClaims: null, retryAfterFail: true },
  once: { kind: "once", retryAfterFail: false }
};

const homeRewardOf = (reward: CampaignRewards | null): QuestRewards | null => reward &&
  { buildingUnlocks: [], coins: reward.coins, decorations: reward.decorations.map(line => ({ ...line })),
    gems: reward.gems, goods: reward.goods.map(line => ({ ...line })), xp: reward.xp };

const mapRewardOf = (reward: CampaignQuestMapReward | null): QuestRewards | null => reward &&
  { buildingUnlocks: [], coins: 0, decorations: [], gems: 0, goods: reward.goods.map(line => ({ ...line })),
    soldiers: reward.soldiers.map(line => ({ ...line })), xp: 0 };

/** Optional sequence hooks, only when the record has them (absent fields keep the script small). */
const sequenceHooks = (quest: CampaignQuest) => ({
  ...(quest.completeSequenceId ? { completeSequence: ref("sequence", quest.completeSequenceId) } : {}),
  ...(quest.startSequenceId ? { startSequence: ref("sequence", quest.startSequenceId) } : {})
});

export const campaignQuestToScript = (quest: CampaignQuest): ScriptQuest => ({
  ...sequenceHooks(quest),
  cost: [],
  deadline: quest.timeLimitSeconds === null ? null : { kind: "playTime", seconds: quest.timeLimitSeconds },
  failure: null,
  highlightRegion: quest.highlightRegion,
  homeReward: homeRewardOf(quest.homeReward),
  id: quest.id,
  imageId: quest.imageId,
  mapReward: mapRewardOf(quest.mapReward),
  objective: objectiveOf(quest.trigger),
  onActivate: [],
  onFailure: [],
  onSuccess: quest.claimEffects.map(effectAction),
  prerequisites: quest.prerequisites.map(id => ref("quest", id)),
  repeat: { ...REPEATS[quest.repeat] },
  text: { ...quest.text },
  title: { ...quest.title },
  visibility: quest.hidden ? "hidden" : "visible"
});

/** Whether the record still carries script content that belongs in the map file. */
export const hasRecordScript = (map: CampaignMap) => map.quests.length > 0 || map.regions.length > 0 ||
  (map.sequences?.length ?? 0) > 0 || (map.cameraShots?.length ?? 0) > 0;

/** The record's script content as a map script (revision 1, deterministic uid per campaign map). */
export const campaignRecordScript = (map: CampaignMap): MapScript => structuredClone({
  actors: [],
  cameraShots: map.cameraShots ?? [],
  folders: [],
  homeRewards: [],
  nextIds: { actor: 0, folder: 0, region: map.nextRegionNumber, reward: 0, trigger: 0, variable: 0 },
  quests: { daily: "off", dailyResetUtcMinutes: 0, groups: [], id: `campaign-${map.id}`,
    quests: map.quests.map(campaignQuestToScript), revision: 1, version: 1 },
  regions: map.regions,
  revision: 1,
  scriptUid: `campaign-${map.id}`,
  sequences: map.sequences ?? [],
  triggers: [],
  variables: [],
  version: 1
});
