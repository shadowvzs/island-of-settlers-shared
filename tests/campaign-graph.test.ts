import assert from "node:assert/strict";
import test from "node:test";

import { CAMPAIGN_DEFAULT_EXIT } from "../src/campaign/campaign-constants.ts";
import {
  campaignCompleted, campaignGraphOf, campaignGraphOrder, campaignMapStatuses, campaignNodeView, type CampaignProgress,
  exitsOf, recordedExitOf, takenEdges
} from "../src/campaign/campaign-graph.ts";
import type { Campaign, CampaignEdge, CampaignMap } from "../src/campaign/campaign-model.ts";
import { checkCampaignMapShape, checkCampaignShape } from "../src/campaign/campaign-shape.ts";
import type { CampaignMapStatus } from "../src/script/engine/home-rewards.ts";
import { readyCampaign, readyMap } from "./campaign-fixtures.ts";

const exit = (id: string) => ({ id, name: { en: `Exit ${id}`, hu: `Kijárat ${id}` } });
const edge = (id: number, from: string, to: string | null, through = CAMPAIGN_DEFAULT_EXIT): CampaignEdge =>
  ({ exit: through, from, id: `edge-${id}`, to });
const mapsById = (maps: readonly CampaignMap[]) => new Map(maps.map(map => [map.id, map]));
const progressOf = (entries: Readonly<Record<string, string>>): CampaignProgress =>
  new Map(Object.entries(entries).map(([mapId, through]) => [mapId, { exit: through }]));

/**
 * A branching campaign: `a` forks by exit (victory → b and c, exit-1 → d); b and c join in `e`; d and e end it.
 *
 *   a ─victory→ b ─→ e ─→ end
 *   a ─victory→ c ─→ e
 *   a ─exit-1─→ d ─→ end
 */
const MAPS = mapsById([
  readyMap({ exits: [exit("exit-1")], id: "a", nextExitNumber: 2 }),
  ...["b", "c", "d", "e"].map(id => readyMap({ id }))
]);
const BRANCHING: Campaign = readyCampaign({
  edges: [edge(1, "a", "b"), edge(2, "a", "c"), edge(3, "a", "d", "exit-1"), edge(4, "b", "e"), edge(5, "c", "e"),
    edge(6, "d", null), edge(7, "e", null)],
  mapIds: ["a", "e", "d", "c", "b"],
  nextEdgeNumber: 8,
  startMapIds: ["a"]
});
const GRAPH = campaignGraphOf(BRANCHING, MAPS);
const statuses = (progress: CampaignProgress) => Object.fromEntries(campaignMapStatuses(GRAPH, MAPS, progress));

test("shape: the graph fields are optional, numbered and bounded", () => {
  assert.deepEqual(checkCampaignShape(readyCampaign()), []);
  assert.deepEqual(checkCampaignShape(BRANCHING), []);
  assert.deepEqual(checkCampaignMapShape(MAPS.get("a")), []);
  const paths = (issues: { path: string }[]) => issues.map(issue => issue.path);
  assert.deepEqual(paths(checkCampaignShape({ ...BRANCHING, edges: [{ ...edge(1, "a", "b"), id: "first" }] })),
    ["campaign.edges[0].id"]);
  assert.deepEqual(paths(checkCampaignShape({ ...BRANCHING, edges: [edge(1, "a", "b", "retreat")] })),
    ["campaign.edges[0].exit"]);
  assert.deepEqual(paths(checkCampaignShape({ ...BRANCHING, edges: [{ ...edge(1, "a", "b"), when: [] }] })),
    ["campaign.edges[0].when"]);
  assert.deepEqual(paths(checkCampaignShape({ ...BRANCHING, nextEdgeNumber: 0 })), ["campaign.nextEdgeNumber"]);
  assert.deepEqual(paths(checkCampaignMapShape(readyMap({ exits: [exit(CAMPAIGN_DEFAULT_EXIT)] }))),
    ["map.exits[0].id"]);
  const nine = Array.from({ length: 9 }, (_, index) => exit(`exit-${index + 1}`));
  assert.deepEqual(paths(checkCampaignMapShape(readyMap({ exits: nine }))), ["map.exits"]);
});

test("exits: the implicit victory comes first, then the named exits", () => {
  assert.deepEqual(exitsOf(readyMap()), ["victory"]);
  assert.deepEqual(exitsOf(MAPS.get("a")!), ["victory", "exit-1"]);
});

test("derivation: a campaign without edges is the linear graph of its map order", () => {
  const maps = mapsById([readyMap({ id: "m1" }), readyMap({ id: "m2" }), readyMap({ id: "m3", unlock: [] })]);
  const graph = campaignGraphOf(readyCampaign({ mapIds: ["m1", "m2", "m3"] }), maps);
  assert.equal(graph.explicit, false);
  assert.deepEqual(graph.starts, ["m1", "m3"]);
  assert.deepEqual(graph.edges.map(({ exit: through, from, to }) => [from, through, to]),
    [["m1", "victory", "m2"], ["m2", "victory", "m3"], ["m3", "victory", null]]);
  assert.deepEqual(campaignGraphOf(readyCampaign({ mapIds: [] }), new Map()).edges, []);
});

test("derivation: stored edges ignore previousMapCompleted; missing start maps default to the first map", () => {
  const stored = campaignGraphOf({ ...BRANCHING, startMapIds: undefined }, MAPS);
  assert.equal(stored.explicit, true);
  assert.deepEqual(stored.starts, ["a"]);
  assert.equal(stored.edges, BRANCHING.edges);
});

/** The rule before BR0 (`campaignMapStatusOf` on master `57b56f969`, removed in BR1), the contract's reference. */
const linearStatusBeforeBr0 = (
  campaign: Pick<Campaign, "mapIds" | "state">, map: Pick<CampaignMap, "id" | "state" | "unlock">,
  completed: ReadonlySet<string>
): CampaignMapStatus => {
  if (completed.has(map.id)) return "completed";
  const index = campaign.mapIds.indexOf(map.id);
  if (campaign.state !== "ready" || map.state !== "ready" || index < 0) return "notAvailable";
  const needsPrevious = map.unlock.some(condition => condition.kind === "previousMapCompleted");
  if (!needsPrevious || index === 0) return "available";
  return completed.has(campaign.mapIds[index - 1]!) ? "available" : "notAvailable";
};

const subsetOf = <Item>(items: readonly Item[], mask: number) => items.filter((_, index) => (mask >> index) & 1);

test("contract: linear campaigns keep the statuses of the old index rule for every progress set", () => {
  let compared = 0;
  for (let count = 1; count <= 6; count++) {
    const mapIds = Array.from({ length: count }, (_, index) => `m${index + 1}`);
    for (let unlockMask = 0; unlockMask < 1 << count; unlockMask++) {
      const drafts = unlockMask % 5 === 3 ? 1 : 0;
      const maps = mapIds.map((id, index) => readyMap({
        id,
        state: index < drafts ? "draft" : "ready",
        unlock: (unlockMask >> index) & 1 ? [{ kind: "previousMapCompleted" }, { kind: "playerLevel", level: 2 }] : []
      }));
      const campaign = readyCampaign({ mapIds, state: unlockMask % 7 === 6 ? "draft" : "ready" });
      const byId = mapsById(maps), graph = campaignGraphOf(campaign, byId);
      for (let doneMask = 0; doneMask < 1 << count; doneMask++) {
        const completed = new Set(subsetOf(mapIds, doneMask));
        const progress = new Map([...completed].map(mapId => [mapId, { exit: CAMPAIGN_DEFAULT_EXIT }]));
        const fromGraph = campaignMapStatuses(graph, byId, progress);
        for (const map of maps) {
          const expected = linearStatusBeforeBr0(campaign, map, completed);
          assert.equal(fromGraph.get(map.id), expected, `${count} maps, unlock ${unlockMask}, done ${doneMask}`);
          compared++;
        }
      }
    }
  }
  assert.equal(compared, [1, 2, 3, 4, 5, 6].reduce((sum, count) => sum + count * 4 ** count, 0));
});

test("statuses: start maps are open; an exit opens only the targets of its own edges", () => {
  assert.deepEqual(statuses(new Map()),
    { a: "available", b: "notAvailable", c: "notAvailable", d: "notAvailable", e: "notAvailable" });
  assert.deepEqual(statuses(progressOf({ a: "victory" })),
    { a: "completed", b: "available", c: "available", d: "notAvailable", e: "notAvailable" });
  assert.deepEqual(statuses(progressOf({ a: "exit-1" })),
    { a: "completed", b: "notAvailable", c: "notAvailable", d: "available", e: "notAvailable" });
  // An OR join: one of the two incoming edges is enough.
  assert.equal(statuses(progressOf({ a: "victory", c: "victory" })).e, "available");
});

test("statuses: drafts are locked, completed maps stay completed", () => {
  const draftCampaign = campaignGraphOf({ ...BRANCHING, state: "draft" }, MAPS);
  assert.deepEqual([...campaignMapStatuses(draftCampaign, MAPS, progressOf({ a: "victory" })).values()],
    ["completed", "notAvailable", "notAvailable", "notAvailable", "notAvailable"]);
  const withDraft = new Map(MAPS).set("b", readyMap({ id: "b", state: "draft" }));
  const result = campaignMapStatuses(GRAPH, withDraft, progressOf({ a: "victory" }));
  assert.deepEqual([result.get("b"), result.get("c")], ["notAvailable", "available"]);
});

test("unknown and deleted exits read as victory", () => {
  const progress = progressOf({ a: "exit-9", b: "exit-1" });
  assert.equal(recordedExitOf(GRAPH, "a", progress), "victory");
  assert.equal(recordedExitOf(GRAPH, "b", progress), "victory");
  assert.equal(recordedExitOf(GRAPH, "c", progress), null);
  assert.equal(recordedExitOf(GRAPH, "a", progressOf({ a: "exit-1" })), "exit-1");
  assert.deepEqual(takenEdges(GRAPH, progress).map(taken => taken.id), ["edge-1", "edge-2", "edge-4"]);
  assert.deepEqual(statuses(progress),
    { a: "completed", b: "completed", c: "available", d: "notAvailable", e: "available" });
  // The exit was deleted from the map record after the account used it.
  const withoutExit = new Map(MAPS).set("a", readyMap({ id: "a" }));
  const graph = campaignGraphOf(BRANCHING, withoutExit);
  assert.deepEqual(takenEdges(graph, progressOf({ a: "exit-1" })).map(taken => taken.id), ["edge-1", "edge-2"]);
});

test("campaign end: completed once a taken edge leads to the end", () => {
  assert.equal(campaignCompleted(GRAPH, new Map()), false);
  assert.equal(campaignCompleted(GRAPH, progressOf({ a: "victory", b: "victory" })), false);
  assert.equal(campaignCompleted(GRAPH, progressOf({ a: "victory", b: "victory", e: "victory" })), true);
  assert.equal(campaignCompleted(GRAPH, progressOf({ a: "exit-1", d: "victory" })), true);
});

test("graph order: topological with the map order as tie-break; cycles keep the map order", () => {
  assert.deepEqual(campaignGraphOrder(GRAPH), ["a", "d", "c", "b", "e"]);
  const cyclic = campaignGraphOf({ ...BRANCHING, edges: [...BRANCHING.edges!, edge(8, "e", "b")] }, MAPS);
  assert.deepEqual(campaignGraphOrder(cyclic), ["a", "d", "c", "e", "b"]);
});

const view = (progress: CampaignProgress) => {
  const { completed, edges, nodes } = campaignNodeView(GRAPH, MAPS, progress);
  return {
    completed,
    edges: Object.fromEntries(edges.map(entry => [entry.edge.id, entry.state])),
    nodes: Object.fromEntries(nodes.map(node => [node.mapId, node.state]))
  };
};

test("node view: before the first victory nothing is closed", () => {
  const start = view(new Map());
  assert.deepEqual(start.nodes,
    { a: "available", b: "notAvailable", c: "notAvailable", d: "notAvailable", e: "notAvailable" });
  assert.deepEqual(new Set(Object.values(start.edges)), new Set(["open"]));
  assert.deepEqual(campaignNodeView(GRAPH, MAPS, new Map()).nodes.map(node => node.mapId), campaignGraphOrder(GRAPH));
});

test("node view: the exit not taken closes its branch, downstream edges included", () => {
  const spared = view(progressOf({ a: "victory" }));
  assert.deepEqual(spared.nodes, { a: "completed", b: "available", c: "available", d: "closed", e: "notAvailable" });
  assert.deepEqual(spared.edges, { "edge-1": "taken", "edge-2": "taken", "edge-3": "closed", "edge-4": "open",
    "edge-5": "open", "edge-6": "closed", "edge-7": "open" });
  const other = view(progressOf({ a: "exit-1", d: "victory" }));
  assert.deepEqual(other.nodes, { a: "completed", b: "closed", c: "closed", d: "completed", e: "closed" });
  assert.deepEqual(other.edges, { "edge-1": "closed", "edge-2": "closed", "edge-3": "taken", "edge-4": "closed",
    "edge-5": "closed", "edge-6": "taken", "edge-7": "closed" });
  assert.equal(other.completed, true);
});

test("node view: a completed node shows its recorded exit", () => {
  const nodes = campaignNodeView(GRAPH, MAPS, progressOf({ a: "exit-1" })).nodes;
  assert.deepEqual(nodes.map(node => node.exit), ["exit-1", null, null, null, null]);
});
