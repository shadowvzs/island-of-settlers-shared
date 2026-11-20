import type { ContentEntryBase } from "./entry.ts";
import type { AssetRef, ContentId } from "./refs.ts";

/** Who a hull sails for: the owner's nation style, a neutral trader or the enemy (raider) livery. */
export type ShipLiveryKind = "enemy" | "nation" | "neutral";

/**
 * Gameplay hull contract in world units (tiles): navigation, launch sites, turning and render recipes read it.
 * Sailing ships also carry their overall footprint, render scale and the keep-apart spacing; rowing boats the
 * oar that sweeps the water beside them.
 */
export interface ShipHull {
  beam: number;
  length: number;
  oar?: { inboard: number; length: number };
  overallBeam?: number;
  overallLength?: number;
  scale?: number;
  spacing?: number;
}

/** A ship (`ship:*`) or small boat (`boat:*`). */
export interface ShipEntry extends ContentEntryBase<"boat" | "ship"> {
  ship: {
    /** The building that builds it (its production block's `modes` hold the cost), lane CAT7. */
    builtBy?: ContentId;
    /** Deck capacity: units and ware boxes aboard (`spawnAboard`, `capacityLeft`, colony deck units, cargo). */
    capacity?: { boxes: number; passengers: number };
    /** Own hull contract; absent when the entry sails another entry's hull (`hullOf`). */
    hull?: ShipHull;
    /** The entry whose hull contract this one shares (raiders sail the sailing ship's hull). */
    hullOf?: ContentId;
    liveries: readonly ShipLiveryKind[];
    /** Owned ship portrait per nation. */
    nationIcons?: Readonly<Record<string, AssetRef>>;
    /** Neutral trader portrait per nation. */
    neutralIcons?: Readonly<Record<string, AssetRef>>;
  };
}
