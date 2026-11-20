import type { MusicEntry, SoundEntry } from "./audio.ts";
import type { BanditEntry } from "./bandit.ts";
import type { BuildingEntry } from "./building.ts";
import type { DecorationEntry } from "./decoration.ts";
import type { ItemEntry } from "./item.ts";
import type { LifeEntry } from "./life.ts";
import type { NationEntry } from "./nation.ts";
import type { OfferEntry } from "./offer.ts";
import type { DepositEntry, PropEntry } from "./props.ts";
import type { ContentKind } from "./refs.ts";
import type { ShipEntry } from "./ships.ts";
import type { CommanderEntry, SettlerEntry, SoldierEntry } from "./units.ts";
import type { WareEntry } from "./ware.ts";

/** Every entry type with data; a kind lane adds its entry type here together with its data file. */
export type ContentEntry =
  BanditEntry | BuildingEntry | CommanderEntry | DecorationEntry | DepositEntry | ItemEntry | LifeEntry | MusicEntry
  | NationEntry | OfferEntry | PropEntry | SettlerEntry | ShipEntry | SoldierEntry | SoundEntry | WareEntry;
/** The entry type of one kind. */
export type EntryOfKind<K extends ContentKind> = DistributeKind<ContentEntry, K>;
/** Entry types whose kind covers K (an entry type may serve several kinds, e.g. the ground props). */
type DistributeKind<E, K extends ContentKind> = E extends { kind: infer EK } ? (K extends EK ? E & { kind: K } : never)
  : never;

export type {
  AudioEntry, AudioKind, AudioLicence, AudioPayload, AudioSource, AudioType, MusicEntry, SoundEntry
} from "./audio.ts";
export type { BanditCampModelLayout, BanditEntry, BanditSiteRef } from "./bandit.ts";
export type { BuildingEntry } from "./building.ts";
export type { CatalogCategory } from "./category.ts";
export type {
  ActorBlock, ContentEntryBase, ContentText, ContentTexts, PlacementBlock, QualifierAxis, QualifierRange,
  Qualifiers, VariantAxes
} from "./entry.ts";
export type {
  DecorationEntry, DecorationFinish, DecorationPlant, DecorationReleaseGate, DecorationUse
} from "./decoration.ts";
export type { ItemEntry } from "./item.ts";
export type { LifeEntry, LifeKind } from "./life.ts";
export type {
  NationEntry, NationTerrainAffinity, NationTerrainPalette, NationTerrainTrees, NationTerrainWater
} from "./nation.ts";
export type { OfferEntry } from "./offer.ts";
export type { DepositEntry, EditorToolChoice, PropEntry, PropLayer } from "./props.ts";
export type {
  AssetRef, AssetRoot, ContentId, ContentKind, CueId, ModelRef, RecipeId, RuleId, SidecarRef
} from "./refs.ts";
export type { RewardEntry, RewardEntryKind } from "./reward.ts";
export type { ShipEntry, ShipHull, ShipLiveryKind } from "./ships.ts";
export type {
  CommanderEntry, SettlerEntry, SoldierEntry, SoldierPortraits, SoldierProfile, WareAmounts
} from "./units.ts";
export type { EconomyScope, WareEntry } from "./ware.ts";
export type * from "./ai.ts";
export type * from "./balance.ts";
export type * from "./building-data.ts";
export type * from "./tuning.ts";
export type * from "./building-geometry.ts";
