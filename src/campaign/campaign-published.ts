import {
  CAMPAIGN_BUNDLE_LICENCE_LENGTH, CAMPAIGN_BUNDLE_MAX_CAMPAIGNS, CAMPAIGN_BUNDLE_MAX_IMAGES, CAMPAIGN_BUNDLE_VERSION,
  CAMPAIGN_IMAGE_MAX_EDGE, CAMPAIGN_LIMITS
} from "./campaign-constants.ts";
import type { CampaignIssue } from "./campaign-issues.ts";
import type { Campaign, CampaignMap } from "./campaign-model.ts";
import { campaignMapShape, campaignShape } from "./campaign-shape.ts";
import { arrayOf, checkShape, guard, identifier, integerIn, literal, objectOf } from "./campaign-shape-checks.ts";

/**
 * Published campaigns as players read them from the server (`GET /v1/campaigns`): ready campaigns inside their
 * availability window with their ready maps in play order. A map is listed once its map file is stored;
 * `fileHash` (SHA-256 hex) is what the downloaded file must hash to.
 */
export interface PublishedCampaignMap {
  fileHash: string;
  map: CampaignMap;
}

export interface PublishedCampaign {
  campaign: Campaign;
  maps: PublishedCampaignMap[];
}

export interface PublishedCampaignsAnswer {
  campaigns: PublishedCampaign[];
}

/**
 * A story image shipped in the campaign bundle: the file is named by `hash` (SHA-256 hex of its WebP bytes) and
 * `licence` is the reviewed licence line the export required for it.
 */
export interface BundledCampaignImage {
  campaignId: string;
  hash: string;
  height: number;
  id: string;
  licence: string;
  width: number;
}

/**
 * The index of the campaign bundle every build ships (CAMP-BUNDLE): the published campaigns as the server
 * answers them, plus their images. Map and image files sit beside it, named by their content hash.
 */
export interface CampaignBundleIndex extends PublishedCampaignsAnswer {
  images: BundledCampaignImage[];
  version: typeof CAMPAIGN_BUNDLE_VERSION;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;
const contentHash = guard(value => typeof value === "string" && SHA256_HEX.test(value));
const imageEdge = integerIn(1, CAMPAIGN_IMAGE_MAX_EDGE);
const licenceLine = guard(value =>
  typeof value === "string" && value.trim().length > 0 && value.length <= CAMPAIGN_BUNDLE_LICENCE_LENGTH);

const publishedCampaignShape = objectOf({
  campaign: campaignShape,
  maps: arrayOf(objectOf({ fileHash: contentHash, map: campaignMapShape }), CAMPAIGN_LIMITS.maps)
});
const publishedCampaignsShape = arrayOf(publishedCampaignShape, CAMPAIGN_BUNDLE_MAX_CAMPAIGNS);

const campaignBundleShape = objectOf({
  campaigns: publishedCampaignsShape,
  images: arrayOf(objectOf({
    campaignId: identifier, hash: contentHash, height: imageEdge, id: identifier, licence: licenceLine, width: imageEdge
  }), CAMPAIGN_BUNDLE_MAX_IMAGES),
  version: literal(CAMPAIGN_BUNDLE_VERSION)
});

/** Structural errors of a campaign bundle index (untrusted JSON); an empty list means the shape is valid. */
export const checkCampaignBundleShape = (value: unknown): CampaignIssue[] =>
  checkShape(campaignBundleShape, value, "bundle");

/** The bundle's file of a map or image, relative to the bundle folder, by content hash. */
export const campaignBundleMapPath = (fileHash: string) => `maps/${fileHash}.map`;
export const campaignBundleImagePath = (hash: string) => `images/${hash}.webp`;

/** True while `now` (UTC ms) is inside the campaign's availability window (an open side never ends). */
export const isCampaignOffered = ({ availability: { from, until } }: Pick<Campaign, "availability">, now: number) =>
  (from === null || now >= from) && (until === null || now <= until);

/** A stored file a ready record can be played with: the record pins no hash, or exactly this one. */
const playableFileHash = (map: CampaignMap, fileHashes: ReadonlyMap<string, string>) => {
  const stored = fileHashes.get(map.id);
  if (map.state !== "ready" || stored === undefined) return null;
  return map.mapFile.hash === null || map.mapFile.hash === stored ? stored : null;
};

/**
 * The playable view of stored records: `fileHashes` maps a map id to its stored file's hash. Draft campaigns,
 * draft maps, foreign maps and maps without a matching file are left out; a campaign without a playable map is
 * not offered. The availability window is not applied: the bundle ships every ready campaign and the player's
 * clock decides at play time (the campaign window filters by `isCampaignOffered`).
 */
export const playableCampaignsOf = (
  campaigns: readonly Campaign[], maps: readonly CampaignMap[], fileHashes: ReadonlyMap<string, string>
): PublishedCampaign[] => {
  const mapsById = new Map(maps.map(map => [map.id, map]));
  return campaigns.flatMap((campaign): PublishedCampaign[] => {
    if (campaign.state !== "ready") return [];
    const listed = campaign.mapIds.flatMap((mapId): PublishedCampaignMap[] => {
      const map = mapsById.get(mapId);
      const fileHash = map?.campaignId === campaign.id ? playableFileHash(map, fileHashes) : null;
      return map && fileHash ? [{ fileHash, map }] : [];
    });
    return listed.length ? [{ campaign, maps: listed }] : [];
  });
};

/** The server's published view: the playable campaigns inside their availability window at `now`. */
export const publishedCampaignsOf = (
  campaigns: readonly Campaign[], maps: readonly CampaignMap[], fileHashes: ReadonlyMap<string, string>, now: number
): PublishedCampaign[] =>
  playableCampaignsOf(campaigns.filter(campaign => isCampaignOffered(campaign, now)), maps, fileHashes);
