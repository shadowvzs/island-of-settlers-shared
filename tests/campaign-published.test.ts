import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  campaignBundleImagePath, campaignBundleMapPath, checkCampaignBundleShape, isCampaignOffered, playableCampaignsOf,
  publishedCampaignsOf
} from "../src/campaign/campaign-published.ts";
import { readyCampaign, readyMap } from "./campaign-fixtures.ts";

const HASH = "a".repeat(64), OTHER_HASH = "b".repeat(64);

test("a campaign is offered inside its availability window, open sides never end", () => {
  assert.equal(isCampaignOffered({ availability: { from: null, until: null } }, 5), true);
  assert.equal(isCampaignOffered({ availability: { from: 6, until: null } }, 5), false);
  assert.equal(isCampaignOffered({ availability: { from: 5, until: 5 } }, 5), true);
  assert.equal(isCampaignOffered({ availability: { from: null, until: 4 } }, 5), false);
});

test("published campaigns list ready maps with a matching stored file in play order", () => {
  const campaign = readyCampaign({ mapIds: ["map-2", "map-1", "map-3", "map-4", "map-5", "gone"] });
  const maps = [
    readyMap({ id: "map-1", mapFile: { hash: HASH, id: "slot-1" } }),
    readyMap({ id: "map-2", mapFile: { hash: null, id: "slot-2" } }),
    readyMap({ id: "map-3", state: "draft" }),
    readyMap({ id: "map-4", mapFile: { hash: OTHER_HASH, id: "slot-4" } }),
    readyMap({ campaignId: "foreign", id: "map-5" })
  ];
  const files = new Map([["map-1", HASH], ["map-2", HASH], ["map-3", HASH], ["map-4", HASH], ["map-5", HASH]]);

  const [published, ...rest] = publishedCampaignsOf([campaign], maps, files, 0);
  assert.equal(rest.length, 0);
  assert.deepEqual(published?.maps.map(entry => [entry.map.id, entry.fileHash]), [["map-2", HASH], ["map-1", HASH]]);

  assert.deepEqual(publishedCampaignsOf([campaign], maps, new Map(), 0), []);
  assert.deepEqual(publishedCampaignsOf([{ ...campaign, state: "draft" }], maps, files, 0), []);
  assert.deepEqual(
    publishedCampaignsOf([{ ...campaign, availability: { from: 10, until: null } }], maps, files, 0), []);
});

const bundleOf = (overrides: Record<string, unknown> = {}) => ({
  campaigns: playableCampaignsOf([readyCampaign()], [readyMap()], new Map([["map-1", HASH]])),
  images: [
    { campaignId: "campaign-1", hash: OTHER_HASH, height: 512, id: "image-1", licence: "Own artwork", width: 1024 }
  ],
  version: 1,
  ...overrides
});

test("the bundle keeps ready campaigns outside their availability window", () => {
  const later = readyCampaign({ availability: { from: 10, until: null } });
  const files = new Map([["map-1", HASH]]);
  assert.deepEqual(publishedCampaignsOf([later], [readyMap()], files, 0), []);
  assert.deepEqual(playableCampaignsOf([later], [readyMap()], files).map(entry => entry.campaign.id), ["campaign-1"]);
  assert.deepEqual(playableCampaignsOf([{ ...later, state: "draft" }], [readyMap()], files), []);
});

test("a campaign bundle index is accepted only in the published shape", () => {
  assert.deepEqual(checkCampaignBundleShape(bundleOf()), []);
  assert.deepEqual(checkCampaignBundleShape(JSON.parse(JSON.stringify(bundleOf()))), []);
  assert.deepEqual(checkCampaignBundleShape({ campaigns: [], images: [], version: 1 }), []);

  const paths = (value: unknown) => checkCampaignBundleShape(value).map(issue => issue.path);
  assert.deepEqual(paths(bundleOf({ version: 2 })), ["bundle.version"]);
  assert.deepEqual(paths("<!doctype html>"), ["bundle"]);
  const [entry] = bundleOf().campaigns;
  assert.deepEqual(paths(bundleOf({ campaigns: [{ ...entry, maps: [{ fileHash: "../secret", map: readyMap() }] }] })),
    ["bundle.campaigns[0].maps[0].fileHash"]);
  assert.deepEqual(paths(bundleOf({ campaigns: [{ ...entry, campaign: { ...readyCampaign(), state: "live" } }] })),
    ["bundle.campaigns[0].campaign.state"]);
  assert.deepEqual(paths(bundleOf({ images: [{ ...bundleOf().images[0], licence: " " }] })),
    ["bundle.images[0].licence"]);
});

test("bundle files are named by their content hash", () => {
  assert.equal(campaignBundleMapPath(HASH), `maps/${HASH}.map`);
  assert.equal(campaignBundleImagePath(HASH), `images/${HASH}.webp`);
});
