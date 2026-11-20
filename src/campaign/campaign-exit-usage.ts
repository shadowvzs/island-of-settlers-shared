import { scriptReferences } from "../script/references.ts";
import type { MapScript } from "../script/types/script.ts";
import { campaignIssue, type CampaignIssue } from "./campaign-issues.ts";
import type { CampaignMap } from "./campaign-model.ts";

/**
 * The Check-only exit rule of a campaign map (BR2, campaign-branching-plan-2026-11-11 §10): it needs the map file's
 * script beside the record. A declared exit that no `endMap` names can never be chosen, so its edges are dead.
 * The implicit `victory` exit is never reported: built-in victory rules and a plain `endMap(victory)` use it.
 */

/** The exit ids the script's `endMap` actions name (every `exit` reference of the script). */
export const scriptExitIds = (script: MapScript | null | undefined): ReadonlySet<string> =>
  new Set(script ? scriptReferences(script).filter(reference => reference.kind === "exit").map(({ id }) => id) : []);

/** One `campaignExitUnused` warning per declared exit the map file's script never names, in record order. */
export const unusedExitIssues = (
  map: Pick<CampaignMap, "exits">, script: MapScript | null | undefined
): CampaignIssue[] => {
  const used = scriptExitIds(script);
  return (map.exits ?? []).flatMap((exit, index) => (used.has(exit.id) ? []
    : [campaignIssue("warning", "campaignExitUnused", `exits[${index}]`, { exit: exit.id })]));
};
