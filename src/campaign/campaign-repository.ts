import type { CampaignIssue } from "./campaign-issues.ts";
import type { Campaign, CampaignMap, CampaignPublicationState, CampaignStoredRecord } from "./campaign-model.ts";
import type { CampaignImage, CampaignStatistics } from "./campaign-records.ts";
import {
  checkCampaignImageShape, checkCampaignMapShape, checkCampaignShape, checkCampaignStatisticsShape
} from "./campaign-shape.ts";

/**
 * One generic async repository for every campaign document kind (owner 2026-11-09: one interface, an IndexedDB
 * implementation for local play and a Postgres one on the server). Writes use optimistic concurrency: `create`
 * stores revision 1, `update` must carry the revision it read and stores the next one. Draft documents are stored
 * as they are; Ready validation (validateCampaignMapReady) is the caller's step before saving as Ready.
 */
export interface CampaignRecordQuery {
  campaignId?: string;
  state?: CampaignPublicationState;
}

/** A record's identity and version without its document (cheap to list: no image bytes). */
export type CampaignRecordHead = Pick<CampaignStoredRecord, "id" | "revision" | "updatedAt">;

export interface CampaignRecordRepository<T extends CampaignStoredRecord> {
  /** Stores a new record (its `revision` is ignored) and answers it with revision 1. */
  create(record: T): Promise<T>;
  /** Removes the record when its stored revision is `expectedRevision`. */
  delete(id: string, expectedRevision: number): Promise<void>;
  get(id: string): Promise<T | null>;
  /** The id, revision and save time of every record, ordered by id (what a sync compares). */
  heads(): Promise<CampaignRecordHead[]>;
  /** Records matching every given filter, ordered by id. */
  list(query?: CampaignRecordQuery): Promise<T[]>;
  /** Replaces the record whose stored revision is `record.revision`; answers it with the next revision. */
  update(record: T): Promise<T>;
}

export interface CampaignRepositories {
  campaigns: CampaignRecordRepository<Campaign>;
  images: CampaignRecordRepository<CampaignImage>;
  maps: CampaignRecordRepository<CampaignMap>;
  statistics: CampaignRecordRepository<CampaignStatistics>;
}

/** The stored revision differs (or the id already exists on create): reload, merge and retry. */
export class CampaignRecordConflict extends Error {
  constructor(kind: string, id: string) {
    super(`The ${kind} record ${id} changed meanwhile`);
    this.name = "CampaignRecordConflict";
  }
}

export class CampaignRecordNotFound extends Error {
  constructor(kind: string, id: string) {
    super(`The ${kind} record ${id} does not exist`);
    this.name = "CampaignRecordNotFound";
  }
}

/** The record fails its structural check; `issues` lists every invalid field. */
export class CampaignRecordInvalid extends Error {
  readonly issues: readonly CampaignIssue[];

  constructor(kind: string, issues: readonly CampaignIssue[]) {
    super(`Invalid ${kind} record: ${issues.map(issue => issue.path).join(", ")}`);
    this.name = "CampaignRecordInvalid";
    this.issues = issues;
  }
}

/** What an implementation needs to know about a kind: its store name, indexed fields and shape check. */
export interface CampaignRecordKind<T extends CampaignStoredRecord> {
  campaignIdOf(record: T): string | null;
  check(value: unknown): CampaignIssue[];
  readonly name: CampaignRecordKindName;
  stateOf(record: T): CampaignPublicationState | null;
}

export type CampaignRecordKindName = "campaigns" | "campaign-maps" | "campaign-images" | "campaign-statistics";

export const CAMPAIGN_RECORD_KINDS = Object.freeze({
  campaigns: {
    campaignIdOf: record => record.id, check: checkCampaignShape, name: "campaigns", stateOf: record => record.state
  } satisfies CampaignRecordKind<Campaign>,
  images: {
    campaignIdOf: record => record.campaignId, check: checkCampaignImageShape, name: "campaign-images",
    stateOf: () => null
  } satisfies CampaignRecordKind<CampaignImage>,
  maps: {
    campaignIdOf: record => record.campaignId, check: checkCampaignMapShape, name: "campaign-maps",
    stateOf: record => record.state
  } satisfies CampaignRecordKind<CampaignMap>,
  statistics: {
    campaignIdOf: record => record.campaignId, check: checkCampaignStatisticsShape, name: "campaign-statistics",
    stateOf: () => null
  } satisfies CampaignRecordKind<CampaignStatistics>
});

/** Throws CampaignRecordInvalid when `record` fails its kind's structural check. */
export const assertCampaignRecord = <T extends CampaignStoredRecord>(kind: CampaignRecordKind<T>, record: T) => {
  const issues = kind.check(record);
  if (issues.length) throw new CampaignRecordInvalid(kind.name, issues);
};

/** True when `record` passes every filter of `query`. */
export const matchesCampaignQuery = <T extends CampaignStoredRecord>(
  kind: CampaignRecordKind<T>, record: T, query: CampaignRecordQuery
) => (query.campaignId === undefined || kind.campaignIdOf(record) === query.campaignId) &&
  (query.state === undefined || kind.stateOf(record) === query.state);

export const byCampaignRecordId = (
  first: Pick<CampaignStoredRecord, "id">, second: Pick<CampaignStoredRecord, "id">
) => first.id < second.id ? -1 : Number(first.id > second.id);
