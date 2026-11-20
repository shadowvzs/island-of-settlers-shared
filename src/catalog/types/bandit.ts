import type { ContentEntryBase } from "./entry.ts";

/** One camp layout (the persisted `BanditSiteRef.layout` indexes `bandit.models`). */
export interface BanditCampModelLayout {
  /** Grid footprint [width, depth] in cells. */
  cells: readonly [number, number];
  /** Garrison of this layout; absent: the entry's `capacity`. */
  capacity?: number;
  /** A walled camp, an open archer scaffold (named by `text.variants.tower`) or a stronghold. */
  kind: "camp" | "stronghold" | "tower";
  /** Corner lookout posts. */
  lookouts: number;
}

/** What saves, maps and render frames store for a bandit site: its `bandit:` code and layout index. */
export interface BanditSiteRef {
  code: number;
  layout: number;
}

/**
 * A hostile bandit site (`bandit:<key>`, lane CAT7): its own kind and codes, no longer building codes. Saves and
 * maps store a site as `{ code, layout }` (`BanditSiteRef`, lane BANDIT-CODES); `militaryBuilding` names the
 * building whose military rules the site borrows at run time. Texts: `name` (the open site), `variants.enclosure`
 * (the walled building variant), `variants.tier` (difficulty label) and, for the scaffold layout, `variants.tower`.
 */
export interface BanditEntry extends ContentEntryBase<"bandit"> {
  bandit: {
    capacity: number;
    /** `building:*` id of the borrowed military rules (garrison posts, walls, assault role). */
    militaryBuilding: string;
    models: readonly BanditCampModelLayout[];
    /** English difficulty tier (status lines); its text is `text.variants.tier`. */
    tier: "Hard" | "Medium" | "Very hard";
  };
  code: number;
}
