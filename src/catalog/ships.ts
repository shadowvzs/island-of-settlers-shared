import { entryByKey } from "./loader.ts";
import type { ShipEntry, ShipHull } from "./types/ships.ts";

/** A ship (`ship:<key>`) or boat (`boat:<key>`) entry, retired ones included. */
export const shipEntry = (kind: "boat" | "ship", key: string): ShipEntry | undefined => entryByKey(kind, key);

/** The hull contract an entry sails: its own, or the one of the entry named by `hullOf`. */
export const shipHull = (kind: "boat" | "ship", key: string): ShipHull | undefined => {
  const entry = shipEntry(kind, key);
  if (!entry) return undefined;
  if (entry.ship.hull) return entry.ship.hull;
  const [hullKind, hullKey] = entry.ship.hullOf!.split(":") as ["boat" | "ship", string];
  return shipEntry(hullKind, hullKey)?.ship.hull;
};

/** Deck capacity of the sailing ship (`ship:sailingShip`): soldier slots and ware boxes of one full deck. */
export const shipDeckCapacity = (): Readonly<{ boxes: number; passengers: number }> =>
  shipEntry("ship", "sailingShip")!.ship.capacity!;
