import type { QuestObjective } from "../types/quests.ts";
import { evaluateCondition } from "./conditions.ts";
import { EMPTY_FRAME, type ScriptEngineCore } from "./core.ts";
import { evaluateExpr, resolveActors } from "./expressions.ts";
import type { QuestProgress } from "./quests.ts";

/**
 * `condition` objectives (design §4.10): met when the condition holds; the optional progress expressions only feed
 * the quest window's bar (a met condition always shows full progress).
 */
const numberOr = (value: unknown, fallback: number) => typeof value === "number" ? value : fallback;

export const conditionObjectiveProgress = (
  core: ScriptEngineCore, objective: Extract<QuestObjective, { kind: "condition" }>
): QuestProgress => {
  const met = evaluateCondition(core, EMPTY_FRAME, objective.condition);
  if (!objective.progress) return { current: met ? 1 : 0, target: 1 };
  const target = Math.max(1, numberOr(evaluateExpr(core, EMPTY_FRAME, objective.progress.target), 1));
  if (met) return { current: target, target };
  const current = numberOr(evaluateExpr(core, EMPTY_FRAME, objective.progress.current), 0);
  return { current: Math.min(Math.max(0, current), target - 1), target };
};

/**
 * `actorReachedRegion` (TRG5a, §14.2): the authored actor's live members stand in the region (any or all of them),
 * read through the world port's direct region lookup on the one-second cadence.
 */
export const actorRegionObjectiveProgress = (
  core: ScriptEngineCore, objective: Extract<QuestObjective, { kind: "actorReachedRegion" }>
): QuestProgress => {
  const members = resolveActors(core, EMPTY_FRAME, { actor: objective.actor, kind: "instance" });
  const inside = (handle: (typeof members)[number]) => core.port.actorInRegion?.(handle, objective.region.id) ?? false;
  const met = members.length > 0 && (objective.quantifier === "all" ? members.every(inside) : members.some(inside));
  return { current: met ? 1 : 0, target: 1 };
};
