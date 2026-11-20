import type { CampaignMapStatus } from "../script/engine/home-rewards.ts";
import { CAMPAIGN_DEFAULT_EXIT } from "./campaign-constants.ts";

/**
 * Per-account campaign progress and attempts (C9a, trigger design §9.5): a map is `notAvailable` (locked),
 * `available` or `completed`; every attempt gets a server-issued id and keeps the map status of its start, so a
 * replay of a completed map pays one third of its home rewards, at most once per attempt. Pure and shared, so the
 * API, its in-memory test store and the client read the same rules.
 */

export const CAMPAIGN_ATTEMPT_ENDS = ["victory", "defeat", "giveUp"] as const;
export type CampaignAttemptEnd = (typeof CAMPAIGN_ATTEMPT_ENDS)[number];

/** The status an attempt starts with: a locked map cannot start. */
export type CampaignAttemptStatus = Exclude<CampaignMapStatus, "notAvailable">;

export interface CampaignAttemptStartBody {
  campaignId: string;
  mapId: string;
}

export interface CampaignAttemptEndBody {
  /** The exit the map was won through (BR1); only with `victory`. Absent = the implicit exit `victory`. */
  exit?: string;
  outcome: CampaignAttemptEnd;
}

const ID = /^[A-Za-z0-9_.:-]{1,64}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A start request, or null when it is malformed (unknown fields are refused). */
export const parseAttemptStartBody = (value: unknown): CampaignAttemptStartBody | null => {
  if (!isRecord(value) || Object.keys(value).some(key => key !== "campaignId" && key !== "mapId")) return null;
  const { campaignId, mapId } = value;
  if (typeof campaignId !== "string" || !ID.test(campaignId) || typeof mapId !== "string" || !ID.test(mapId))
    return null;
  return { campaignId, mapId };
};

/**
 * An end request, or null when it is malformed (unknown fields are refused; an exit is a safe id and only a victory
 * names one).
 */
export const parseAttemptEndBody = (value: unknown): CampaignAttemptEndBody | null => {
  if (!isRecord(value) || Object.keys(value).some(key => key !== "exit" && key !== "outcome")) return null;
  const { exit, outcome } = value;
  if (!CAMPAIGN_ATTEMPT_ENDS.includes(outcome as CampaignAttemptEnd)) return null;
  if (exit === undefined) return { outcome: outcome as CampaignAttemptEnd };
  if (outcome !== "victory" || typeof exit !== "string" || !ID.test(exit)) return null;
  return { exit, outcome };
};

/**
 * The exit the server stores for a won attempt (plan §6.2, rev F2): the reported one when the map's current record
 * declares it (`exitsOf(map)`), else the implicit `victory`. An unknown, deleted or forged exit is never refused,
 * because a refused victory report would lose a won run.
 */
export const storedExitOf = (declared: readonly string[], reported: string | undefined) =>
  reported !== undefined && declared.includes(reported) ? reported : CAMPAIGN_DEFAULT_EXIT;

/** The stored row of one attempt (server). */
export interface CampaignAttemptRow {
  campaignId: string;
  end: CampaignAttemptEnd | null;
  /** The exit a won attempt ended through (BR1); null or absent on other ends and on rows before 0040. */
  endExit?: string | null;
  id: string;
  mapId: string;
  startedAt: number;
  startStatus: CampaignAttemptStatus;
}

/** What the claim route learns of the account's campaign map (§9.5, C9b). */
export interface CampaignClaimProgress {
  attemptId: string | null;
  /**
   * A replay attempt that has not been won (yet): its one-third claims wait (C9b decision: the third is paid once
   * per replay attempt id that ends in victory, so restarting and giving up never farms it).
   */
  awaitingVictory?: true;
  status: CampaignMapStatus;
}

/**
 * What the claim route reads (§9.5): the status of the account's latest attempt on the map, with its id only on a
 * replay (`completed`), so a first completion's claims keep their plain ledger refs. Without an attempt the map's
 * own status counts; the claim route refuses a `completed` map without an attempt id, and a replay whose attempt
 * has not ended in victory.
 */
export const claimProgressOf = (
  latest: Pick<CampaignAttemptRow, "end" | "id" | "startStatus"> | null, mapStatus: CampaignMapStatus
): CampaignClaimProgress => {
  if (!latest) return { attemptId: null, status: mapStatus };
  if (latest.startStatus !== "completed") return { attemptId: null, status: "available" };
  const replay = { attemptId: latest.id, status: "completed" as const };
  return latest.end === "victory" ? replay : { ...replay, awaitingVictory: true };
};

/** The exit an ended attempt counts for: its stored one, `victory` for a win stored before 0040; null otherwise. */
export const attemptExitOf = (row: Pick<CampaignAttemptRow, "end" | "endExit">) => {
  if (row.end !== "victory") return null;
  return row.endExit ?? CAMPAIGN_DEFAULT_EXIT;
};

/**
 * Why an end request is refused on this attempt; null when it may be stored. A same repeat (same outcome and, for a
 * victory, the same stored exit) is accepted; `exit` is the exit the server would store (`storedExitOf`).
 */
export const attemptEndRefusal = (
  row: Pick<CampaignAttemptRow, "end" | "endExit"> | null, outcome: CampaignAttemptEnd,
  exit: string = CAMPAIGN_DEFAULT_EXIT
) => {
  if (!row) return "Unknown campaign attempt";
  if (row.end === null) return null;
  if (row.end !== outcome) return "This campaign attempt has already ended";
  if (outcome === "victory" && attemptExitOf(row) !== exit) return "This campaign attempt has already ended";
  return null;
};
