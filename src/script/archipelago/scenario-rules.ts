import type { QuestBook, QuestObjective } from "../types/index.ts";
import { scenarioQuestOf } from "./book-parts.ts";
import type { ScenarioBookRules } from "./types.ts";

/**
 * Reads the authored scenario rules back from a generated (or admin-edited) book: the inverse of the generators,
 * so the book can replace `MapScenario.objective/rewardCoins/claimSeconds/expirySeconds` as the one source.
 */

const objectiveRule = (objective: QuestObjective): ScenarioBookRules["objective"] | null => {
  if (objective.kind === "enemyBuildingDestroyed" && objective.all && objective.buildingId === null) return "capture";
  if (objective.kind === "enemiesDefeated" && objective.all) return "defeat";
  return null;
};

const holdSecondsOf = (objective: QuestObjective) =>
  (objective.kind === "enemiesDefeated" || objective.kind === "enemyBuildingDestroyed")
    ? objective.holdSeconds ?? 0 : 0;

/** The scenario rules of a book, or null when it has no conquest/win quest with a scenario objective. */
export const scenarioRulesOf = (book: QuestBook): ScenarioBookRules | null => {
  const quest = scenarioQuestOf(book);
  const objective = quest && objectiveRule(quest.objective);
  if (!quest || !objective) return null;
  return {
    claimSeconds: holdSecondsOf(quest.objective),
    expirySeconds: quest.deadline?.kind === "gameTime" ? quest.deadline.seconds : 0,
    objective,
    rewardCoins: quest.mapReward?.coins ?? 0
  };
};
