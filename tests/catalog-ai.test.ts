import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  BUILD_PROGRAMS, buildProgramOf, DEFAULT_STYLE_STRATEGY, styleStrategyOf
} from "../src/catalog/ai/build-programs.ts";
import { CORE_DATA_FILES, validateBuildPrograms } from "../src/catalog/index.ts";
import { AI_STYLES } from "../src/script/constants.ts";

const dataUrl = (path: string) => new URL(`../src/catalog/data/${path}`, import.meta.url);
const readSidecar = (path: string): unknown => JSON.parse(readFileSync(dataUrl(path), "utf8"));
const rawBalanced = () => readSidecar("ai/balanced.json") as {
  goals: { building: string; group: string; id: string; nations?: string[]; requires?: object[]; target: object[] }[];
  style: string;
};
/** The balanced program without its cloth chain (flax farm and weaver). */
const withoutClothChain = () => {
  const raw = rawBalanced();
  raw.goals = raw.goals.filter(goal => goal.id !== "flaxFarm" && goal.id !== "weaver");
  return raw;
};
const issuesOf = (programs: Readonly<Record<string, unknown>>) =>
  validateBuildPrograms(CORE_DATA_FILES, readSidecar, programs).map(issue => `${issue.path}: ${issue.message}`);

test("the build programs are valid: every nation's goal buildings and chains exist", () => {
  assert.deepEqual(issuesOf(BUILD_PROGRAMS), []);
  assert.deepEqual(Object.keys(BUILD_PROGRAMS), ["aggressive", "balanced", "turtle"]);
  for (const style of AI_STYLES) assert.equal(buildProgramOf(style).style, style);
});

test("the balanced program covers wood, stone, food and residences", () => {
  const goals = BUILD_PROGRAMS.balanced!.goals.map(goal => goal.id);
  for (const id of ["woodcutter", "sawmill", "forester", "quarry", "smallResidence", "farm", "mill", "bakery", "well"])
    assert.ok(goals.includes(id), id);
});

test("refuses unknown buildings and groups, later requirements, bad curves and duplicate goals", () => {
  const broken = rawBalanced();
  broken.goals[0]!.building = "building:castle";
  broken.goals[1]!.group = "gold";
  broken.goals[2]!.requires = [{ count: 1, goal: "quarry" }];
  broken.goals[3]!.target = [{ buildings: 4, count: 1 }];
  broken.goals[4]!.id = "woodcutter";
  const messages = issuesOf({ balanced: broken });
  assert.ok(messages.some(text => text.includes("goals[0].building: Unknown building building:castle")),
    messages.join());
  assert.ok(messages.some(text => text.includes("goals[1].group: Unknown group gold")));
  assert.ok(messages.some(text => text.includes("goals[2].requires: quarry is no earlier goal")));
  assert.ok(messages.some(text => text.includes("goals[3].target: Steps with ascending")));
  assert.ok(messages.some(text => text.includes("goals[4].id: Duplicate goal woodcutter")));
});

test("refuses a program whose chain lacks a producer for some nation", () => {
  const withoutQuarry = rawBalanced();
  withoutQuarry.goals = withoutQuarry.goals.filter(goal => goal.id !== "quarry")
    .map(goal => ({ ...goal, requires: undefined }));
  const messages = issuesOf({ balanced: JSON.parse(JSON.stringify(withoutQuarry)) });
  assert.ok(messages.some(text => text.includes("No japanese goal produces stone")), messages.join());
  assert.ok(issuesOf({ balanced: withoutClothChain() })
    .some(text => text.includes("No indigenous goal produces cloth")));
});

test("every issue names its program, kind and subject for the report tools", () => {
  const withoutCloth = withoutClothChain();
  withoutCloth.goals[0]!.building = "building:castle";
  const issues = validateBuildPrograms(CORE_DATA_FILES, readSidecar, { balanced: withoutCloth });
  assert.ok(issues.every(issue => issue.style === "balanced"));
  const cloth = issues.find(issue => issue.kind === "missingProducer" && issue.ware === "cloth" &&
    issue.nation === "indigenous");
  assert.ok(cloth?.neededBy?.includes("sawmill") && cloth.neededBy.includes("smallResidence"), cloth?.neededBy?.join());
  const unknown = issues.filter(issue => issue.kind === "unknownBuilding");
  assert.deepEqual(unknown.map(issue => [issue.goal, issue.building]), [["woodcutter", "building:castle"]]);
  assert.equal(issues.filter(issue => issue.kind === "notPlaceable" && issue.goal === "woodcutter").length, 8);
});

test("a nation's own target curve: ascending from 0, and only for a nation that plays the goal", () => {
  const raw = rawBalanced() as ReturnType<typeof rawBalanced> & {
    goals: { nationTargets?: Record<string, object[]> }[];
  };
  const weaver = raw.goals.find(goal => goal.id === "weaver")!;
  assert.ok(weaver.nationTargets?.indigenous, "the Indigenous weaver from the start");
  weaver.nationTargets = { indigenous: [{ buildings: 3, count: 1 }], atlantis: [{ buildings: 0, count: 1 }] };
  const messages = issuesOf({ balanced: raw });
  assert.ok(messages.some(text => text.includes("nationTargets.indigenous: Steps with ascending")), messages.join());
  assert.ok(messages.some(text => text.includes("nationTargets.atlantis: atlantis does not play weaver")));
});

test("the military chain: every nation trains soldiers from its own wares and expands with a guardhouse", () => {
  const goals = BUILD_PROGRAMS.balanced!.goals.map(goal => goal.id);
  for (const id of ["charburner", "ironMine", "ironSmelter", "armory", "pigFarm", "skinner", "tannery",
    "leatherworks", "brewery", "militaryAcademy", "guardhouse"]) assert.ok(goals.includes(id), id);
  assert.ok(goals.indexOf("militaryAcademy") > goals.indexOf("armory"));
});

test("refuses an unknown field, a style mismatch and fractional weights", () => {
  const messages = issuesOf({ balanced: { ...rawBalanced(), extra: 1, threatPenalty: 1.5 } });
  assert.ok(messages.some(text => text.includes("ai/balanced.json.extra: Unknown field")), messages.join());
  assert.ok(messages.some(text => text.includes("threatPenalty")));
  assert.deepEqual(issuesOf({ balanced: { ...rawBalanced(), style: "turtle" } }),
    ["ai/balanced.json.style: The file of style balanced names another style"]);
});

test("refuses stock targets at or below the resume margin and targets of wares no goal produces", () => {
  const raw = rawBalanced() as ReturnType<typeof rawBalanced> & { stock: { resumeMargin: number; wares: object } };
  raw.stock.wares = { ...raw.stock.wares, gold: { fortify: 9, grow: 9 }, planks: { fortify: 5, grow: 40 } };
  assert.deepEqual(issuesOf({ balanced: raw }), [
    "ai/balanced.json.stock.wares.planks: Every target lies above the resume margin",
    "ai/balanced.json.stock.wares.gold: No goal produces gold"
  ]);
});

test("styles: turtle fortifies with more towers and later attacks, aggressive trains earlier and raids", () => {
  const goalOf = (style: string, id: string) => buildProgramOf(style).goals.find(goal => goal.id === id);
  const firstAt = (style: string, id: string) => goalOf(style, id)!.target.find(step => step.count > 0)!.buildings;
  assert.equal(styleStrategyOf("balanced"), DEFAULT_STYLE_STRATEGY);
  assert.equal(styleStrategyOf("turtle").calmPosture, "fortify");
  assert.equal(styleStrategyOf("turtle").raids, "never");
  assert.equal(styleStrategyOf("aggressive").raids, "always");
  assert.ok(styleStrategyOf("turtle").firstAttackPercent > 100);
  assert.ok(styleStrategyOf("aggressive").firstAttackPercent < 100);
  assert.ok(styleStrategyOf("aggressive").soldierReserve > DEFAULT_STYLE_STRATEGY.soldierReserve);
  assert.ok(goalOf("turtle", "watchtower") && !goalOf("balanced", "watchtower"));
  assert.ok(firstAt("turtle", "guardhouse") < firstAt("balanced", "guardhouse"));
  assert.ok(firstAt("aggressive", "militaryAcademy") < firstAt("balanced", "militaryAcademy"));
  assert.ok(firstAt("turtle", "militaryAcademy") > firstAt("balanced", "militaryAcademy"));
});

test("refuses a style strategy with an unknown posture, raid rule or a percentage out of range", () => {
  const strategy = { ...DEFAULT_STYLE_STRATEGY, calmPosture: "panic", firstAttackPercent: 5, raids: "sometimes" };
  const messages = issuesOf({ balanced: { ...rawBalanced(), strategy } });
  for (const field of ["calmPosture", "firstAttackPercent", "raids"])
    assert.ok(messages.some(text => text.includes(`strategy.${field}`)), `${field}: ${messages.join()}`);
});

const fixture = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(`fixtures/ai-resolved/${path}`, import.meta.url), "utf8"));

test("turtle and aggressive are overlays on balanced that resolve to their snapshot programs", () => {
  for (const style of ["aggressive", "turtle"]) {
    assert.equal((readSidecar(`ai/${style}.json`) as { extends?: string }).extends, "balanced");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(BUILD_PROGRAMS[style])), fixture(`${style}.json`), style);
  }
});

test("an overlay is validated as the program it resolves to, and its unknown keys and ids are reported", () => {
  const files = { balanced: rawBalanced(), turtle: readSidecar("ai/turtle.json") };
  assert.deepEqual(issuesOf(files), []);
  const overlay = readSidecar("ai/turtle.json") as Record<string, unknown>;
  const messages = issuesOf({ ...files, turtle: { ...overlay, colour: "red" } });
  assert.ok(messages.some(line => line.includes("turtle.json.colour: Unknown field")), messages.join());
  const broken = { ...overlay, goals: { castle: { weight: 2 } }, groups: { gold: { style: 100 } },
    removeGoals: ["moat"] };
  const ids = issuesOf({ ...files, turtle: broken });
  for (const id of ["castle", "gold", "moat"])
    assert.ok(ids.some(line => line.includes(`${id} is no goal or group of the base program`)), ids.join());
  const order = issuesOf({ ...files, turtle: { ...overlay, goalOrder: ["woodcutter"] } });
  assert.ok(order.some(line => line.includes("goalOrder: Every resulting goal id exactly once")), order.join());
  const chain = issuesOf({ ...files, turtle: { ...overlay, removeGoals: ["quarry"] } });
  assert.ok(chain.some(line => line.includes("No japanese goal produces stone")), chain.join());
});
