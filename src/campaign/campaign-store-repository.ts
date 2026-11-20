import type { CampaignPublicationState, CampaignStoredRecord } from "./campaign-model.ts";
import {
  assertCampaignRecord, byCampaignRecordId, CAMPAIGN_RECORD_KINDS, CampaignRecordConflict, type CampaignRecordKind,
  CampaignRecordNotFound, type CampaignRecordQuery, type CampaignRecordRepository, type CampaignRepositories,
  matchesCampaignQuery
} from "./campaign-repository.ts";

/** A stored record plus the fields a store indexes (IndexedDB indexes cannot hold null keys: absent instead). */
export interface CampaignRecordEnvelope {
  campaignId?: string;
  id: string;
  record: CampaignStoredRecord;
  revision: number;
  state?: CampaignPublicationState;
}

/**
 * The minimal key-value contract behind the local repository. `write` and `remove` are compare-and-set: they
 * apply only when the stored revision equals `expectedRevision` (null: the id must not exist) and answer whether
 * they did, atomically (one IndexedDB readwrite transaction).
 */
export interface CampaignRecordStore {
  list(storeName: string, query: CampaignRecordQuery): Promise<CampaignRecordEnvelope[]>;
  read(storeName: string, id: string): Promise<CampaignRecordEnvelope | null>;
  remove(storeName: string, id: string, expectedRevision: number): Promise<boolean>;
  write(storeName: string, envelope: CampaignRecordEnvelope, expectedRevision: number | null): Promise<boolean>;
}

const envelopeOf = <T extends CampaignStoredRecord>(kind: CampaignRecordKind<T>, record: T): CampaignRecordEnvelope => {
  const campaignId = kind.campaignIdOf(record), state = kind.stateOf(record);
  return {
    id: record.id, record, revision: record.revision,
    ...(campaignId === null ? {} : { campaignId }),
    ...(state === null ? {} : { state })
  };
};

/** The repository over any CampaignRecordStore; `now` stamps `updatedAt` (UTC ms). */
export const createStoreCampaignRepository = <T extends CampaignStoredRecord>(
  store: CampaignRecordStore, kind: CampaignRecordKind<T>, now: () => number = Date.now
): CampaignRecordRepository<T> => {
  const save = async (record: T, expectedRevision: number | null) => {
    const stored = { ...record, revision: (expectedRevision ?? 0) + 1, updatedAt: now() };
    assertCampaignRecord(kind, stored);
    if (await store.write(kind.name, envelopeOf(kind, stored), expectedRevision)) return stored;
    if (expectedRevision !== null && !await store.read(kind.name, record.id))
      throw new CampaignRecordNotFound(kind.name, record.id);
    throw new CampaignRecordConflict(kind.name, record.id);
  };
  return {
    create: record => save(record, null),
    delete: async (id, expectedRevision) => {
      if (await store.remove(kind.name, id, expectedRevision)) return;
      if (!await store.read(kind.name, id)) throw new CampaignRecordNotFound(kind.name, id);
      throw new CampaignRecordConflict(kind.name, id);
    },
    get: async id => {
      const envelope = await store.read(kind.name, id);
      return envelope ? envelope.record as T : null;
    },
    heads: async () => (await store.list(kind.name, {}))
      .map(({ id, record, revision }) => ({ id, revision, updatedAt: record.updatedAt })).sort(byCampaignRecordId),
    list: async (query = {}) => (await store.list(kind.name, query)).map(envelope => envelope.record as T)
      .filter(record => matchesCampaignQuery(kind, record, query)).sort(byCampaignRecordId),
    update: record => save(record, record.revision)
  };
};

export const createStoreCampaignRepositories = (
  store: CampaignRecordStore, now: () => number = Date.now
): CampaignRepositories => ({
  campaigns: createStoreCampaignRepository(store, CAMPAIGN_RECORD_KINDS.campaigns, now),
  images: createStoreCampaignRepository(store, CAMPAIGN_RECORD_KINDS.images, now),
  maps: createStoreCampaignRepository(store, CAMPAIGN_RECORD_KINDS.maps, now),
  statistics: createStoreCampaignRepository(store, CAMPAIGN_RECORD_KINDS.statistics, now)
});

/**
 * In-memory store: tests, and the fallback where the browser gives no IndexedDB (private mode). Records are
 * cloned on the way in and out, like a real store.
 */
export const createMemoryCampaignRecordStore = (): CampaignRecordStore => {
  const stores = new Map<string, Map<string, CampaignRecordEnvelope>>();
  const storeOf = (name: string) => stores.get(name) ?? stores.set(name, new Map()).get(name)!;
  return {
    list: async (name, query) => [...storeOf(name).values()]
      .filter(envelope => query.campaignId === undefined || envelope.campaignId === query.campaignId)
      .map(envelope => structuredClone(envelope)),
    read: async (name, id) => structuredClone(storeOf(name).get(id) ?? null),
    remove: async (name, id, expectedRevision) => {
      if (storeOf(name).get(id)?.revision !== expectedRevision) return false;
      return storeOf(name).delete(id);
    },
    write: async (name, envelope, expectedRevision) => {
      if ((storeOf(name).get(envelope.id)?.revision ?? null) !== expectedRevision) return false;
      storeOf(name).set(envelope.id, structuredClone(envelope));
      return true;
    }
  };
};
