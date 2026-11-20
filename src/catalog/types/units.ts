import type { ContentEntryBase } from "./entry.ts";
import type { AssetRef } from "./refs.ts";

/** Ware key → amount (recruitment and commander costs). */
export type WareAmounts = Readonly<Record<string, number>>;

/**
 * A settler job. `key` is the camelCase job id (`settler:woodcutter`); `settler.job` is the English job string the
 * simulation, saves and command logs store on actors ("Woodcutter", "Iron founder"); it never changes.
 * `category` orders the workforce lists, `icon` is the job's own portrait (absent: carrier with the tool badge).
 */
export interface SettlerEntry extends ContentEntryBase<"settler"> {
  settler: {
    job: string;
    /** Ware key of the tool the worker takes from storage before working. */
    tool?: string;
  };
}

/** Combat values of one troop type; `armour` is indexed by rank. */
export interface SoldierProfile {
  armour: readonly number[];
  damage: number;
  hp: number;
  interval: number;
  minimumRange: number;
  range: number;
  /** Sight radius in tiles (A13 faction perception); larger than any weapon reach. */
  sight: number;
  speed: number;
}

/** Rendered soldier portraits: only the listed nations have their own; others show the Roman soldier. */
export interface SoldierPortraits {
  nations: readonly string[];
  path: AssetRef;
  /** Per-rank portrait (`{rank}` token); absent: the troop portrait for every rank. */
  ranked?: AssetRef;
}

/** A troop type (`soldier:shield`); `icon` is the army icon per nation, `retired` troops stay for saves. */
export interface SoldierEntry extends ContentEntryBase<"soldier"> {
  soldier: {
    portrait: SoldierPortraits;
    profile: SoldierProfile;
    /** Net equipment of one storage recruitment; absent for retired troops. */
    recruitCost?: WareAmounts;
  };
}

/** The national commander (`commander:<nation>`); `definition` is the persisted commander definition id. */
export interface CommanderEntry extends ContentEntryBase<"commander"> {
  commander: {
    aura: { factor: number; kind: "arrowReduction" | "bowDamage" | "meleeDamage" | "meleeDodge" };
    definition: string;
    loadout: "axe" | "bow" | "sword";
    /** Display names chosen by island seed (not translated: proper names). */
    names: readonly string[];
    recruitCost: WareAmounts;
    role: "defensive" | "offensive";
    /** Sight radius in tiles (A13 faction perception). */
    sight: number;
    style: "melee" | "ranged";
  };
}
