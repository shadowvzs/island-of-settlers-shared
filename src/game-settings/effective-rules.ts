import { MAX_PLAYER_LEVEL } from "../catalog/balance/levels.ts";
import { MIN_PLAYER_LEVEL } from "./constants.ts";
import type { LevelRule, RuleIslandRole } from "./game-settings.ts";
import type { MapRules } from "./map-rules.ts";
import type { CatchUpRule, SimRules } from "./sim-rules.ts";

/**
 * The level rule of one island. `capped` exists only on adventure maps under earned levels: the map's fixed level
 * counts, but never above the account level (rev G10), so it resolves against the account level at read time.
 */
export type EffectiveLevelRule = LevelRule | { kind: "capped"; level: number };

/** Pinned fields the island rules drop (home, revision) or resolve to another type (level, sight rule). */
type ResolvedSimRuleKey = "homeIsland" | "level" | "playerTroopsSightOnly" | "revision";

/** The rules of one island: the pinned game rules narrowed by the map's own rules (plan §6). */
export interface EffectiveRules extends Omit<SimRules, ResolvedSimRuleKey> {
  level: EffectiveLevelRule;
  /** Resolved player troop sight rule (absent in the pinned rules = on); maps cannot change it. */
  playerTroopsSightOnly: boolean;
}

const mapSkipsCatchUp = (map: MapRules | undefined, role: RuleIslandRole) =>
  role !== "home" && map?.offlineCatchUp === "skip";

/** Campaign maps never catch up; the home ignores a map skip; offline (`sim.catchUp` skip) skips everything. */
const effectiveCatchUp = (sim: SimRules, map: MapRules | undefined, role: RuleIslandRole): CatchUpRule => {
  if (sim.catchUp === "skip" || role === "campaign") return "skip";
  return mapSkipsCatchUp(map, role) ? "skip" : "run";
};

/** Adventure loot goes home, so the map level may only lower the level the account plays with. */
const adventureLevel = (simLevel: LevelRule, mapLevel: number): EffectiveLevelRule => {
  if (simLevel.kind === "earned") return { kind: "capped", level: mapLevel };
  return { kind: "fixed", level: Math.min(simLevel.level, mapLevel) };
};

const effectiveLevel = (sim: SimRules, map: MapRules | undefined, role: RuleIslandRole): EffectiveLevelRule => {
  const mapLevel = map?.level;
  if (!mapLevel) return sim.level;
  if (role === "campaign") return mapLevel;
  if (role === "adventure") return adventureLevel(sim.level, mapLevel.level);
  return sim.level;
};

/**
 * The one resolver: game rules (`SimRules`, pinned in the save) + the map file's `MapRules` + the island role.
 * Pure and deterministic; the result shares no mutable state with its inputs beyond the frozen level objects.
 * A map can never switch on what the game rules switch off; only the fixed level may differ (see `MapRules`).
 */
export const effectiveRules = (sim: SimRules, map: MapRules | undefined, role: RuleIslandRole): EffectiveRules => {
  const features = map?.features;
  return {
    adventures: sim.adventures && features?.adventures !== "off",
    catchUp: effectiveCatchUp(sim, map, role),
    colonies: sim.colonies && features?.colonies !== "off",
    experience: sim.experience && map?.experience !== "none",
    // Nothing to explore without fog (owner 2026-11-12), whatever the exploration switch says.
    explorationExpeditions: sim.explorationExpeditions && sim.fogOfWar && features?.explorationExpeditions !== "off",
    fogOfWar: sim.fogOfWar,
    level: effectiveLevel(sim, map, role),
    playerTroopsSightOnly: sim.playerTroopsSightOnly ?? true,
    rewards: sim.rewards,
    settlementExpeditions: sim.settlementExpeditions && features?.settlementExpeditions !== "off",
    talents: sim.talents && map?.talents !== "none",
    trade: sim.trade && features?.trade !== "off"
  };
};

const clampLevel = (level: number) => Math.min(MAX_PLAYER_LEVEL, Math.max(MIN_PLAYER_LEVEL, Math.trunc(level)));

/**
 * The level the island plays with, given the account level (`options.playerLevel()` today). Earned levels return
 * the account level untouched, exactly as today's readers see it.
 */
export const resolveEffectiveLevel = (rule: EffectiveLevelRule, accountLevel: number) => {
  if (rule.kind === "earned") return accountLevel;
  if (rule.kind === "fixed") return clampLevel(rule.level);
  return clampLevel(Math.min(accountLevel, rule.level));
};
