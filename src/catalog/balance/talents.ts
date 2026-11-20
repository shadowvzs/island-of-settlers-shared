import type { TalentBranch, TalentDefinition, TalentModifier } from "../types/balance.ts";
import { BALANCE } from "./data.ts";

/**
 * Player talents (TALENT-01/02, owner 2026-10-20/21, docs/plans/talent-plan-2026-10-20.md): three symmetric
 * branches (3 / 2 / 2 / 1 talents in tiers 1..4), every talent up to 5 ranks, one point per player level. Tier 1 is
 * open from level 1; tiers 2 and 3 need a player level and TIER_GATE_POINTS spent in the branch's tier above; the
 * capstone (tier 4, levels 40 / 45 / 50) needs CAPSTONE_BRANCH_POINTS in its branch. Values are per rank and stack
 * additively with every other bonus. Level gates follow the buildings a talent needs (harbour 6, army 8, overseas 11).
 */
const TALENT_BALANCE = BALANCE.talents;

export const TALENT_MAX_RANK = TALENT_BALANCE.maxRank;
export const TALENT_POINTS_PER_LEVEL = TALENT_BALANCE.pointsPerLevel;
/** Points spent in a branch's tier above before its tier 2 or tier 3 talents open. */
export const TIER_GATE_POINTS = TALENT_BALANCE.tierGatePoints;
/** Points spent on a branch's other talents before its capstone opens. */
export const CAPSTONE_BRANCH_POINTS = TALENT_BALANCE.capstoneBranchPoints;
/** Gems for taking back every applied point; pending (unapplied) points reset for free. */
export const TALENT_RESET_GEMS = TALENT_BALANCE.resetGems;
/** Colony crews never start above this many settlers, talent or not (the colony's base limit). */
export const TALENT_COLONY_SETTLER_CAP = TALENT_BALANCE.colonySettlerCap;
export const TALENTS: readonly TalentDefinition[] = TALENT_BALANCE.list;
export const TALENT_BRANCHES: readonly TalentBranch[] = TALENT_BALANCE.branches;
/** Hunter and fishery (Economy tier 1, owner 2026-10-21): the building types of the hunter/fisher talent. */
export const HUNTER_FISHER_TYPES: readonly number[] = Object.freeze(TALENTS
  .find(talent => talent.id === "hunterFisherSpeed")!.affects.filter(subject => typeof subject === "number"));

/** The largest share a talent modifier reaches at full ranks (the server clamps a claimed bonus to it). */
export const maxTalentShare = (modifier: TalentModifier) => TALENTS.reduce((sum, talent) => sum +
  talent.effects.filter(effect => effect.modifier === modifier)
    .reduce((share, effect) => share + effect.perRank * TALENT_MAX_RANK, 0), 0);
