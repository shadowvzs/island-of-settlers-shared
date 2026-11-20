import { CAMPAIGN_SOLDIER_TYPES } from "../campaign/campaign-constants.ts";
import { validateRegions } from "../campaign/campaign-regions.ts";
import { validateRewardEntries } from "../catalog/validate/rewards.ts";
import { createScriptIssueSink, scriptValidationResult, type ScriptValidationResult } from "./issues.ts";
import { checkMapScriptShape } from "./shape.ts";
import type { MapScript } from "./types/script.ts";
import { checkActors } from "./validate/actors.ts";
import { createValidationRun, type ScriptValidationContext, type ValidationRun } from "./validate/context.ts";
import { checkQuests } from "./validate/quests.ts";
import { checkReferences } from "./validate/references.ts";
import { checkScriptRules } from "./validate/rules.ts";
import { checkTrigger } from "./validate/triggers.ts";
import { checkVariables } from "./validate/variables.ts";

export {
  CONTENT_CATALOG_VIEW, type ScriptCatalogView, type ScriptFactionAiView, type ScriptValidationContext
} from "./validate/context.ts";

const checkHomeRewards = (run: ValidationRun) => {
  const soldierTypes = run.context.soldierTypes ?? CAMPAIGN_SOLDIER_TYPES;
  run.script.homeRewards.forEach((reward, index) => {
    const path = `homeRewards[${index}]`;
    const options = { buildingTypes: run.context.buildingTypes, soldierTypes };
    for (const issue of validateRewardEntries(reward.rewards, options, `${path}.rewards`))
      run.sink.add("error", "invalidReward", issue.path, { detail: issue.message });
    if (reward.occurrence.kind === "counter")
      run.sink.add("warning", "homeRewardBeforeCompletionProof", `${path}.occurrence`, { item: reward.id });
  });
};

const checkRegionLibrary = (run: ValidationRun) => {
  for (const issue of validateRegions(run.script.regions)) {
    if (issue.code === "invalidRegionShape") run.sink.add("error", "invalidShape", issue.path, { detail: issue.code });
  }
};

/**
 * The map script Ready check (trigger design §11.1), shared by the editor save flow, the import report and the API
 * publish check: shape first, then references, catalogue slots, catalog capabilities and whole-script rules.
 * Errors make the map a draft; warnings and info notes never block.
 */
export const validateMapScript = (value: unknown, context: ScriptValidationContext): ScriptValidationResult => {
  const sink = createScriptIssueSink();
  if (!checkMapScriptShape(value, sink)) return scriptValidationResult(sink.issues, false);
  const run = createValidationRun(value as MapScript, context, sink);
  const references = checkReferences(run);
  checkRegionLibrary(run);
  checkVariables(run);
  checkActors(run);
  run.script.triggers.forEach((trigger, index) => checkTrigger(run, trigger, `triggers[${index}]`));
  checkQuests(run);
  checkHomeRewards(run);
  checkScriptRules(run, references);
  return scriptValidationResult(sink.issues, run.environment.reads);
};
