import assert from "node:assert/strict";
import { test } from "node:test";

import { catalogEntries } from "../src/catalog/loader.ts";
import { validateCatalog } from "../src/catalog/validate/index.ts";
import { validateRewardEntries } from "../src/catalog/validate/rewards.ts";
import { CORE_CATEGORIES, CORE_DATA_FILES } from "../src/catalog/data/index.ts";
import {
  ACTION_CATALOG, ACTOR_CAPABILITY_NAMES, ACTOR_TARGET_NAMES, EVENT_CATALOG, FUNCTION_CATALOG, PREDICATE_CATALOG
} from "../src/script/catalog/index.ts";
import { checkIslandScriptState, checkPlayerScriptState } from "../src/script/island-state.ts";
import { formatScriptIssue, SCRIPT_ISSUE_MESSAGES } from "../src/script/issues.ts";
import { scriptReferences, scriptUsersOf } from "../src/script/references.ts";
import { isActionAllowed, isEventAllowed, isUiTargetAllowed, SCRIPT_SCOPES } from "../src/script/scopes.ts";
import { validateMapScript } from "../src/script/validate.ts";
import { DESIGN_EXAMPLES, plantTrees, TEST_CATALOG, words } from "./script-fixtures.ts";
import pendingTranslations from "./fixtures/pending-issue-translations.json" with { type: "json" };

const placeholders = (template: string) => [...template.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

for (const example of DESIGN_EXAMPLES)
  test(`design example ${example.name} is Ready on a ${example.kind} map`, () => {
    const result = validateMapScript(example.script(), { catalog: TEST_CATALOG, mapKind: example.kind });
    assert.deepEqual(result.errors, []);
    assert.ok(result.warnings.every(issue => issue.code === "notYetAvailable"), JSON.stringify(result.warnings));
  });

test("examples survive a JSON round trip unchanged (plain serializable data)", () => {
  for (const example of DESIGN_EXAMPLES) {
    const script = example.script();
    assert.deepEqual(JSON.parse(JSON.stringify(script)), script);
  }
});

test("the reference walk finds every tagged id with its owner; used-by lists owners", () => {
  const references = scriptReferences(plantTrees());
  assert.deepEqual(scriptUsersOf(references, "variable", "var-2"),
    ["quest:grove", "trigger:trigger-7", "variable:var-3"]);
  assert.deepEqual(scriptUsersOf(references, "multiboard", "var-3"), ["quest:grove"]);
  assert.ok(references.some(reference => reference.kind === "content" && reference.id === "tree:broadleafTree"));
});

/**
 * English-only codes that wait for the owner's translation batch: the one shared list of
 * `fixtures/pending-issue-translations.json` (BR0, BR2, AUDIO-CATALOG). A translated code must leave it, so it can
 * only shrink.
 */
const TRANSLATION_PENDING: ReadonlySet<string> = new Set(pendingTranslations.script);

test("every issue code has English, Hungarian and German templates with the same placeholders", () => {
  const messages: Readonly<Record<string, { de?: string; en: string; hu?: string }>> = SCRIPT_ISSUE_MESSAGES;
  for (const [code, message] of Object.entries(messages)) {
    if (TRANSLATION_PENDING.has(code)) {
      assert.ok(message.en && !message.hu && !message.de, `${code} is translated: remove it from the pending list`);
      continue;
    }
    assert.ok(message.en && message.hu && message.de, code);
    assert.deepEqual(placeholders(message.hu), placeholders(message.en), code);
    assert.deepEqual(placeholders(message.de), placeholders(message.en), code);
  }
  const issue = { code: "unknownReference" as const, params: { id: "var-9", kind: "variable" }, path: "x",
    severity: "error" as const };
  assert.equal(formatScriptIssue(issue, "en"), "x refers to the unknown variable var-9.");
  assert.equal(formatScriptIssue(issue, "hu"), "x ismeretlen variable elemre hivatkozik: var-9.");
  assert.equal(formatScriptIssue(issue, "de"), "x verweist auf ein unbekanntes variable-Element: var-9.");
});

test("the catalogues define the design's event and action keys with unique slot names", () => {
  for (const key of ["mapStarted", "animalKilled", "enteredRegion", "treePlanted", "shellPickedUp", "shipLeftMap",
    "actorUnloaded", "shipDocked", "colonyDefeated", "scriptUpdated"]) assert.ok(key in EVENT_CATALOG, key);
  for (const key of ["spawn", "spawnAboard", "unload", "storeActor", "highlightUi", "grantHomeReward", "colonyEnd"])
    assert.ok(key in ACTION_CATALOG, key);
  assert.ok("cargoCount" in FUNCTION_CATALOG && "capacityLeft" in FUNCTION_CATALOG);
  const tables = [...Object.values(EVENT_CATALOG).map(def => def.slots), ...Object.values(ACTION_CATALOG)
    .map(def => def.args), ...Object.values(PREDICATE_CATALOG).map(def => def.args),
  ...Object.values(FUNCTION_CATALOG).map(def => def.args)];
  for (const slots of tables) assert.equal(new Set(slots.map(slot => slot.name)).size, slots.length);
  for (const def of Object.values(EVENT_CATALOG))
    if (def.subject !== null) assert.ok(def.slots.some(slot => slot.name === def.subject));
});

test("catalog actor blocks use only names the catalogues know", () => {
  for (const entry of catalogEntries()) {
    if (!entry.actor) continue;
    for (const name of entry.actor.capabilities) assert.ok(ACTOR_CAPABILITY_NAMES.has(name), `${entry.id} ${name}`);
    for (const name of entry.actor.targetOf ?? []) assert.ok(ACTOR_TARGET_NAMES.has(name), `${entry.id} ${name}`);
  }
  const deer = catalogEntries().find(entry => entry.id === "animal:deer");
  assert.deepEqual(deer?.actor?.capabilities, ["enteredRegion", "hunted", "killed"]);
});

test("the catalog validator refuses malformed actor blocks", () => {
  const [first] = CORE_DATA_FILES;
  const broken = (first!.entries as Record<string, unknown>[]).map((entry, index) =>
    (index === 0 ? { ...entry, actor: { capabilities: ["Bad name"], extra: true } } : entry));
  const issues = validateCatalog({ categories: CORE_CATEGORIES, files: [{ ...first!, entries: broken },
    ...CORE_DATA_FILES.slice(1)] });
  assert.deepEqual(issues.map(issue => issue.code), ["actor"]);
  assert.deepEqual(validateCatalog({ categories: CORE_CATEGORIES, files: CORE_DATA_FILES }), []);
});

test("validateRewardEntries checks kinds, amounts, wares, decorations, soldiers and unlocks", () => {
  const options = { buildingTypes: new Set([3]), soldierTypes: ["shield"] };
  assert.deepEqual(validateRewardEntries([{ amount: 5, kind: "ware", ware: "logs" }, { amount: 2, kind: "gems" },
    { amount: 1, kind: "soldier", rank: 2, soldierType: "shield" }, { buildingType: 3, kind: "buildingUnlock" }],
  options), []);
  const codes = validateRewardEntries([{ amount: 0, kind: "xp" }, { amount: 1, kind: "ware", ware: "unobtainium" },
    { amount: 1, kind: "soldier", rank: 3, soldierType: "dragon" }, { buildingType: 9, kind: "buildingUnlock" },
    { amount: 1, item: "roadDecoration:none:marble", kind: "decoration" }, { kind: "banner" }, "x"], options);
  assert.deepEqual(codes.map(issue => issue.path), ["rewards[0].amount", "rewards[1].ware",
    "rewards[2].soldierType", "rewards[2].rank", "rewards[3].buildingType", "rewards[4].item", "rewards[5]",
    "rewards[6]"]);
});

test("map kind scopes hide what makes no sense there", () => {
  assert.equal(isActionAllowed("home", "endMap"), false);
  assert.equal(isActionAllowed("campaign", "endMap"), true);
  assert.equal(isEventAllowed("home", "colonyConquered"), false);
  assert.equal(isUiTargetAllowed("colony", "gemShop"), false);
  assert.equal(isUiTargetAllowed("home", "gemShop"), true);
  for (const scope of Object.values(SCRIPT_SCOPES))
    for (const action of scope.actions) assert.ok(action in ACTION_CATALOG);
});

test("per-island script state and player-wide quest digests have checked envelopes", () => {
  const runState = { scriptTick: 120, version: 1 };
  const state = { islandKey: "colony-7", leftAtTick: 400, leftAtUtc: 1_700_000_000_000, mapKind: "colony", runState,
    version: 1 };
  assert.deepEqual(checkIslandScriptState(state), []);
  assert.deepEqual(checkIslandScriptState({ ...state, mapKind: "moon", runState: { scriptTick: -1, version: 9 } })
    .map(issue => issue.path), ["islandScriptState.mapKind", "islandScriptState.runState.version",
    "islandScriptState.runState.scriptTick"]);
  const digest = { bookId: "colony-7", islandKey: "colony-7", mapKind: "colony", quests: [{ claimable: true,
    deadlineUtc: null, questId: "colony.conquer", state: "succeeded", title: words("Conquer").text }],
  updatedAtUtc: 1 };
  assert.deepEqual(checkPlayerScriptState({ announcedColonyExpiries: [], digests: { "colony-7": digest },
    version: 1 }), []);
  assert.equal(checkPlayerScriptState({ announcedColonyExpiries: [], digests: { "colony-7": { ...digest,
    quests: [{ ...digest.quests[0], state: "won" }] } }, version: 1 }).length, 1);
});
