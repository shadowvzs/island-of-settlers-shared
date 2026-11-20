import type { Goods } from "./goods.ts";

/**
 * Offline catch-up produces at most this much game time (owner 2026-10-22): production and colony ore ships stop
 * after it, colony lifetimes keep ageing on real time and the game clock jumps to the current time. The client
 * catch-up and the server's background catch-up/away window both read it.
 */
export const OFFLINE_CATCH_UP_CAP_SECONDS = 24 * 60 * 60;

/** What the time away changed (D4.4): the "While you were away" message after a catch-up at login. */
export interface AwaySummary {
  /** Real seconds since the last save. */
  awaySeconds: number;
  /** Production stopped after the catch-up cap (1 day). */
  capped: boolean;
  /** Colonies whose lifetime ended meanwhile. */
  endedColonies: string[];
  experience: number;
  /** Net change of the home storages' stock. */
  goods: Goods;
}
