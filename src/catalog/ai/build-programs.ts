import aggressive from "../data/ai/aggressive.json" with { type: "json" };
import balanced from "../data/ai/balanced.json" with { type: "json" };
import turtle from "../data/ai/turtle.json" with { type: "json" };
import { deepFreeze } from "../helpers.ts";
import type { BuildProgram, BuildProgramOverlay, StyleStrategy } from "../types/ai.ts";
import { applyProgramOverlay } from "./program-overlay.ts";

export { AI_POSTURES } from "../constants.ts";

const base = balanced as unknown as BuildProgram;
const overlaid = (overlay: unknown) => applyProgramOverlay(base, overlay as BuildProgramOverlay);

/**
 * The computer factions' build programs keyed by style (`data/ai/<style>.json`, enemy economy AI plan §3.4); the
 * turtle and aggressive files are overlays on balanced (EAI5a), resolved here once when the module loads.
 * Simulation data: loaded synchronously with the consumer's chunk through `@shared/catalog/ai/build-programs`, never
 * with the core catalog; validated by `validateBuildPrograms`.
 */
export const BUILD_PROGRAMS = deepFreeze({
  aggressive: overlaid(aggressive), balanced: base, turtle: overlaid(turtle)
}) as unknown as Readonly<Record<string, BuildProgram>>;

/** The style a faction plays when neither the map nor a script names one. */
export const DEFAULT_BUILD_PROGRAM_STYLE = "balanced";

/** The program a style plays: its own, else the balanced one. */
export const buildProgramOf = (style: string): BuildProgram =>
  BUILD_PROGRAMS[style] ?? BUILD_PROGRAMS[DEFAULT_BUILD_PROGRAM_STYLE]!;

/** The balanced play: the level's offensive row unchanged, the grow posture while calm, two reserve soldiers. */
export const DEFAULT_STYLE_STRATEGY: Readonly<StyleStrategy> = Object.freeze({
  attackRatioPercent: 100, attackStrengthPercent: 100, calmPosture: "grow", firstAttackPercent: 100, raids: "level",
  retryPercent: 100, soldierReserve: 2
});

/** How a style plays its posture and offensives (EAI5a): its program's `strategy`, else the balanced play. */
export const styleStrategyOf = (style: string): Readonly<StyleStrategy> =>
  buildProgramOf(style).strategy ?? DEFAULT_STYLE_STRATEGY;
