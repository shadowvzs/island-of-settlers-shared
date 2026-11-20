import assert from "node:assert/strict";

import { createCampaignStatistics, recordCampaignAttempt } from "../src/campaign/campaign-records.ts";
import {
  CampaignRecordConflict, CampaignRecordInvalid, CampaignRecordNotFound, type CampaignRepositories
} from "../src/campaign/campaign-repository.ts";
import { readyCampaign, readyMap } from "./campaign-fixtures.ts";

/**
 * Behaviour every CampaignRepositories implementation must share (memory/IndexedDB store, Postgres). `prefix`
 * keeps ids unique when the backing database is shared between runs.
 */
export const runCampaignRepositoryContract = async (repositories: CampaignRepositories, prefix: string) => {
  const campaignId = `${prefix}-campaign`, otherCampaignId = `${prefix}-other`;
  const { campaigns, images, maps, statistics } = repositories;

  const created = await campaigns.create(readyCampaign({ id: campaignId, mapIds: [`${prefix}-map-b`], revision: 9 }));
  assert.equal(created.revision, 1);
  assert.ok(created.updatedAt > 0);
  assert.deepEqual(await campaigns.get(campaignId), created);
  await assert.rejects(campaigns.create(readyCampaign({ id: campaignId })), CampaignRecordConflict);
  assert.equal(await campaigns.get(`${prefix}-missing`), null);

  const renamed = await campaigns.update({ ...created, name: { en: "Renamed", hu: "Átnevezve" } });
  assert.equal(renamed.revision, 2);
  await assert.rejects(campaigns.update({ ...created, name: { en: "Stale" } }), CampaignRecordConflict);
  await assert.rejects(campaigns.update(readyCampaign({ id: `${prefix}-missing`, revision: 1 })),
    CampaignRecordNotFound);
  assert.equal((await campaigns.get(campaignId))?.name.en, "Renamed");

  await assert.rejects(maps.create(readyMap({ id: `${prefix}-bad`, maxEnemySoldiers: 0 })), CampaignRecordInvalid);
  assert.equal(await maps.get(`${prefix}-bad`), null);
  await maps.create(readyMap({ campaignId, id: `${prefix}-map-b` }));
  await maps.create(readyMap({ campaignId, id: `${prefix}-map-a`, state: "draft" }));
  await maps.create(readyMap({ campaignId: otherCampaignId, id: `${prefix}-map-c` }));
  const ids = async (query: Parameters<typeof maps.list>[0]) => (await maps.list(query)).map(map => map.id);
  assert.deepEqual(await ids({ campaignId }), [`${prefix}-map-a`, `${prefix}-map-b`]);
  assert.deepEqual(await ids({ campaignId, state: "ready" }), [`${prefix}-map-b`]);
  assert.deepEqual((await ids({ state: "draft" })).filter(id => id.startsWith(prefix)), [`${prefix}-map-a`]);
  assert.deepEqual((await maps.get(`${prefix}-map-b`))?.quests, readyMap().quests);
  const stale = (await maps.get(`${prefix}-map-a`))!;
  const edited = await maps.update({ ...stale, soldierCap: 12 });
  const heads = (await maps.heads()).filter(head => head.id.startsWith(prefix));
  assert.deepEqual(heads.map(head => [head.id, head.revision]),
    [[`${prefix}-map-a`, 2], [`${prefix}-map-b`, 1], [`${prefix}-map-c`, 1]]);
  assert.equal(heads[0]?.updatedAt, edited.updatedAt);
  assert.deepEqual(Object.keys(heads[0]!).sort(), ["id", "revision", "updatedAt"]);

  const bytes = new Uint8Array([82, 73, 70, 70, 0, 255, 7]);
  await images.create({ bytes, campaignId, height: 512, id: `${prefix}-image`, mimeType: "image/webp", revision: 0,
    updatedAt: 0, width: 1024 });
  const image = await images.get(`${prefix}-image`);
  assert.ok(image?.bytes instanceof Uint8Array);
  assert.deepEqual([...image.bytes], [...bytes]);
  assert.deepEqual((await images.list({ campaignId })).map(entry => entry.id), [`${prefix}-image`]);

  const empty = createCampaignStatistics(campaignId, `${prefix}-map-b`, null);
  const stored = await statistics.create(recordCampaignAttempt(empty,
    { completedQuestIds: ["q-intro"], durationSeconds: 900, failedQuestIds: [], outcome: "victory" }));
  assert.equal((await statistics.get(stored.id))?.bestCompletionSeconds, 900);

  await assert.rejects(maps.delete(`${prefix}-map-c`, 5), CampaignRecordConflict);
  await maps.delete(`${prefix}-map-c`, 1);
  assert.equal(await maps.get(`${prefix}-map-c`), null);
  await assert.rejects(maps.delete(`${prefix}-map-c`, 1), CampaignRecordNotFound);
};
