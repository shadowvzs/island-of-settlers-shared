import type { ContentId } from "./refs.ts";

/**
 * What a computer faction's strategic layer plays for (enemy economy AI plan §3.3): `grow` while it knows of no enemy
 * soldier, `fortify` while it does. P4 adds the military postures (`muster`, `attack`, `recover`).
 */
export type AiPosture = "fortify" | "grow";

/** One step of a goal's target count curve: from `buildings` own buildings (sites included) on, want `count`. */
export interface BuildGoalStep {
  buildings: number;
  count: number;
}

/** A goal that must stand first: at least `count` finished buildings of the earlier goal `goal`. */
export interface BuildGoalRequirement {
  count: number;
  goal: string;
}

/** One goal of a build program: a building type the faction wants a number of. */
export interface BuildGoal {
  /** The building (`building:*`); one goal per building in a program. */
  building: ContentId;
  /** A key of the program's `groups`. */
  group: string;
  /** The goal's key, unique in its program (saved as the faction's current goal). */
  id: string;
  /** Only these computer nations play the goal (a nation-specific construction ware); absent: every nation. */
  nations?: readonly string[];
  /**
   * A nation's own target curve in place of `target` (the Indigenous cloth chain from the start: its construction
   * receipts take cloth); same rules as `target`.
   */
  nationTargets?: Readonly<Record<string, readonly BuildGoalStep[]>>;
  /** Earlier goals only, so the program order is a valid build order. */
  requires?: readonly BuildGoalRequirement[];
  /** Ascending `buildings`, the first at 0. */
  target: readonly BuildGoalStep[];
  /** Whole score points per missing building. */
  weight: number;
}

/** Factors shared by the goals of one group (percent: 100 changes nothing). */
export interface BuildGoalGroup {
  /** Its workers work outdoors: every known enemy soldier lowers the group's goals (`threatPenalty`). */
  exposed: boolean;
  postures: Readonly<Record<AiPosture, number>>;
  /** The style's preference for the group. */
  style: number;
}

/** A stock target per strategic posture (whole units of one ware in the faction's free stock). */
export type PostureStockTarget = Readonly<Record<AiPosture, number>>;

/**
 * The economy manager's stock targets (enemy economy AI plan §3.6): it pauses a producer once every output reaches
 * its target and resumes it `resumeMargin` units below, so a producer near its target does not flap.
 */
export interface StockTargets {
  /** The target of every ware without its own entry. */
  default: PostureStockTarget;
  /** Below every target. */
  resumeMargin: number;
  /** Ware keys (as production rules name them) produced by one of the program's goals. */
  wares: Readonly<Record<string, PostureStockTarget>>;
}

/** Whether a style's offensives may be raids: as its level allows, always or never (EAI5a). */
export type StyleRaids = "always" | "level" | "never";

/**
 * How a style plays its posture and its own strategic intents (enemy economy AI plan §3.4 `styleFactor`, lane
 * EAI5a). The offensive terms are percentages of the faction's level row (100: the level's value), so a level still
 * scales every style the same simple way.
 */
export interface StyleStrategy {
  /** Of the own-to-known enemy strength an offensive needs. */
  attackRatioPercent: number;
  /** Of the strength an attack musters before it sets out. */
  attackStrengthPercent: number;
  /** The posture while the faction knows of no enemy soldier (turtle: `fortify`, every tower fully manned). */
  calmPosture: AiPosture;
  /** Of the game tick from which the faction's first offensive may be ordered. */
  firstAttackPercent: number;
  raids: StyleRaids;
  /** Of the back-off after a failed offensive. */
  retryPercent: number;
  /** Soldiers the economy keeps in its depot beyond its garrisons, for the next tower and its forces. */
  soldierReserve: number;
}

/**
 * A style's build program (`data/ai/<style>.json`, enemy economy AI plan §3.4): goals in build order. Each strategic
 * decision scores at most 8 open goals as `deficit × weight × style × posture − cost/stock − threat`.
 */
export interface BuildProgram {
  /** A new goal replaces the committed one only when its score beats it by more than this percentage. */
  commitmentPercent: number;
  /** Score points per construction ware as a share of the faction's free stock of it. */
  costWeight: number;
  goals: readonly BuildGoal[];
  groups: Readonly<Record<string, BuildGoalGroup>>;
  /** The economy manager's stock targets for the style. */
  stock: StockTargets;
  /** The style key (`AI_STYLES`). */
  style: string;
  /** Absent: `DEFAULT_STYLE_STRATEGY` (the balanced play). */
  strategy?: StyleStrategy;
  /** Score points per known enemy soldier on the goals of exposed groups. */
  threatPenalty: number;
}

/**
 * A style file that changes another program instead of repeating it (`data/ai/<style>.json` with `extends`, lane
 * EAI5a; owner rule "do not duplicate"). Applied in this order: `removeGoals`, `goals` (fields replaced per goal),
 * `addGoals` (appended), `goalOrder` (every resulting goal id once); `groups` replace factors per group, `stock`
 * replaces the default, the margin and targets per ware; the scalars and `strategy` replace the base's.
 */
export interface BuildProgramOverlay {
  addGoals?: readonly BuildGoal[];
  commitmentPercent?: number;
  costWeight?: number;
  /** The style of the base program (a whole program, never another overlay). */
  extends: string;
  goalOrder?: readonly string[];
  goals?: Readonly<Record<string, Partial<Omit<BuildGoal, "id">>>>;
  groups?: Readonly<Record<string, Partial<BuildGoalGroup>>>;
  removeGoals?: readonly string[];
  stock?: Partial<StockTargets>;
  strategy?: StyleStrategy;
  style: string;
  threatPenalty?: number;
}
