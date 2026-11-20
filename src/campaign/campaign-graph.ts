import type { CampaignMapStatus } from "../script/engine/home-rewards.ts";
import { CAMPAIGN_DEFAULT_EXIT, CAMPAIGN_EXIT_PATTERN } from "./campaign-constants.ts";
import type { Campaign, CampaignEdge, CampaignMap } from "./campaign-model.ts";

/**
 * The campaign graph (BR0, campaign-branching-plan-2026-11-11 §4, §5, §11): maps are nodes, an edge leads from one
 * map's victory exit to the next map or to the campaign end. One pure implementation for the API, the client and
 * the editor, so availability never differs between them. No I/O, no clock; results are ordered and deterministic.
 */

/** What the account's progress row of a completed map proves: the exit of its first victory. */
export interface CampaignProgressEntry {
  exit: string;
}
/** Completed maps by id. A row without a stored exit (before BR1) is `{ exit: CAMPAIGN_DEFAULT_EXIT }`. */
export type CampaignProgress = ReadonlyMap<string, CampaignProgressEntry>;

export type CampaignGraphSource = Pick<Campaign, "edges" | "mapIds" | "startMapIds" | "state">;
export type CampaignGraphMap = Pick<CampaignMap, "exits" | "unlock">;

export interface CampaignGraph {
  edges: readonly CampaignEdge[];
  /** The exits every listed map with a record declares, the implicit `victory` first. */
  exits: ReadonlyMap<string, readonly string[]>;
  /** False when the edges were derived from the linear `mapIds` order. */
  explicit: boolean;
  /** The nodes, in the campaign's editor order. */
  mapIds: readonly string[];
  /** The campaign is Ready; maps of a draft campaign are never available. */
  ready: boolean;
  starts: readonly string[];
}

/** A well-formed exit of an outcome record or an end report (whether the map declares it is the server's call). */
export const isCampaignExitId = (value: unknown): value is string =>
  typeof value === "string" && CAMPAIGN_EXIT_PATTERN.test(value);

/** The exits a map can be won through: the implicit `victory`, then its named exits. */
export const exitsOf = (map: Pick<CampaignMap, "exits">): string[] =>
  [CAMPAIGN_DEFAULT_EXIT, ...(map.exits ?? []).map(exit => exit.id)];

/** Today's linear campaign as edges: every map's victory leads to the next one, the last one ends the campaign. */
const linearEdges = (mapIds: readonly string[]): CampaignEdge[] => mapIds.map((from, index) =>
  ({ exit: CAMPAIGN_DEFAULT_EXIT, from, id: `linear-${index + 1}`, to: mapIds[index + 1] ?? null }));

const needsPreviousMap = (map: CampaignGraphMap | undefined) =>
  map === undefined || map.unlock.some(condition => condition.kind === "previousMapCompleted");

/** Start maps of a campaign that stores none: the first map; a linear campaign adds the maps without a lock. */
const derivedStarts = (campaign: CampaignGraphSource, maps: ReadonlyMap<string, CampaignGraphMap>) => {
  if (campaign.edges) return campaign.mapIds.slice(0, 1);
  return campaign.mapIds.filter((mapId, index) => index === 0 || !needsPreviousMap(maps.get(mapId)));
};

/**
 * The campaign's graph: its stored `edges` and `startMapIds`, or (plan §11) the linear graph that `mapIds` and the
 * maps' `previousMapCompleted` conditions describe. A campaign with stored edges ignores `previousMapCompleted`.
 */
export const campaignGraphOf = (
  campaign: CampaignGraphSource, maps: ReadonlyMap<string, CampaignGraphMap>
): CampaignGraph => {
  const exits = new Map<string, readonly string[]>();
  for (const mapId of campaign.mapIds) {
    const map = maps.get(mapId);
    if (map) exits.set(mapId, exitsOf(map));
  }
  return {
    edges: campaign.edges ?? linearEdges(campaign.mapIds),
    exits,
    explicit: campaign.edges !== undefined,
    mapIds: campaign.mapIds,
    ready: campaign.state === "ready",
    starts: campaign.startMapIds ?? derivedStarts(campaign, maps)
  };
};

/**
 * The exit that counts for a completed map, or null while it is not completed. A stored exit the map does not
 * (or no longer) declare reads as `victory` (plan §5.5), so a deleted exit never strands an account.
 */
export const recordedExitOf = (graph: CampaignGraph, mapId: string, progress: CampaignProgress) => {
  const entry = progress.get(mapId);
  if (!entry) return null;
  return graph.exits.get(mapId)?.includes(entry.exit) ? entry.exit : CAMPAIGN_DEFAULT_EXIT;
};

/** The edges whose `from` map was first won through their exit, in graph order. */
export const takenEdges = (graph: CampaignGraph, progress: CampaignProgress): CampaignEdge[] => {
  if (!progress.size) return [];
  return graph.edges.filter(edge => recordedExitOf(graph, edge.from, progress) === edge.exit);
};

/** True once a taken edge ends the campaign. */
export const campaignCompleted = (graph: CampaignGraph, progress: CampaignProgress) =>
  takenEdges(graph, progress).some(edge => edge.to === null);

/**
 * The account's status of every listed map (plan §5.1): completed once won; else available when the campaign and
 * the map are Ready and the map is a start map or the target of a taken edge; else not available. Level, home goods
 * and home buildings stay launch-gate conditions of the client (C5).
 */
export const campaignMapStatuses = (
  graph: CampaignGraph, maps: ReadonlyMap<string, Pick<CampaignMap, "state">>, progress: CampaignProgress
): Map<string, CampaignMapStatus> => {
  const unlocked = new Set<string | null>(graph.starts);
  for (const edge of takenEdges(graph, progress)) unlocked.add(edge.to);
  const statusOf = (mapId: string): CampaignMapStatus => {
    if (progress.has(mapId)) return "completed";
    if (!graph.ready || maps.get(mapId)?.state !== "ready") return "notAvailable";
    return unlocked.has(mapId) ? "available" : "notAvailable";
  };
  return new Map(graph.mapIds.map(mapId => [mapId, statusOf(mapId)]));
};

/** The maps reached from `seeds` over the edges `follows` accepts (the seeds included). */
export const reachableMaps = (
  graph: CampaignGraph, seeds: Iterable<string>, follows: (edge: CampaignEdge) => boolean = () => true
) => {
  const outgoing = new Map<string, CampaignEdge[]>();
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.from);
    if (list) list.push(edge);
    else outgoing.set(edge.from, [edge]);
  }
  const reached = new Set(seeds), queue = [...reached];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    for (const edge of outgoing.get(next) ?? []) {
      if (edge.to === null || reached.has(edge.to) || !follows(edge)) continue;
      reached.add(edge.to);
      queue.push(edge.to);
    }
  }
  return reached;
};

const firstFree = (pending: ReadonlySet<string>, incoming: ReadonlyMap<string, number>) => {
  for (const mapId of pending) if (!incoming.get(mapId)) return mapId;
  return undefined;
};

/**
 * The listed maps in graph order: a topological order with the `mapIds` order as tie-break (player list, editor
 * numbering). Maps on a cycle (only possible before Ready validation) follow in `mapIds` order.
 */
export const campaignGraphOrder = (graph: CampaignGraph): string[] => {
  const pending = new Set(graph.mapIds), incoming = new Map<string, number>();
  for (const { from, to } of graph.edges)
    if (to !== null && pending.has(from) && pending.has(to)) incoming.set(to, (incoming.get(to) ?? 0) + 1);
  const order: string[] = [];
  const release = (mapId: string) => {
    pending.delete(mapId);
    order.push(mapId);
    for (const { from, to } of graph.edges)
      if (from === mapId && to !== null && pending.has(to)) incoming.set(to, incoming.get(to)! - 1);
  };
  for (let free = firstFree(pending, incoming); free !== undefined; free = firstFree(pending, incoming)) release(free);
  return [...order, ...pending];
};

/** `closed`: the map (or edge) lies on a branch the account's recorded exits can no longer open. */
export type CampaignNodeState = CampaignMapStatus | "closed";
export type CampaignEdgeState = "closed" | "open" | "taken";

export interface CampaignNodeView {
  /** The recorded exit of a completed map (shown as "Won: <exit name>"); null otherwise. */
  exit: string | null;
  mapId: string;
  state: CampaignNodeState;
}
export interface CampaignEdgeView {
  edge: CampaignEdge;
  state: CampaignEdgeState;
}
export interface CampaignGraphView {
  completed: boolean;
  edges: CampaignEdgeView[];
  /** In graph order (`campaignGraphOrder`). */
  nodes: CampaignNodeView[];
}

/**
 * Display state of every node and edge (player window, editor; plan §8). `closed` exists only here: the
 * script-facing `CampaignMapStatus` keeps its three values. Whether a not-yet-reached or closed map shows its name
 * is the window's choice (owner Q3: names stay visible, dimmed).
 */
export const campaignNodeView = (
  graph: CampaignGraph, maps: ReadonlyMap<string, Pick<CampaignMap, "state">>, progress: CampaignProgress
): CampaignGraphView => {
  const statuses = campaignMapStatuses(graph, maps, progress);
  const isLive = (edge: CampaignEdge) => {
    const exit = recordedExitOf(graph, edge.from, progress);
    return exit === null || exit === edge.exit;
  };
  const possible = reachableMaps(graph, [...graph.starts, ...progress.keys()], isLive);
  const nodeState = (mapId: string): CampaignNodeState => {
    const status = statuses.get(mapId) ?? "notAvailable";
    if (status !== "notAvailable" || possible.has(mapId)) return status;
    return "closed";
  };
  const edgeState = (edge: CampaignEdge): CampaignEdgeState => {
    if (!possible.has(edge.from) || !isLive(edge)) return "closed";
    return progress.has(edge.from) ? "taken" : "open";
  };
  return {
    completed: campaignCompleted(graph, progress),
    edges: graph.edges.map(edge => ({ edge, state: edgeState(edge) })),
    nodes: campaignGraphOrder(graph).map(mapId =>
      ({ exit: recordedExitOf(graph, mapId, progress), mapId, state: nodeState(mapId) }))
  };
};
