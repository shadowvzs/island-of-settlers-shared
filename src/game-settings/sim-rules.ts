import { canonicalHash } from "../script/hash.ts";
import { LEGACY_RULES_REVISION, LOCAL_RULES_REVISION_PREFIX } from "./constants.ts";
import {
  DEFAULT_ONLINE_SETTINGS, fogOfWarEnabled, type GameSettings, hasHomeIsland, type LevelRule, optionalFeatureEnabled,
  playerTroopsSightOnlyEnabled, rewardsEnabled
} from "./game-settings.ts";

export type CatchUpRule = "run" | "skip";

/**
 * What the simulation, replay, catch-up and verifier may read (plan §5.2); everything else in the game settings is
 * UI/server only. A save pins one copy by `revision`; market, chat, friends, guilds and shop are not simulated and
 * stay out (and out of every hash).
 */
export interface SimRules {
  adventures: boolean;
  catchUp: CatchUpRule;
  colonies: boolean;
  experience: boolean;
  /** Exploring expeditions (a switch of their own, owner Q7); unavailable while `fogOfWar` is off. */
  explorationExpeditions: boolean;
  /** Fog of war (owner 2026-11-12): off = revealed islands and no exploring expeditions. */
  fogOfWar: boolean;
  /** `start.place === "home"`: survivors and cargo return only with a home. */
  homeIsland: boolean;
  level: LevelRule;
  /**
   * Player troops act only on known enemies. Absent = on: pinned only when off, so every rules revision and save
   * of the default game stays byte-identical (no format change).
   */
  playerTroopsSightOnly?: boolean;
  /** Online: the server's revision id; offline: `local:<sha256 of the settings>`. */
  revision: string;
  rewards: boolean;
  settlementExpeditions: boolean;
  talents: boolean;
  trade: boolean;
}

/** The simulation subset of `settings` under `revision` (rev G14). Catch-up follows connectivity (rev G11). */
export const toSimRules = (settings: GameSettings, revision: string): SimRules => {
  const { features, progression } = settings;
  return {
    adventures: features.adventures,
    catchUp: settings.connectivity === "online" ? "run" : "skip",
    colonies: features.colonies,
    experience: progression.experience,
    explorationExpeditions: optionalFeatureEnabled(settings, "explorationExpeditions"),
    fogOfWar: fogOfWarEnabled(settings),
    homeIsland: hasHomeIsland(settings),
    level: { ...progression.levels },
    ...(!playerTroopsSightOnlyEnabled(settings) && { playerTroopsSightOnly: false }),
    revision,
    rewards: rewardsEnabled(settings),
    settlementExpeditions: features.settlementExpeditions,
    talents: progression.talents,
    trade: features.trade
  };
};

const freezeSimRules = (rules: SimRules): SimRules => {
  Object.freeze(rules.level);
  return Object.freeze(rules);
};

/**
 * The rules of a save that pinned none: today's behaviour, so absent rules change no hash (plan §6, §12.1). Also
 * the rules of the guest fallback (rev G5) and of a standalone build without a local settings file (rev G17).
 */
export const LEGACY_SIM_RULES: SimRules = freezeSimRules(toSimRules(DEFAULT_ONLINE_SETTINGS, LEGACY_RULES_REVISION));

/**
 * The offline revision of `settings`: a hash of the simulated subset only (rev I11), so equal rules (any key order)
 * give the same revision and a change of an unsimulated switch (saving, chat, market, …) pins nothing new.
 */
export const localRulesRevision = (settings: GameSettings) => {
  const { revision: _revision, ...simulated } = toSimRules(settings, "");
  return `${LOCAL_RULES_REVISION_PREFIX}${canonicalHash(simulated)}`;
};

/** True for an offline revision; the server refuses saves pinned to one (plan §12.2). */
export const isLocalRulesRevision = (revision: string) => revision.startsWith(LOCAL_RULES_REVISION_PREFIX);
