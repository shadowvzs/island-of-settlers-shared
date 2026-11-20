import type { CAMPAIGN_IMAGE_MIME_TYPE } from "./campaign-constants.ts";
import type { CampaignMap, CampaignStoredRecord } from "./campaign-model.ts";

/** A story image uploaded through the campaign repository; quests reference it by `id` (blob ref). */
export interface CampaignImage extends CampaignStoredRecord {
  bytes: Uint8Array;
  campaignId: string;
  height: number;
  mimeType: typeof CAMPAIGN_IMAGE_MIME_TYPE;
  width: number;
}

/** A stored campaign map file without its bytes (server storage, one per campaign map record). */
export interface CampaignMapFileMeta {
  campaignId: string;
  /** SHA-256 hex of the bytes. */
  hash: string;
  mapId: string;
  size: number;
  updatedAt: number;
}

export type CampaignAttemptOutcome = "victory" | "defeat" | "givenUp";

/** Aggregated statistics of one map (per account, or global when `accountId` is null). */
export interface CampaignStatistics extends CampaignStoredRecord {
  accountId: string | null;
  attempts: number;
  bestCompletionSeconds: number | null;
  campaignId: string;
  defeats: number;
  givenUp: number;
  mapId: string;
  /** Quest id → successful completions / failures (time-limit expiry). */
  questCompletions: Record<string, number>;
  questFailures: Record<string, number>;
  /** Sum over victories; the average completion time is this divided by `victories`. */
  totalCompletionSeconds: number;
  victories: number;
}

/** One finished attempt as the statistics record it. */
export interface CampaignAttemptSummary {
  completedQuestIds: readonly string[];
  durationSeconds: number;
  failedQuestIds: readonly string[];
  outcome: CampaignAttemptOutcome;
}

/** The statistics record id of one map (and account). */
export const campaignStatisticsId = (mapId: string, accountId: string | null) => `${accountId ?? "global"}:${mapId}`;

export const createCampaignStatistics = (
  campaignId: string, mapId: string, accountId: string | null
): CampaignStatistics => ({
  accountId,
  attempts: 0,
  bestCompletionSeconds: null,
  campaignId,
  defeats: 0,
  givenUp: 0,
  id: campaignStatisticsId(mapId, accountId),
  mapId,
  questCompletions: {},
  questFailures: {},
  revision: 0,
  totalCompletionSeconds: 0,
  updatedAt: 0,
  victories: 0
});

const countQuests = (counts: Readonly<Record<string, number>>, questIds: readonly string[]) => {
  const next = { ...counts };
  for (const questId of questIds) next[questId] = (next[questId] ?? 0) + 1;
  return next;
};

const bestTime = (best: number | null, duration: number) => best === null ? duration : Math.min(best, duration);

/** The statistics after one more attempt; pure, the caller stores the result through the repository. */
export const recordCampaignAttempt = (
  statistics: CampaignStatistics, attempt: CampaignAttemptSummary
): CampaignStatistics => {
  const won = attempt.outcome === "victory";
  return {
    ...statistics,
    attempts: statistics.attempts + 1,
    bestCompletionSeconds: won ? bestTime(statistics.bestCompletionSeconds, attempt.durationSeconds)
      : statistics.bestCompletionSeconds,
    defeats: statistics.defeats + (attempt.outcome === "defeat" ? 1 : 0),
    givenUp: statistics.givenUp + (attempt.outcome === "givenUp" ? 1 : 0),
    questCompletions: countQuests(statistics.questCompletions, attempt.completedQuestIds),
    questFailures: countQuests(statistics.questFailures, attempt.failedQuestIds),
    totalCompletionSeconds: statistics.totalCompletionSeconds + (won ? attempt.durationSeconds : 0),
    victories: statistics.victories + (won ? 1 : 0)
  };
};

/**
 * Clone-at-start rule (owner edge case 1): a run plays its own deep copy of the map taken when the attempt starts.
 * Admin edits to the published map never reach a running attempt; a restart clones the current Ready version again.
 */
export interface CampaignMapSnapshot {
  campaignId: string;
  clonedAt: number;
  map: Readonly<CampaignMap>;
  mapId: string;
  mapRevision: number;
}

const deepFreeze = <T>(value: T): T => {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
};

/**
 * The run's frozen clone of `map`. Only Ready maps start a player run; `allowDraft` is for the admin
 * "Play from here" test.
 */
export const snapshotCampaignMap = (
  map: CampaignMap, clonedAt: number, options: { allowDraft?: boolean } = {}
): CampaignMapSnapshot => {
  if (map.state !== "ready" && !options.allowDraft) throw new Error(`Campaign map ${map.id} is not Ready`);
  return deepFreeze({
    campaignId: map.campaignId,
    clonedAt,
    map: structuredClone(map),
    mapId: map.id,
    mapRevision: map.revision
  });
};
