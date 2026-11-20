/** Island row keys shared by saves, snapshots, command logs and road-decoration custody (survey §5). */
export type IslandKey = "home" | `colony-${number}` | `adventure-${number}`;
/** An island that can file archived relief: the home island or a colony (never an adventure). */
export type ArchivedIslandKey = Exclude<IslandKey, `adventure-${number}`>;
/** A campaign run's row key (C2): `campaign-<map record id>-<attempt>`; never an island of the archipelago. */
export type CampaignRunRowKey = `campaign-${string}-${number}`;
/** A row of a complete snapshot: an island or the campaign run on screen (campaign server part 2). */
export type SnapshotRowKey = IslandKey | CampaignRunRowKey;

/** Every island key; the index is bounded to 15 digits. */
export const ISLAND_KEY_PATTERN = /^(home|colony-[0-9]{1,15}|adventure-[0-9]{1,15})$/;
/** Home or colony keys only (archived relief proofs and journals). */
export const ARCHIVED_ISLAND_KEY_PATTERN = /^(home|colony-[0-9]{1,15})$/;
/** A campaign run key: the map record id pattern of `game.campaign_records`, then the attempt number. */
export const CAMPAIGN_RUN_KEY_PATTERN = /^campaign-[A-Za-z0-9_.:-]{1,64}-[0-9]{1,15}$/;

export const isIslandKey = (value: unknown): value is IslandKey =>
  typeof value === "string" && ISLAND_KEY_PATTERN.test(value);

export const isArchivedIslandKey = (value: unknown): value is ArchivedIslandKey =>
  typeof value === "string" && ARCHIVED_ISLAND_KEY_PATTERN.test(value);

export const isCampaignRunRowKey = (value: unknown): value is CampaignRunRowKey =>
  typeof value === "string" && CAMPAIGN_RUN_KEY_PATTERN.test(value);

/** Island rows, snapshot rows and command-log intervals accept an island or a campaign run key. */
export const isSnapshotRowKey = (value: unknown): value is SnapshotRowKey =>
  isIslandKey(value) || isCampaignRunRowKey(value);
