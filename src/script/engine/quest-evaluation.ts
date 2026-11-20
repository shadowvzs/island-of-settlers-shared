import type { ScriptQuest } from "../types/quests.ts";
import { evaluateCondition } from "./conditions.ts";
import { EMPTY_FRAME, type ScriptEngineCore } from "./core.ts";
import { actorRegionObjectiveProgress, conditionObjectiveProgress } from "./quest-conditions.ts";
import {
  activateQuest, claimQuest, failQuest, questFactsOf, retryQuest, type StartQuestList, succeedQuest
} from "./quest-state.ts";
import { eligibleQuestIds, isProgressComplete, objectiveProgress } from "./quests.ts";

/**
 * The quest pass of the one-second cadence (TRG6, QU §7.2) and the single pass at the end of catch-up (§7.4), in
 * book order: activation (group, unlock, prerequisites), the failure condition, the objective, then the automatic
 * steps of hidden quests (claim on success, retry after a failure with `retryAfterFail`). Catch-up passes run
 * without the automatic steps: hidden quests claim on the first live tick instead.
 */

export interface QuestPassOptions {
  /** Hidden quests claim and retry automatically (live ticks only). */
  automatic: boolean;
}

const objectiveMet = (core: ScriptEngineCore, quest: ScriptQuest) => {
  if (quest.objective.kind === "actorReachedRegion") {
    return isProgressComplete(actorRegionObjectiveProgress(core, quest.objective));
  }
  const state = core.state.quests[quest.id]!;
  return isProgressComplete(objectiveProgress(quest.objective, state, questFactsOf(core),
    objective => conditionObjectiveProgress(core, objective)));
};

/**
 * `justActivated`: the quest's `onActivate` run has not executed yet (it runs after this pass), so its failure
 * condition waits for the next cadence; otherwise "the escorted actor is not alive" fails before `appear` ran
 * (TRG5a, §14.2).
 */
const evaluateActive = (core: ScriptEngineCore, quest: ScriptQuest, start: StartQuestList, automatic: boolean,
  justActivated: boolean) => {
  if (!justActivated && quest.failure && evaluateCondition(core, EMPTY_FRAME, quest.failure)) {
    failQuest(core, quest.id, start);
    return;
  }
  if (objectiveMet(core, quest)) succeedQuest(core, quest.id, start, automatic);
};

/** Hidden quests: a success claims itself, a retryable failure re-arms (design §4.10). */
export const runHiddenQuestSteps = (core: ScriptEngineCore, start: StartQuestList) => {
  for (const quest of core.script.quests.quests) {
    if (quest.visibility !== "hidden") continue;
    const state = core.state.quests[quest.id]?.state;
    if (state === "succeeded") claimQuest(core, quest.id, start);
    else if (state === "failed") retryQuest(core, quest.id, start);
  }
};

export const evaluateQuests = (core: ScriptEngineCore, start: StartQuestList, options: QuestPassOptions) => {
  const book = core.script.quests;
  if (book.quests.length === 0) return;
  const activated = new Set(eligibleQuestIds(book, core.state.quests, questFactsOf(core).playerLevel()));
  for (const id of activated) activateQuest(core, id, start);
  for (const quest of book.quests) {
    if (core.state.quests[quest.id]?.state !== "active") continue;
    evaluateActive(core, quest, start, options.automatic, activated.has(quest.id));
  }
  if (options.automatic) runHiddenQuestSteps(core, start);
};
