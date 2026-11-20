import { isPlainObject } from "../../validation/index.ts";
import type {
  BuildGoal, BuildGoalGroup, BuildProgram, BuildProgramOverlay, PostureStockTarget
} from "../types/ai.ts";

/** The overlay fields that replace the base program's value as a whole. */
const OVERLAY_SCALARS = ["commitmentPercent", "costWeight", "strategy", "style", "threatPenalty"] as const;

/** A style file that names `extends` is an overlay on that program (`BuildProgramOverlay`), not a whole program. */
export const isProgramOverlay = (raw: unknown): raw is BuildProgramOverlay =>
  isPlainObject(raw) && typeof raw.extends === "string";

const patchGoals = (goals: readonly BuildGoal[], overlay: BuildProgramOverlay) => {
  const removed = new Set(overlay.removeGoals ?? []);
  const kept = goals.filter(goal => !removed.has(goal.id))
    .map(goal => ({ ...goal, ...overlay.goals?.[goal.id] }) as BuildGoal);
  const all = [...kept, ...overlay.addGoals ?? []];
  if (!overlay.goalOrder) return all;
  return overlay.goalOrder.flatMap(id => all.filter(goal => goal.id === id));
};

const patchGroups = (groups: BuildProgram["groups"], patch: BuildProgramOverlay["groups"]) =>
  Object.fromEntries(Object.entries(groups).map(([key, group]): [string, BuildGoalGroup] =>
    [key, { ...group, ...patch?.[key] }]));

const patchStock = (stock: BuildProgram["stock"], patch: BuildProgramOverlay["stock"]): BuildProgram["stock"] => ({
  default: patch?.default ?? stock.default,
  resumeMargin: patch?.resumeMargin ?? stock.resumeMargin,
  wares: { ...stock.wares, ...patch?.wares } as Readonly<Record<string, PostureStockTarget>>
});

/**
 * The whole program of a style overlay (lane EAI5a, owner rule "do not duplicate"): its base program with the
 * overlay's goals removed, goal fields replaced, goals appended, then the goal order applied; group factors, stock
 * targets and the scalar fields replaced; the `strategy` block added. Pure; runs once when the programs load (and in
 * the Node check), never in a decision. An id the base lacks is skipped here: `validateBuildPrograms` reports it.
 */
export const applyProgramOverlay = (base: BuildProgram, overlay: BuildProgramOverlay): BuildProgram => {
  const scalars = Object.fromEntries(OVERLAY_SCALARS.filter(key => overlay[key] !== undefined)
    .map(key => [key, overlay[key]]));
  return {
    ...base, ...scalars, goals: patchGoals(base.goals, overlay), groups: patchGroups(base.groups, overlay.groups),
    stock: patchStock(base.stock, overlay.stock)
  };
};

/**
 * Every program of `raw` (keyed by style) as a whole program: an overlay resolved onto its base, any other file
 * as it is. An overlay whose base is missing or itself an overlay stays raw (the check reports it).
 */
export const resolveBuildPrograms = (raw: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(raw).map(([style, program]) => {
    if (!isProgramOverlay(program)) return [style, program];
    const base = raw[program.extends];
    if (!isPlainObject(base) || isProgramOverlay(base)) return [style, program];
    return [style, applyProgramOverlay(base as unknown as BuildProgram, program)];
  }));
