import assert from "node:assert/strict";
import test from "node:test";

import { CAMPAIGN_DEFAULT_EXIT } from "../src/campaign/campaign-constants.ts";
import { validateCampaignGraph } from "../src/campaign/campaign-graph-validation.ts";
import { type CampaignIssue, type CampaignIssueCode, formatCampaignIssue } from "../src/campaign/campaign-issues.ts";
import type { Campaign, CampaignEdge, CampaignMap } from "../src/campaign/campaign-model.ts";
import { validateCampaignMapReady, validateCampaignReady } from "../src/campaign/campaign-ready-validation.ts";
import { readyCampaign, readyContext, readyMap } from "./campaign-fixtures.ts";

const exit = (id: string) => ({ id, name: { en: `Exit ${id}`, hu: `Kijárat ${id}` } });
const edge = (id: number, from: string, to: string | null, through = CAMPAIGN_DEFAULT_EXIT): CampaignEdge =>
  ({ exit: through, from, id: `edge-${id}`, to });

/** a ─victory→ b, c · a ─exit-1→ d · b, c → e · d, e → end (the fixture of campaign-graph.test.ts). */
const MAPS: readonly CampaignMap[] = [
  readyMap({ exits: [exit("exit-1")], id: "a", nextExitNumber: 2, unlock: [] }),
  ...["b", "c", "d", "e"].map(id => readyMap({ id, unlock: [] }))
];
const EDGES = [edge(1, "a", "b"), edge(2, "a", "c"), edge(3, "a", "d", "exit-1"), edge(4, "b", "e"),
  edge(5, "c", "e"), edge(6, "d", null), edge(7, "e", null)];
const branching = (overrides: Partial<Campaign> = {}): Campaign => readyCampaign({
  edges: EDGES, mapIds: ["a", "e", "d", "c", "b"], mapNodes: [], nextEdgeNumber: 8, startMapIds: ["a"], ...overrides
});

const issuesOf = (campaign: Campaign, maps: readonly CampaignMap[] = MAPS) =>
  validateCampaignGraph(campaign, new Map(maps.map(map => [map.id, map])));
const summary = (issues: readonly CampaignIssue[]) => issues.map(issue => `${issue.code}@${issue.path}`);
const only = (issues: readonly CampaignIssue[], code: CampaignIssueCode) =>
  summary(issues.filter(issue => issue.code === code));

test("a valid branching graph and a linear campaign without edges have no graph issue", () => {
  assert.deepEqual(issuesOf(branching()), []);
  const linear = [readyMap({ id: "m1" }), readyMap({ id: "m2" }), readyMap({ id: "m3", unlock: [] })];
  assert.deepEqual(issuesOf(readyCampaign({ mapIds: ["m1", "m2", "m3"] }), linear), []);
  assert.deepEqual(issuesOf(readyCampaign({ mapIds: [] }), []), []);
});

test("campaignNoStartMap: a stored empty start list", () => {
  const issues = issuesOf(branching({ startMapIds: [] }));
  assert.deepEqual(only(issues, "campaignNoStartMap"), ["campaignNoStartMap@startMapIds"]);
  assert.equal(only(issues, "campaignMapUnreachable").length, 5);
  assert.deepEqual(only(issues, "campaignNoEnding"), ["campaignNoEnding@edges"]);
});

test("campaignEdgeUnknownMap: start maps and edge ends outside the map list", () => {
  const issues = issuesOf(branching({
    edges: [...EDGES, edge(8, "zz", "b"), edge(9, "b", "yy")], startMapIds: ["a", "zz", "a"]
  }));
  assert.deepEqual(only(issues, "campaignEdgeUnknownMap"), ["campaignEdgeUnknownMap@startMapIds[1]",
    "campaignEdgeUnknownMap@edges[7].from", "campaignEdgeUnknownMap@edges[8].to"]);
  assert.deepEqual(only(issues, "duplicateId"), ["duplicateId@startMapIds"]);
});

test("campaignEdgeUnknownExit: an edge from an exit its map does not declare", () => {
  const issues = issuesOf(branching({ edges: [...EDGES, edge(8, "b", "e", "exit-1")] }));
  assert.deepEqual(summary(issues), ["campaignEdgeUnknownExit@edges[7].exit"]);
  assert.deepEqual(issues[0]!.params, { exit: "exit-1", mapId: "b" });
});

test("campaignEdgeDuplicate: the same from, exit and target twice; edge ids are unique", () => {
  const issues = issuesOf(branching({ edges: [...EDGES, edge(8, "a", "b"), edge(8, "d", null)] }));
  assert.deepEqual(summary(issues),
    ["duplicateId@edges", "campaignEdgeDuplicate@edges[7]", "campaignEdgeDuplicate@edges[8]"]);
});

test("campaignExitWithoutEdge: every exit, the implicit victory included, needs an edge", () => {
  const withoutNamed = issuesOf(branching({ edges: EDGES.filter(entry => entry.id !== "edge-3") }));
  assert.deepEqual(only(withoutNamed, "campaignExitWithoutEdge"), ["campaignExitWithoutEdge@mapIds[0]"]);
  assert.deepEqual(withoutNamed[0]!.params, { exit: "exit-1", mapId: "a" });
  const withoutVictory = issuesOf(branching({ edges: EDGES.filter(entry => entry.id !== "edge-7") }));
  assert.deepEqual(summary(withoutVictory), ["campaignExitWithoutEdge@mapIds[1]"]);
  // A linear campaign whose map declares a named exit: the derived graph has no edge for it.
  const linear = issuesOf(readyCampaign({ mapIds: ["a"] }), MAPS);
  assert.deepEqual(summary(linear), ["campaignExitWithoutEdge@mapIds[0]"]);
});

test("campaignCycle: loops and self loops, reported on the closing edge", () => {
  const loop = issuesOf(branching({ edges: [...EDGES, edge(8, "e", "b")] }));
  assert.deepEqual(summary(loop), ["campaignCycle@edges[7]"]);
  assert.deepEqual(loop[0]!.params, { from: "e", to: "b" });
  const selfLoop = issuesOf(branching({ edges: [...EDGES, edge(8, "c", "c")] }));
  assert.deepEqual(summary(selfLoop), ["campaignCycle@edges[7]"]);
  // A join (two paths into `e`) is not a cycle.
  assert.deepEqual(only(issuesOf(branching()), "campaignCycle"), []);
});

test("campaignMapUnreachable: maps no start map leads to", () => {
  const issues = issuesOf(branching({ startMapIds: ["b"] }));
  assert.deepEqual(summary(issues), ["campaignMapUnreachable@mapIds[0]", "campaignMapUnreachable@mapIds[2]",
    "campaignMapUnreachable@mapIds[3]", "campaignStartHasIncoming@startMapIds[0]"]);
});

test("campaignNoEnding: no reachable edge ends the campaign", () => {
  const issues = issuesOf(branching({ edges: EDGES.filter(entry => entry.to !== null) }));
  assert.deepEqual(only(issues, "campaignNoEnding"), ["campaignNoEnding@edges"]);
  // The ending exists but hangs on an unreachable map.
  const unreachableEnd = issuesOf(branching({ edges: [edge(1, "a", "b"), edge(2, "b", "a"), edge(3, "c", null)] }));
  assert.deepEqual(only(unreachableEnd, "campaignNoEnding"), ["campaignNoEnding@edges"]);
});

test("campaignPreviousMapLockUnused: a warning per locked map, only for stored graphs", () => {
  const lock = [{ kind: "previousMapCompleted" as const }];
  const locked = MAPS.map(map => (map.id === "c" ? { ...map, unlock: lock } : map));
  const issues = issuesOf(branching(), locked);
  assert.deepEqual(summary(issues), ["campaignPreviousMapLockUnused@mapIds[3]"]);
  assert.equal(issues[0]!.severity, "warning");
  assert.deepEqual(issuesOf(readyCampaign({ mapIds: ["m1", "m2"] }), [readyMap({ id: "m1" }), readyMap({ id: "m2" })]),
    []);
});

test("campaignStartHasIncoming: a warning, only for stored graphs", () => {
  const issues = issuesOf(branching({ startMapIds: ["a", "b"] }));
  assert.deepEqual(summary(issues), ["campaignStartHasIncoming@startMapIds[1]"]);
  assert.equal(issues[0]!.severity, "warning");
  // Derived: `m2` is a start map (no lock) and the linear target of `m1`; that is today's data, not a mistake.
  const linear = [readyMap({ id: "m1" }), readyMap({ id: "m2", unlock: [] })];
  assert.deepEqual(issuesOf(readyCampaign({ mapIds: ["m1", "m2"] }), linear), []);
});

test("validateCampaignReady reports graph issues; warnings never block Ready", () => {
  const context = { imageIds: new Set(["image-1"]) };
  const nodes = ["a", "b", "c", "d", "e"].map(mapId => ({ mapId, u: 0.5, v: 0.5 }));
  assert.deepEqual(validateCampaignReady(branching({ mapNodes: nodes }), MAPS, context),
    { errors: [], ready: true, warnings: [] });
  const warned = validateCampaignReady(branching({ mapNodes: nodes, startMapIds: ["a", "b"] }), MAPS, context);
  assert.equal(warned.ready, true);
  assert.deepEqual(summary(warned.warnings), ["campaignStartHasIncoming@startMapIds[1]"]);
  const broken = validateCampaignReady(branching({ edges: [...EDGES, edge(8, "e", "b")], mapNodes: nodes }), MAPS,
    context);
  assert.equal(broken.ready, false);
  assert.equal(formatCampaignIssue(broken.errors[0]!, "en"),
    "The path from map e to map b closes a loop; a campaign path can never lead back.");
});

test("map Ready: exits need unique ids, translated names and existing epilogue sequences", () => {
  assert.deepEqual(validateCampaignMapReady(readyMap({ exits: [exit("exit-1")] }), readyContext()),
    { errors: [], ready: true, warnings: [] });
  const map = readyMap({ exits: [
    exit("exit-1"), { id: "exit-1", name: { en: " " }, victorySequenceId: "epilogue" }
  ] });
  const result = validateCampaignMapReady(map, readyContext());
  assert.deepEqual(summary(result.errors), ["duplicateId@exits", "missingFallbackText@exits[1].name",
    "missingSequenceReference@exits[1].victorySequenceId"]);
  assert.deepEqual(summary(result.warnings), ["missingTranslation@exits[1].name"]);
});
