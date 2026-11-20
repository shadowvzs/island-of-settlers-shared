import assert from "node:assert/strict";
import test from "node:test";

import { LEVEL_THRESHOLDS } from "../src/catalog/balance/levels.ts";
import { DAY_MS } from "../src/time/constants.ts";
import {
  campaignHomeReward, campaignRewardEntries, nextHomeRewardOccurrence, replayAmount
} from "../src/script/engine/home-rewards.ts";
import { decideQuestClaim, questClaimExperience } from "../src/script/engine/quest-claims.ts";
import { initialQuestState } from "../src/script/engine/quest-state.ts";
import {
  eligibleQuestIds, NO_QUEST_FACTS, objectiveProgress, type QuestFacts
} from "../src/script/engine/quests.ts";
import type { QuestBook, QuestGroup, QuestRewards } from "../src/script/types/index.ts";
import type { DeclaredHomeReward } from "../src/script/types/script.ts";
import { createEngine, createFakeWorld, increase, runTicks, START_UTC, value } from "./script-engine-fixtures.ts";
import { emptyScript, numberVariable, quest, ref } from "./script-fixtures.ts";

const content = (id: string) => ref("content", id);

const facts = (fields: Partial<QuestFacts> & { counters?: Record<string, number> } = {}): QuestFacts => ({
  ...NO_QUEST_FACTS,
  counter: key => fields.counters?.[key] ?? 0,
  questWare: ware => (ware === "wine" ? "beer" : ware),
  ...fields
});

const group = (id: string, level: number, requiresGroups: string[] = [], extra: Partial<QuestGroup> = {}) =>
  ({ activation: "sequential", completionTopUp: "nextLevel", id, requiresGroups, title: { en: id },
    unlock: { kind: "playerLevel", level }, ...extra }) as QuestGroup;

const rewards = (xp: number, extra: Partial<QuestRewards> = {}): QuestRewards =>
  ({ buildingUnlocks: [], coins: 0, decorations: [], gems: 0, goods: [], xp, ...extra });

const book = (fields: Partial<QuestBook>): QuestBook => ({ ...emptyScript().quests, ...fields });

test("built-in objectives read live facts and counters since activation (nation drink rule included)", () => {
  const live = facts({
    buildingCount: id => (id === "building:farm" ? 2 : 0), counters: { "produce:beer": 9, plant: 4, ship: 3 },
    soldierCount: (type, stationed) => (stationed && type === "soldier:archer" ? 1 : 3),
    stock: (ware, building) => (ware === "beer" && building === null ? 5 : 0), surveyedDeposits: () => 0
  });
  const active = { ...initialQuestState(), baseline: 4, state: "active" as const };
  const check = (objective: Parameters<typeof objectiveProgress>[0]) => objectiveProgress(objective, active, live);
  assert.deepEqual(check({ building: content("building:farm"), count: 3, kind: "buildingCompleted" }),
    { current: 2, target: 3 });
  assert.deepEqual(check({ amount: 4, kind: "stockLevel", ware: content("ware:wine") }), { current: 4, target: 4 });
  assert.deepEqual(check({ count: 2, kind: "soldierCount", soldierType: content("soldier:archer"), stationed: true }),
    { current: 1, target: 2 });
  assert.deepEqual(check({ amount: 10, kind: "wareProduced", since: "activation", ware: content("ware:wine") }),
    { current: 5, target: 10 });
  assert.deepEqual(check({ action: "plant", count: 5, kind: "actionPerformed", since: "ever" }),
    { current: 4, target: 5 });
  assert.deepEqual(check({ counter: "ship", kind: "counterReached", since: "mapStart", target: 2 }),
    { current: 2, target: 2 });
  assert.deepEqual(check({ counter: "ship", kind: "counterReached", since: "activation", target: 2 }),
    { current: 0, target: 2 });
  assert.equal(check({ kind: "scripted" }), null);
  const surveyed = objectiveProgress({ action: "survey", count: 1, kind: "actionPerformed", since: "activation" },
    active, facts({ surveyedDeposits: () => 2 }));
  assert.deepEqual(surveyed, { current: 1, target: 1 }, "a deposit surveyed earlier keeps a survey objective done");
});

test("clockTime reads the world environment's hour (ENV0) and stays unknown without one", () => {
  const active = { ...initialQuestState(), state: "active" as const };
  const at = (hour: number | null) => objectiveProgress({ hour: 18, kind: "clockTime" }, active,
    facts({ worldHour: () => hour }));
  assert.deepEqual(at(18.4), { current: 1, target: 1 });
  assert.deepEqual(at(17.99), { current: 0, target: 1 });
  assert.equal(at(null), null);
  assert.equal(objectiveProgress({ hour: 18, kind: "clockTime" }, active, facts()), null);
});

test("sequential groups activate the first unfinished quest by level, required groups and prerequisites", () => {
  const chain = book({
    groups: [group("chapter-1", 1), group("chapter-2", 2, ["chapter-1"]), group("side", 1, [], {
      activation: "parallel", completionTopUp: null })],
    quests: [quest("a", { groupId: "chapter-1" }), quest("b", { groupId: "chapter-1" }),
      quest("c", { groupId: "chapter-2" }), quest("s1", { groupId: "side" }), quest("s2", { groupId: "side" }),
      quest("p", { prerequisites: [ref("quest", "a")] }), quest("manual", { activation: "action" })]
  });
  const states = Object.fromEntries(chain.quests.map(entry => [entry.id, initialQuestState()]));
  assert.deepEqual(eligibleQuestIds(chain, states, 1), ["a", "s1", "s2"]);
  const claimed = { ...initialQuestState(), claimCount: 1, state: "claimed" as const };
  assert.deepEqual(eligibleQuestIds(chain, { ...states, a: claimed }, 1), ["b", "s1", "s2", "p"]);
  assert.deepEqual(eligibleQuestIds(chain, { ...states, a: claimed, b: claimed }, 1), ["s1", "s2", "p"]);
  assert.deepEqual(eligibleQuestIds(chain, { ...states, a: claimed, b: claimed }, 2), ["c", "s1", "s2", "p"]);
});

test("claims check readiness, skip, cost and the group top-up", () => {
  const chain = book({ groups: [group("chapter-3", 3)], quests: [
    quest("one", { groupId: "chapter-3", homeReward: rewards(40),
      objective: { building: content("building:farm"), count: 1, kind: "buildingCompleted" } }),
    quest("two", { cost: [{ amount: 3, ware: "wine" }], groupId: "chapter-3", homeReward: rewards(25),
      objective: { kind: "mapStart" }, optional: true })
  ] });
  const active = { ...initialQuestState(), state: "active" as const };
  const states = { one: active, two: active };
  const [one, two] = chain.quests as [typeof chain.quests[0], typeof chain.quests[0]];
  const none = facts();
  assert.deepEqual(decideQuestClaim(chain, states, one, none, { skip: false }, START_UTC),
    { ok: false, reason: "notReady" });
  assert.deepEqual(decideQuestClaim(chain, states, one, none, { skip: true }, START_UTC),
    { ok: false, reason: "notSkippable" });
  assert.deepEqual(decideQuestClaim(chain, states, two, none, { skip: false }, START_UTC),
    { ok: false, reason: "costShort" });
  const stocked = facts({ stock: ware => (ware === "beer" ? 3 : 0) });
  const paid = decideQuestClaim(chain, states, two, stocked, { skip: false }, START_UTC);
  assert.deepEqual(paid, { cost: [{ amount: 3, ware: "wine" }], experience: 25, homeReward: rewards(25), ok: true });
  const skipped = decideQuestClaim(chain, states, two, none, { playerExperience: 100, skip: true }, START_UTC);
  assert.deepEqual(skipped, { cost: [], experience: 0, homeReward: null, ok: true }, "one is still open");
  const last = { ...states, one: { ...active, claimCount: 1, state: "claimed" as const } };
  assert.equal(questClaimExperience(chain, last, two, { playerExperience: 100, skip: true }),
    LEVEL_THRESHOLDS[3]! - 100, "the chapter's last claim tops up to the next level");
});

const counterQuestScript = (visibility: "hidden" | "visible") => emptyScript({
  quests: book({ quests: [quest("ships", {
    objective: { counter: "ship", kind: "counterReached", since: "mapStart", target: 2 },
    onSuccess: [increase("s1", "var-1")], visibility
  })] }),
  variables: [numberVariable("var-1", "rewarded")]
});

test("a counterReached quest succeeds on the cadence; hidden quests auto-claim live and on the first live tick", () => {
  const counters: Record<string, number> = { ship: 0 };
  const world = createFakeWorld();
  world.port = { ...world.port, questFacts: facts({ counters }) };
  const engine = createEngine(counterQuestScript("hidden"), world);
  runTicks(engine, world, 20);
  assert.equal(engine.state.quests.ships?.state, "active");
  engine.setMode("catchUp");
  counters.ship = 5;
  const scriptTick = engine.state.scriptTick;
  runTicks(engine, world, 200);
  assert.equal(engine.state.scriptTick, scriptTick, "the script clock is frozen during catch-up");
  engine.endCatchUp();
  assert.equal(engine.state.quests.ships?.state, "succeeded", "no hidden auto-claim during catch-up");
  runTicks(engine, world, 1);
  assert.equal(engine.state.quests.ships?.state, "claimed", "the first live tick claims it");
  runTicks(engine, world, 1);
  assert.equal(value(engine, "var-1"), 1);
});

test("visible quests wait for the recorded claim; cost is paid through the port", () => {
  const paid: unknown[] = [];
  const world = createFakeWorld();
  let payable = false;
  world.port = { ...world.port, payQuestCost: cost => (payable ? (paid.push(cost), true) : false),
    questFacts: facts({ counters: { ship: 2 } }) };
  const script = counterQuestScript("visible");
  script.quests.quests[0]!.cost = [{ amount: 1, ware: "fish" }];
  world.port = { ...world.port, questFacts: facts({ counters: { ship: 2 }, stock: () => 1 }) };
  const engine = createEngine(script, world);
  runTicks(engine, world, 40);
  assert.equal(engine.state.quests.ships?.state, "succeeded");
  assert.deepEqual(engine.claimQuest("ships"), { ok: false, reason: "costShort" });
  payable = true;
  assert.equal(engine.claimQuest("ships").ok, true);
  assert.deepEqual(paid, [[{ amount: 1, ware: "fish" }]]);
  assert.equal(engine.state.quests.ships?.state, "claimed");
  assert.deepEqual(engine.claimQuest("ships"), { ok: false, reason: "notActive" });
});

test("a failure condition runs onFailure; retryAfterFail re-arms hidden quests and waits for visible ones", () => {
  const world = createFakeWorld();
  const failure = { k: "bool" as const, of: { k: "lit" as const, type: "boolean" as const, value: true } };
  const engine = createEngine(emptyScript({
    quests: book({ quests: [
      quest("hidden", { failure, onFailure: [increase("s1", "var-1")],
        repeat: { kind: "once", retryAfterFail: true }, visibility: "hidden" }),
      quest("visible", { failure, onFailure: [increase("s2", "var-1", 10)],
        repeat: { kind: "once", retryAfterFail: true } })
    ] }),
    variables: [numberVariable("var-1", "failures")]
  }), world);
  // Activated on the first cadence; the failure condition is checked from the next one (TRG5a: onActivate first).
  runTicks(engine, world, 41);
  assert.equal(value(engine, "var-1"), 11);
  assert.equal(engine.state.quests.hidden?.state, "active", "hidden quests retry on their own");
  assert.equal(engine.state.quests.visible?.state, "failed", "visible quests wait for try again");
  assert.equal(engine.retryQuest("visible"), true);
  assert.equal(engine.state.quests.visible?.state, "active");
});

test("interval repeats sit on a grid from the first activation and pay once per window", () => {
  const world = createFakeWorld();
  world.port = { ...world.port, questFacts: facts({ counters: { ship: 9 } }) };
  const script = counterQuestScript("visible");
  script.quests.quests[0]!.repeat = { days: 0, hours: 6, kind: "interval", minutes: 0, retryAfterFail: false };
  const engine = createEngine(script, world);
  runTicks(engine, world, 40);
  assert.equal(engine.claimQuest("ships").ok, true);
  runTicks(engine, world, 40);
  assert.equal(engine.state.quests.ships?.state, "claimed", "same window: not re-armed");
  world.now += 6 * 3_600_000;
  runTicks(engine, world, 40);
  assert.equal(engine.state.quests.ships?.state, "succeeded");
  assert.equal(engine.claimQuest("ships").ok, true);
  assert.equal(engine.state.quests.ships?.claimCount, 2);
  assert.equal(engine.state.quests.ships?.lastWindow, 1);
});

test("declared home rewards queue one claim per occurrence until the ledger confirms it", () => {
  const reward = (occurrence: DeclaredHomeReward["occurrence"]): DeclaredHomeReward =>
    ({ id: "reward-1", name: "Gift", occurrence, rewards: [{ amount: 5, kind: "coins" }] });
  assert.equal(nextHomeRewardOccurrence(reward({ kind: "once" }), undefined, START_UTC), "0");
  assert.equal(nextHomeRewardOccurrence(reward({ kind: "once" }), { count: 1, firstUtc: 0, lastWindow: null }, 0),
    null);
  assert.equal(nextHomeRewardOccurrence(reward({ kind: "counter", maxOccurrences: 2 }),
    { count: 2, firstUtc: 0, lastWindow: null }, 0), null);
  const daily = reward({ kind: "window", repeat: { kind: "calendar", minuteUtc: 0, retryAfterFail: false } });
  const day = Math.floor(START_UTC / DAY_MS);
  assert.equal(nextHomeRewardOccurrence(daily, undefined, START_UTC), String(day));
  assert.equal(nextHomeRewardOccurrence(daily, { count: 1, firstUtc: START_UTC, lastWindow: day }, START_UTC), null);
  const world = createFakeWorld();
  const engine = createEngine(emptyScript({
    homeRewards: [daily],
    triggers: [{ actions: [{ args: { reward: ref("reward", "reward-1") }, id: "s1", k: "do", op: "grantHomeReward" },
      { args: { reward: ref("reward", "reward-1") }, id: "s2", k: "do", op: "grantHomeReward" }],
    concurrency: "queue", conditions: { k: "all", of: [] }, enabled: true,
    events: [{ kind: "mapStarted", player: { kind: "any" }, slots: {} }], folderId: null, id: "trigger-1",
    name: "gift", runLimit: null }]
  }), world);
  runTicks(engine, world, 1);
  assert.deepEqual(engine.state.pendingHomeClaims, [{ occurrence: String(day), rewardId: "reward-1" }]);
  assert.equal(engine.confirmHomeClaim("reward-1", String(day)), true);
  assert.deepEqual(engine.state.pendingHomeClaims, []);
  assert.equal(engine.confirmHomeClaim("reward-1", String(day)), false);
});

test("a completed campaign map pays one third of numeric home rewards on every replay", () => {
  assert.deepEqual([1, 5, 10, 2, 3].map(replayAmount), [0, 2, 3, 1, 1]);
  const full = rewards(10, { buildingUnlocks: [4], coins: 5, decorations: [{ amount: 1, item: "statue" }], gems: 1,
    goods: [{ amount: 1, ware: "fish" }, { amount: 9, ware: "logs" }] });
  assert.equal(campaignHomeReward(full, "available"), full);
  assert.deepEqual(campaignHomeReward(full, "completed"),
    rewards(3, { coins: 2, gems: 0, goods: [{ amount: 3, ware: "logs" }] }));
  assert.deepEqual(campaignRewardEntries([{ amount: 10, kind: "coins" }, { amount: 1, kind: "xp" },
    { amount: 2, kind: "soldier", soldierType: "archer" }], "completed"), [{ amount: 3, kind: "coins" }]);
});
