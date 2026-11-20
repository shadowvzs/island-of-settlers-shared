import { type CampaignGraph, type CampaignGraphMap, campaignGraphOf, reachableMaps } from "./campaign-graph.ts";
import { campaignIssue, type CampaignIssue } from "./campaign-issues.ts";
import type { Campaign, CampaignEdge } from "./campaign-model.ts";
import { checkDuplicates } from "./campaign-ready-context.ts";

/**
 * Ready checks of the campaign graph (BR0, campaign-branching-plan-2026-11-11 §10), on the records alone: start
 * maps, edge references, every exit leading somewhere, no cycle, every map reachable, a reachable ending. A campaign
 * without stored edges is checked as its derived linear graph. Pure, ordered and deterministic.
 */
interface GraphRun {
  campaign: Pick<Campaign, "edges" | "mapIds" | "startMapIds">;
  graph: CampaignGraph;
  issues: CampaignIssue[];
  listed: ReadonlySet<string>;
}

const checkStarts = (run: GraphRun) => {
  const starts = run.campaign.startMapIds;
  if (!starts) return;
  if (!starts.length) run.issues.push(campaignIssue("error", "campaignNoStartMap", "startMapIds"));
  checkDuplicates(run, starts, "startMapIds");
  starts.forEach((mapId, index) => {
    if (!run.listed.has(mapId))
      run.issues.push(campaignIssue("error", "campaignEdgeUnknownMap", `startMapIds[${index}]`, { mapId }));
  });
};

const checkEdgeReferences = (run: GraphRun, edge: CampaignEdge, path: string) => {
  const { exit, from, to } = edge;
  if (!run.listed.has(from))
    run.issues.push(campaignIssue("error", "campaignEdgeUnknownMap", `${path}.from`, { mapId: from }));
  if (to !== null && !run.listed.has(to))
    run.issues.push(campaignIssue("error", "campaignEdgeUnknownMap", `${path}.to`, { mapId: to }));
  // A listed map without a record is reported by the map list check; its exits are unknown here.
  const exits = run.graph.exits.get(from);
  if (exits && !exits.includes(exit))
    run.issues.push(campaignIssue("error", "campaignEdgeUnknownExit", `${path}.exit`, { exit, mapId: from }));
};

const checkEdges = (run: GraphRun) => {
  const edges = run.campaign.edges;
  if (!edges) return;
  checkDuplicates(run, edges.map(edge => edge.id), "edges");
  const seen = new Set<string>();
  edges.forEach((edge, index) => {
    const path = `edges[${index}]`, key = `${edge.from} ${edge.exit} ${edge.to ?? ""}`;
    checkEdgeReferences(run, edge, path);
    if (seen.has(key))
      run.issues.push(campaignIssue("error", "campaignEdgeDuplicate", path, { exit: edge.exit, mapId: edge.from }));
    seen.add(key);
  });
};

/** Every exit of a listed map (the implicit `victory` included) must lead to a map or end the campaign. */
const checkExitCoverage = (run: GraphRun) => {
  const covered = new Set(run.graph.edges.map(edge => `${edge.from} ${edge.exit}`));
  run.graph.mapIds.forEach((mapId, index) => {
    for (const exit of run.graph.exits.get(mapId) ?? []) {
      if (!covered.has(`${mapId} ${exit}`))
        run.issues.push(campaignIssue("error", "campaignExitWithoutEdge", `mapIds[${index}]`, { exit, mapId }));
    }
  });
};

/**
 * One issue per edge that closes a loop (self loops included), found depth-first in map and edge order. A derived
 * linear graph loops only through a map listed twice, which the map list check reports already.
 */
const checkCycles = (run: GraphRun) => {
  if (!run.graph.explicit) return;
  const open = new Set<string>(), done = new Set<string>();
  const visit = (mapId: string) => {
    open.add(mapId);
    run.graph.edges.forEach((edge, index) => {
      if (edge.from !== mapId || edge.to === null || done.has(edge.to)) return;
      if (!open.has(edge.to)) { visit(edge.to); return; }
      run.issues.push(campaignIssue("error", "campaignCycle", `edges[${index}]`, { from: mapId, to: edge.to }));
    });
    open.delete(mapId);
    done.add(mapId);
  };
  for (const mapId of run.graph.mapIds) if (!done.has(mapId)) visit(mapId);
};

const checkReachability = (run: GraphRun) => {
  const { edges, explicit, mapIds, starts } = run.graph;
  const reachable = reachableMaps(run.graph, starts.filter(mapId => run.listed.has(mapId)));
  mapIds.forEach((mapId, index) => {
    if (!reachable.has(mapId))
      run.issues.push(campaignIssue("error", "campaignMapUnreachable", `mapIds[${index}]`, { mapId }));
  });
  if (mapIds.length && !edges.some(edge => edge.to === null && reachable.has(edge.from)))
    run.issues.push(campaignIssue("error", "campaignNoEnding", "edges"));
  if (!explicit) return;
  const targets = new Set(edges.map(edge => edge.to));
  starts.forEach((mapId, index) => {
    if (targets.has(mapId)) run.issues.push(campaignIssue("warning", "campaignStartHasIncoming",
      run.campaign.startMapIds ? `startMapIds[${index}]` : "startMapIds", { mapId }));
  });
};

/**
 * BR3: a branching campaign ignores `previousMapCompleted` (plan §11); the campaign editor removes it per map, so a
 * map that still carries it is a warning (a linear campaign still reads it).
 */
const checkUnusedPreviousLocks = (run: GraphRun, maps: ReadonlyMap<string, CampaignGraphMap>) => {
  if (!run.graph.explicit) return;
  run.graph.mapIds.forEach((mapId, index) => {
    const locked = maps.get(mapId)?.unlock.some(condition => condition.kind === "previousMapCompleted");
    if (locked)
      run.issues.push(campaignIssue("warning", "campaignPreviousMapLockUnused", `mapIds[${index}]`, { mapId }));
  });
};

export const validateCampaignGraph = (
  campaign: Pick<Campaign, "edges" | "mapIds" | "startMapIds" | "state">, maps: ReadonlyMap<string, CampaignGraphMap>
): CampaignIssue[] => {
  const run: GraphRun = {
    campaign, graph: campaignGraphOf(campaign, maps), issues: [], listed: new Set(campaign.mapIds)
  };
  checkStarts(run);
  checkEdges(run);
  checkExitCoverage(run);
  checkCycles(run);
  checkReachability(run);
  checkUnusedPreviousLocks(run, maps);
  return run.issues;
};
