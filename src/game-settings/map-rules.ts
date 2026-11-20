import type { SimFeatureKey } from "./game-settings.ts";

/**
 * Per-map overrides (`MapScenario.rules`, plan §5.3): all optional, absent = inherit the game settings. A map may
 * only narrow (feature off, catch-up skip, talents none, XP none); the single exception is the fixed level, which
 * may widen on campaign maps and only lower on adventure maps (rev G10).
 */
export interface MapRules {
  experience?: "none";
  /** "off" switches a feature off on this island even when the game settings allow it. */
  features?: Partial<Record<SimFeatureKey, "off">>;
  /** Campaign maps: any level. Adventure maps: at most the account level. Other maps: refused. */
  level?: { kind: "fixed"; level: number };
  /** Refused on home maps: the home always catches up while online (R7, rev G11). */
  offlineCatchUp?: "skip";
  talents?: "none";
}
