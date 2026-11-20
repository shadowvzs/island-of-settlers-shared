import type { AssetRef, ContentId, ContentKind, ModelRef, RuleId, SidecarRef } from "./refs.ts";

export interface ContentText {
  /** English source text: the Lingui source message and the only text the server and the sim use. */
  en: string;
  /** Lingui message id. Existing ids are kept verbatim; new ones follow `content.<kind>.<key>.<field>`. */
  key: string;
}

export interface ContentTexts {
  description?: ContentText;
  name: ContentText;
  /** ICU plural message (`{count, plural, one {…} other {…}}`), e.g. `domain.wareCount.<key>`. */
  plural?: ContentText;
  /** Per-qualifier names: nation building names, troop singular/plural. */
  variants?: Readonly<Record<string, ContentText>>;
}

/** Inclusive numeric qualifier range. */
export interface QualifierRange {
  max: number;
  min: number;
}

/** Qualifier axes an instance may carry (trigger ActorTypeRef qualifiers, registry variants). */
export interface VariantAxes {
  finish?: readonly string[];
  form?: readonly string[];
  level?: QualifierRange;
  nation?: readonly string[] | "all";
  rank?: QualifierRange;
}

export type QualifierAxis = keyof VariantAxes;
export type Qualifiers = Readonly<Partial<Record<QualifierAxis, number | string>>>;

/** Actor profile (TRG/REG): which trigger events an instance raises and which actions may target it. */
export interface ActorBlock {
  capabilities: readonly string[];
  targetOf?: readonly string[];
}

/** Placeable registry block (REG §2.2 minus what the entry already holds); absent = not placeable. */
export interface PlacementBlock {
  delegate?: RuleId;
  fields?: readonly string[];
  mode: string;
  quality?: string;
  rules?: readonly RuleId[];
  seed?: string;
  storage: string;
}

/** Fields every content entry shares; the kind's payload sits beside them under its own name. */
export interface ContentEntryBase<K extends ContentKind = ContentKind> {
  actor?: ActorBlock;
  /** UI tab / palette category id from `data/categories.json`. */
  category: string;
  /** Persisted numeric code where the sim/save uses numbers (BuildingType, PROP byte, CRITTER byte). */
  code?: number;
  /** Trigger family, dot separated, most general first: "animal.deer", "building.military". */
  family: string;
  icon?: AssetRef;
  id: ContentId;
  /** The persisted identifier (ware key, decoration content id, camelCase species name); never changes. */
  key: string;
  kind: K;
  model?: ModelRef;
  placement?: PlacementBlock;
  /** Retired entries stay (ids are never reused) but are hidden from every list. */
  retired?: true;
  /** Heavy data loaded lazily by path (catalog README, "Core and sidecars"). */
  sidecars?: Readonly<Record<string, SidecarRef>>;
  /** Orthogonal sets: "tool", "food", "huntable", "military", … */
  tags: readonly string[];
  text: ContentTexts;
  variants?: VariantAxes;
}
