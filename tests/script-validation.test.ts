import assert from "node:assert/strict";
import { test } from "node:test";

import type { ContentEntryBase } from "../src/catalog/types/entry.ts";
import type { ScriptIssueCode, ScriptIssueSeverity } from "../src/script/issues.ts";
import type { MapKind, MapScript, ScriptAction, ScriptEvent, ScriptTrigger } from "../src/script/types/index.ts";
import { actorDisplayName, defaultLookName, namedActorIds } from "../src/script/actor-names.ts";
import { SCRIPT_LIMITS } from "../src/script/constants.ts";
import { type ScriptValidationContext, validateMapScript } from "../src/script/validate.ts";
import {
  bool, chiefFlees, colonyHold, doStep, emptyScript, num, numberVariable, player1, quest, ref, region,
  shipReinforcements, str, TEST_CATALOG, trigger, words
} from "./script-fixtures.ts";

/** Every Ready rule of trigger design §11.1 (and the owner additions) with a failing and a passing fixture. */

interface RuleCase {
  code: ScriptIssueCode;
  context?: Partial<ScriptValidationContext>;
  fail: () => unknown;
  kind?: MapKind;
  name: string;
  pass: () => unknown;
  /** Map kind of the passing fixture (scope rules); default the failing fixture's kind. */
  passKind?: MapKind;
  severity?: ScriptIssueSeverity;
}

const RETIRED: ContentEntryBase = { ...TEST_CATALOG.entry("animal:deer")!, id: "animal:mammoth", key: "mammoth",
  retired: true };
const catalog = { ...TEST_CATALOG, entry: (id: string) => (id === RETIRED.id ? RETIRED : TEST_CATALOG.entry(id)) };

const issuesOf = (script: unknown, kind: MapKind = "campaign", context: Partial<ScriptValidationContext> = {}) => {
  const result = validateMapScript(script, { catalog, mapKind: kind, ...context });
  return [...result.errors, ...result.warnings, ...result.infos];
};

const base = (actions: ScriptAction[], fields: Partial<MapScript> = {}, events?: ScriptEvent[]): MapScript =>
  emptyScript({
    quests: { ...emptyScript().quests, quests: [quest("q1")] },
    regions: [region("region-1")],
    triggers: [trigger("t1", { actions, ...(events ? { events } : {}) })],
    variables: [numberVariable("var-n", "count")],
    ...fields
  });

const increase = (amount: unknown = num(1), variable: unknown = ref("variable", "var-n")) =>
  doStep("s1", "increaseVariable", { amount, variable });
const entered = (subject: unknown): ScriptEvent[] => [{ kind: "enteredRegion", player: player1,
  slots: { region: ref("region", "region-1"), subject } } as ScriptEvent];
const typeSelector = (id: string, extra: object = {}) => ({ kind: "type", type: { type: ref("content", id),
  ...extra } });
const killed = (victim: unknown, killer: unknown): ScriptEvent[] =>
  [{ kind: "animalKilled", player: player1, slots: { killer, victim } } as ScriptEvent];
const deerFamily = (owner?: object) => ({ family: ref("family", "animal.deer"), kind: "family", ...(owner ?? {}) });
const neutral = { owner: { kind: "neutral" } };
const nested = (depth: number): ScriptAction => (depth === 0 ? increase()
  : { cond: { k: "all", of: [] }, else: [], id: `if${depth}`, k: "if", then: [nested(depth - 1)] } as ScriptAction);
const notNested = (depth: number): unknown => (depth === 0 ? { k: "all", of: [] } : { k: "not",
  of: notNested(depth - 1) });
const board = (rows: unknown, cells: unknown = { a: { expr: num(1), format: "number" } }) => ({
  id: "var-b", initial: { type: "multiboard", value: { audience: player1, cells, columns: [{ align: "left",
    header: { en: "A", hu: "A" }, id: "a", width: "auto" }], initiallyCollapsed: false, initiallyVisible: true, rows,
  sort: null, title: { en: "Board", hu: "Tábla" } } }, name: "board", type: "multiboard"
});
const highlight = (id: string, until = "clicked") => doStep(id, "highlightUi", { anchor: str("bottomBar.build"),
  until: str(until) }, { wait: { onFail: "continue", timeoutSeconds: 30 } });
const commander = (): MapScript => base([], { actors: [{ binding: "spawn", count: 1, id: "actor-c",
  lifetime: "keepIncarnation", look: { kind: "ownerNation" }, name: "Commander", owner: player1,
  place: { region: ref("region", "region-1") }, respawn: "refuse", spawnAtStart: true,
  type: { type: ref("content", "commander:roman") } }] });
const runTriggers = (waitFirst: boolean): MapScript => base([], { triggers: [
  trigger("ta", { actions: [...(waitFirst ? [{ id: "w", k: "wait", seconds: num(1) } as ScriptAction] : []),
    { checkConditions: false, id: "r", k: "runTrigger", trigger: ref("trigger", "tb"), wait: false }] }),
  trigger("tb", { actions: [{ checkConditions: false, id: "r", k: "runTrigger", trigger: ref("trigger", "ta"),
    wait: false }], events: [] })
] });
const withReward = (rewards: unknown, occurrence: object = { kind: "once" }) => base([],
  { homeRewards: [{ id: "reward-1",
  name: "Gift", occurrence, rewards }] } as Partial<MapScript>);
const colonyFailure = (actions: ScriptAction[]) => {
  const script = colonyHold();
  script.quests.quests[0]!.onFailure = actions;
  return script;
};
const ship = (step: ScriptAction) => {
  const script = shipReinforcements();
  script.triggers[0]!.actions = [step];
  return script;
};
const pins = (count: number) => base([], { regions: Array.from({ length: count }, (_, index) =>
  region(`region-${index + 1}`, index * 5)), triggers: Array.from({ length: count }, (_, index) =>
  trigger(`t${index}`, { actions: [increase()], events: [{ kind: "enteredRegion", player: { kind: "neutral" },
    slots: { region: ref("region", `region-${index + 1}`), subject: deerFamily() } } as ScriptEvent] })) });

const CASES: readonly RuleCase[] = [
  { code: "invalidShape", fail: () => ({ ...base([]), triggers: [{ id: "t1" }] }), name: "shape",
    pass: () => base([]) },
  { code: "bareStringReference", fail: () => base([increase(num(1), "var-n")]), name: "bare string ref",
    pass: () => base([increase()]) },
  { code: "bareStringReference", fail: () => base([], {}, entered(deerFamily()).map(event =>
    ({ ...event, slots: { ...event.slots, region: "region-1" } }) as never)), name: "bare string in a ref slot",
  pass: () => base([], {}, entered(deerFamily())) },
  { code: "scriptTooLarge", fail: () => base([], { triggers: [trigger("t1", { comment: "x".repeat(1_100_000) })] }),
    name: "size", pass: () => base([]) },
  { code: "scriptTooDeep", fail: () => base([], { triggers: [trigger("t1", { conditions: notNested(120) as never })] }),
    name: "depth", pass: () => base([]) },
  { code: "nestingTooDeep", fail: () => base([nested(10)]), name: "nesting", pass: () => base([nested(3)]) },
  { code: "duplicateId", fail: () => base([], { triggers: [trigger("t1"), trigger("t1")] }), name: "dup id",
    pass: () => base([], { triggers: [trigger("t1"), trigger("t2")] }) },
  { code: "duplicateStepId", fail: () => base([increase(), increase()]), name: "dup step",
    pass: () => base([increase(), { ...increase(), id: "s2" }]) },
  { code: "invalidVariableName", fail: () => base([], { variables: [numberVariable("var-n", "9lives")] }),
    name: "variable name", pass: () => base([]) },
  { code: "duplicateVariableName", fail: () => base([], { variables: [numberVariable("var-n", "count"),
    numberVariable("var-m", "COUNT")] }), name: "variable name case", pass: () => base([]) },
  { code: "unknownReference", fail: () => base([increase(num(1), ref("variable", "var-9"))]), name: "unknown ref",
    pass: () => base([increase()]) },
  { code: "refTypeMismatch", fail: () => base([doStep("s1", "showMultiboard", { multiboard: ref("multiboard",
    "var-n") })]), name: "ref type", pass: () => base([doStep("s1", "showMultiboard", { multiboard: ref("multiboard",
    "var-b") })], { variables: [board({ kind: "players", filter: { kind: "any" } }) as never] }) },
  { code: "unknownContent", fail: () => base([], {}, entered(typeSelector("animal:dragon"))), name: "unknown id",
    pass: () => base([], {}, entered(typeSelector("animal:deer"))) },
  { code: "retiredContent", fail: () => base([], {}, entered(typeSelector("animal:mammoth"))), name: "retired id",
    pass: () => base([], {}, entered(typeSelector("animal:elk"))) },
  { code: "unknownFamily", fail: () => base([], {}, entered({ family: ref("family", "dragon"), kind: "family" })),
    name: "unknown family", pass: () => base([], {}, entered(deerFamily())) },
  { code: "contentKindNotAllowed", fail: () => base([], {}, [{ kind: "shellPickedUp", player: player1,
    slots: { shell: { ...typeSelector("animal:deer"), ...neutral } } } as ScriptEvent]), name: "kind",
  pass: () => base([], {}, [{ kind: "shellPickedUp", player: player1, slots: { shell: { ...typeSelector(
    "shell:seaStar"), ...neutral } } } as ScriptEvent]) },
  { code: "qualifierNotDeclared", fail: () => base([], {}, entered(typeSelector("animal:deer", { rank: { min: 1 } }))),
    name: "qualifier", pass: () => base([], {}, entered(typeSelector("soldier:archer", { rank: { min: 1 } }))) },
  { code: "capabilityMissing", fail: () => base([], {}, killed(deerFamily(neutral), typeSelector("soldier:archer"))),
    name: "capability", pass: () => base([], {}, killed(deerFamily(neutral), typeSelector("settler:hunter"))) },
  { code: "capabilityMissing", fail: () => base([], {}, entered(typeSelector("deposit:ironOre"))),
    name: "event not raised by entry", pass: () => base([], {}, entered(typeSelector("animal:rabbit"))) },
  { code: "capabilityMissing", fail: () => base([doStep("s1", "move", { actor: { ...typeSelector("tree:palmTree"),
    ...neutral }, region: ref("region", "region-1") })]), name: "action not in targetOf",
  pass: () => base([doStep("s1", "move", { actor: { ...typeSelector("soldier:archer"), owner: player1 },
    region: ref("region", "region-1") })]) },
  { code: "tagMissing", fail: () => base([], {}, killed({ ...typeSelector("critter:fox"), ...neutral }, null)),
    name: "tag", pass: () => base([], {}, killed({ ...typeSelector("critter:boar"), ...neutral }, null)) },
  { code: "instanceRequired", fail: () => base([doStep("s1", "appear", { actor: { ...typeSelector("animal:deer"),
    ...neutral } })]), name: "instance", pass: () => commanderAppear() },
  { code: "ownerFilterConflict", fail: () => base([], {}, entered(deerFamily(neutral))), name: "owner conflict",
    pass: () => base([], {}, entered(deerFamily())) },
  { code: "ownerRequired", fail: () => base([], {}, killed(deerFamily(), null)), name: "owner required",
    pass: () => base([], {}, killed(deerFamily(neutral), null)) },
  { code: "unknownResponse", fail: () => base([increase({ k: "resp", key: "amount" })]), name: "response",
    pass: () => base([increase({ k: "resp", key: "amount" })], {}, [{ kind: "actorDamaged", player: player1,
      slots: { subject: typeSelector("soldier:archer") } } as ScriptEvent]) },
  { code: "unknownLocal", fail: () => base([increase({ k: "local", name: "i" })]), name: "local",
    pass: () => base([{ as: "i", body: [increase({ k: "local", name: "i" })], from: num(1), id: "f", k: "forRange",
      to: num(3) } as ScriptAction]) },
  { code: "notOnMapKind", fail: () => base([doStep("s1", "endMap", { outcome: str("victory") })]), kind: "home",
    name: "action scope", passKind: "campaign", pass: () => base([doStep("s1", "endMap",
      { outcome: str("victory") })]) },
  { code: "endMapUnknownExit", context: { exitIds: new Set(["victory", "exit-1"]) }, fail: () => endMap("exit-2"),
    name: "undeclared exit", pass: () => endMap("exit-1") },
  { code: "endMapUnknownExit", context: { exitIds: new Set(["victory"]) }, fail: () => endMap("exit-1"),
    name: "implicit victory exit", pass: () => endMap("victory") },
  { code: "endMapExitOnDefeat", fail: () => endMap("exit-1", "defeat"), name: "exit with defeat",
    pass: () => endMap("exit-1") },
  { code: "endMapExitOffCampaign", fail: () => endMap("exit-1"), kind: "adventure", name: "exit off campaign",
    pass: () => endMap("exit-1"), passKind: "campaign" },
  { code: "notOnMapKind", fail: () => base([], {}, [{ kind: "colonyConquered", player: player1, slots: {} }]),
    kind: "home", name: "event scope", pass: () => base([], {}, [{ kind: "colonyConquered", player: player1,
      slots: {} }]), passKind: "colony" },
  { code: "notOnMapKind", fail: () => base([doStep("s1", "openUi", { target: { kind: "gemShop" } })]),
    kind: "colony", name: "ui target scope", passKind: "home", pass: () => base([doStep("s1", "openUi",
      { target: { kind: "gemShop" } })]) },
  { code: "notOnMapKind", fail: () => base([], { quests: { ...emptyScript().quests, quests: [quest("q1",
    { objective: { kind: "victory" } })] } }), kind: "home", name: "objective scope", passKind: "campaign",
  pass: () => base([], { quests: { ...emptyScript().quests, quests: [quest("q1",
    { objective: { kind: "victory" } })] } }) },
  { code: "notYetAvailable", fail: () => chiefFlees(), name: "later lane", pass: () => base([increase()]),
    severity: "warning" },
  { code: "unknownEvent", fail: () => base([], {}, [{ kind: "dragonSighted", player: player1, slots: {} } as never]),
    name: "event kind", pass: () => base([]) },
  { code: "unknownAction", fail: () => base([doStep("s1", "summonDragon", {})]), name: "action kind",
    pass: () => base([increase()]) },
  { code: "unknownPredicate", fail: () => base([], { triggers: [trigger("t1", { conditions: { args: {}, k: "is",
    pred: "isDragon" } as never })] }), name: "predicate", pass: () => base([], { triggers: [trigger("t1",
    { conditions: { args: {}, k: "is", pred: "cinematicActive" } })] }) },
  { code: "unknownFunction", fail: () => base([increase({ args: {}, fn: "dragons", k: "fn" })]), name: "function",
    pass: () => base([increase({ args: {}, fn: "elapsedSeconds", k: "fn" })]) },
  { code: "unknownSlot", fail: () => base([doStep("s1", "increaseVariable", { amount: num(1), colour: num(2),
    variable: ref("variable", "var-n") })]), name: "slot", pass: () => base([increase()]) },
  { code: "missingSlot", fail: () => base([doStep("s1", "increaseVariable", { variable: ref("variable", "var-n") })]),
    name: "missing slot", pass: () => base([increase()]) },
  { code: "slotTypeMismatch", fail: () => base([increase(str("one"))]), name: "type", pass: () => base([increase()]) },
  { code: "rawStringInVisibleSlot", fail: () => base([doStep("s1", "notify", { text: str("Hello") })]),
    name: "raw string", pass: () => base([doStep("s1", "notify", { text: words("Hello") })]) },
  { code: "waitNotSupported", fail: () => base([doStep("s1", "revealFog", { region: ref("region", "region-1") },
    { wait: { onFail: "continue", timeoutSeconds: 5 } })]), name: "wait not supported",
  pass: () => base([doStep("s1", "revealFog", { region: ref("region", "region-1") })]) },
  { code: "waitWithoutTimeout", fail: () => base([doStep("s1", "highlightUi", { anchor: str("a"),
    until: str("clicked") }, { wait: { onFail: "continue" } })]), name: "wait timeout",
      pass: () => base([highlight("s1")]) },
  { code: "waitTimeoutOutOfRange", fail: () => base([doStep("s1", "highlightUi", { anchor: str("a"),
    until: str("clicked") }, { wait: { onFail: "continue", timeoutSeconds: 5000 } })]), name: "wait range",
  pass: () => base([highlight("s1")]) },
  { code: "waitUntilWithoutDependencies", fail: () => base([{ cond: { a: num(1), b: num(2), k: "compare", op: "<" },
    id: "w", k: "waitUntil", timeoutSeconds: 10 } as ScriptAction]), name: "waitUntil deps",
  pass: () => base([{ cond: { a: { k: "var", variable: ref("variable", "var-n") }, b: num(2), k: "compare", op: "<" },
    id: "w", k: "waitUntil", timeoutSeconds: 10 } as ScriptAction]) },
  { code: "waitUntilWithoutTimeout", fail: () => base([{ cond: { a: { k: "var", variable: ref("variable", "var-n") },
    b: num(2), k: "compare", op: "<" }, id: "w", k: "waitUntil", timeoutSeconds: null } as ScriptAction]),
  name: "waitUntil forever", pass: () => base([]), severity: "warning" },
  { code: "runTriggerCycle", fail: () => runTriggers(false), name: "runTrigger cycle", pass: () => runTriggers(true) },
  { code: "forEachMaxAboveCap", fail: () => base([forEach(300)]), name: "forEach cap",
    pass: () => base([forEach(10)]) },
  { code: "unboundedForEach", fail: () => base([forEach(10, { kind: "any" })]), name: "unbounded forEach",
    pass: () => base([forEach(10)]), severity: "warning" },
  { code: "spawnCountAboveCap", fail: () => base([spawn(100)]), name: "spawn cap", pass: () => base([spawn(4)]) },
  { code: "multiboardRowSourceNotArray", fail: () => base([], { variables: [numberVariable("var-n", "count"),
    board({ kind: "array", lengthOf: ref("variable", "var-n"), maxRows: 4 }) as never] }), name: "board rows",
  pass: () => base([], { variables: [numberVariable("var-n", "count"), board({ filter: { kind: "any" },
    kind: "players" }) as never] }) },
  { code: "multiboardUnknownColumn", fail: () => base([], { variables: [board({ filter: { kind: "any" },
    kind: "players" }, { a: { expr: num(1), format: "number" }, b: { expr: num(2), format: "number" } }) as never] }),
  name: "board column", pass: () => base([], { variables: [board({ filter: { kind: "any" },
    kind: "players" }) as never] }) },
  { code: "multiboardColumnWithoutCell", fail: () => base([], { variables: [board({ filter: { kind: "any" },
    kind: "players" }, {}) as never] }), name: "board cell", pass: () => base([], { variables: [board({
    filter: { kind: "any" }, kind: "players" }) as never] }) },
  { code: "variableInitialTypeMismatch", fail: () => base([], { variables: [{ ...numberVariable("var-n", "count"),
    initial: { type: "string", value: "0" } }] }), name: "initial type", pass: () => base([]) },
  { code: "actorVariableNotEmpty", fail: () => base([], { variables: [{ id: "var-a", initial: { type: "actor",
    value: [{ generation: 0, id: 1, space: "actor" }] }, name: "hero", type: "actor" }] }), name: "actor initial",
  pass: () => base([], { variables: [{ id: "var-a", initial: { type: "actor", value: [] }, name: "hero",
    type: "actor" }] }) },
  { code: "arrayTooLong", fail: () => base([], { variables: [{ id: "var-l", initial: { type: "number[]",
    value: [1, 2, 3] }, maxLength: 2, name: "list", type: "number[]" }] }), name: "array length",
  pass: () => base([], { variables: [{ id: "var-l", initial: { type: "number[]", value: [1, 2] }, maxLength: 2,
    name: "list", type: "number[]" }] }) },
  { code: "archipelagoActionNotAllowed", fail: () => colonyFailure([doStep("s1", "sendMail", {
    body: words("Gone"), title: words("Gone") })]), kind: "colony", name: "archipelago",
  pass: () => colonyFailure([doStep("s1", "colonyEnd", { reason: str("expired") })]) },
  { code: "colonyHoldDeadlineLocked", fail: () => {
    const script = colonyHold();
    script.quests.quests[0]!.deadline = { days: 10, hours: 0, kind: "dateAfterActivation", minutes: 0 };
    return script;
  }, kind: "colony", name: "colony deadline", pass: () => colonyHold() },
  { code: "highlightWaitNeedsClicked", fail: () => base([highlight("s1", "seconds")]), name: "highlight wait",
    pass: () => base([highlight("s1")]) },
  { code: "tooManyUiAckWaits", fail: () => base(["a", "b", "c", "d", "e"].map(id => highlight(id))),
    name: "ui ack waits", pass: () => base(["a", "b"].map(id => highlight(id))) },
  { code: "invalidReward", fail: () => withReward([{ amount: 5, kind: "ware", ware: "unobtainium" }]),
    name: "home reward", pass: () => withReward([{ amount: 5, kind: "ware", ware: "logs" }]) },
  { code: "homeRewardBeforeCompletionProof", fail: () => withReward([{ amount: 5, kind: "gems" }],
    { kind: "counter", maxOccurrences: 3 }), name: "counter reward", pass: () => withReward([{ amount: 5,
    kind: "gems" }]), severity: "warning" },
  { code: "unknownCounter", fail: () => counterQuest("fish:caught"), name: "counter",
    pass: () => counterQuest("plant:tree") },
  { code: "unknownQuestAction", fail: () => base([], { quests: { ...emptyScript().quests, quests: [quest("q1", {
    objective: { action: "dance", count: 2, kind: "actionPerformed", since: "activation" } })] } }), kind: "home",
  name: "quest action", pass: () => base([], { quests: { ...emptyScript().quests, quests: [quest("q1", {
    objective: { action: "promote:2", count: 2, kind: "actionPerformed", since: "activation" } })] } }) },
  { code: "unknownGroup", fail: () => base([], { quests: { ...emptyScript().quests, quests: [quest("q1",
    { groupId: "chapter-9" })] } }), name: "group", pass: () => base([]) },
  { code: "missingEnglishText", fail: () => base([doStep("s1", "notify", { text: words("") })]),
    name: "english", pass: () => base([doStep("s1", "notify", { text: words("Hi") })]) },
  { code: "missingEnglishText", fail: () => base([], { quests: { ...emptyScript().quests,
    quests: [{ ...quest("q1"), title: undefined }] } }), name: "visible quest title", pass: () => base([]) },
  { code: "missingTranslation", fail: () => base([doStep("s1", "notify", { text: { k: "text",
    text: { en: "Hi" } } })]), name: "translation", pass: () => base([doStep("s1", "notify", { text: words("Hi") })]),
  severity: "warning" },
  { code: "unusedVariable", fail: () => base([]), name: "unused variable", pass: () => base([increase()]),
    severity: "warning" },
  { code: "unusedActor", fail: () => commander(), name: "unused actor", pass: () => commanderAppear(),
    severity: "warning" },
  { code: "unusedTrigger", fail: () => base([], { triggers: [trigger("t1", { events: [] })] }), name: "unused trigger",
    pass: () => base([]), severity: "warning" },
  { code: "parallelSpawn", fail: () => base([], { triggers: [trigger("t1", { actions: [spawn(2)],
    concurrency: "parallel" })] }), name: "parallel spawn", pass: () => base([spawn(2)]), severity: "warning" },
  { code: "selfFeedingTrigger", fail: () => selfFeeding(null), name: "self feeding", pass: () => selfFeeding(1),
    severity: "warning" },
  { code: "fireLimitedTrigger", context: { fireLimitedTriggers: ["t1"] }, fail: () => base([]), name: "fire limit",
    pass: () => base([], { triggers: [trigger("t2")] }), severity: "warning" },
  { code: "wildlifePinsAboveLimit", fail: () => pins(5), name: "wildlife pins", pass: () => pins(4),
    severity: "warning" },
  { code: "questPrerequisiteCycle", fail: () => base([], { quests: { ...emptyScript().quests, quests: [
    quest("q1", { prerequisites: [ref("quest", "q2")] }), quest("q2", { prerequisites: [ref("quest", "q1")] })] } }),
  name: "prerequisite cycle", pass: () => base([]), severity: "warning" },
  { code: "notServerProvable", fail: () => base([doStep("s1", "grantMapReward", { rewards: [{ amount: 5,
    kind: "gems" }] })], {}, [{ kind: "seenByPlayer", player: player1,
      slots: { subject: typeSelector("whale:orca") } } as ScriptEvent]),
  name: "client report reward", pass: () => base([doStep("s1", "grantMapReward", { rewards: [{ amount: 5,
    kind: "gems" }] })]), severity: "info" },
  { code: "commanderWithoutLodge", context: { mapHasCommandersLodge: false }, fail: () => commanderAppear(),
    name: "commander lodge", pass: () => commanderAppear() },
  { code: "aboveShipCapacity", fail: () => ship(aboard(17)), name: "ship capacity", pass: () => ship(aboard(16)) },
  { code: "aboveShipCapacity", fail: () => ship(doStep("s1", "spawnAboard", { cargo: [{ amount: 200, ware: "logs" }],
    owner: player1, ship: { actor: ref("actor", "actor-ship"), kind: "instance" } })), name: "ship boxes",
  pass: () => ship(doStep("s1", "spawnAboard", { cargo: [{ amount: 10, ware: "logs" }], owner: player1,
    ship: { actor: ref("actor", "actor-ship"), kind: "instance" } })) },
  { code: "shipOwnerMismatch", fail: () => ship(aboard(2, { faction: 1, kind: "slot" })), name: "ship owner",
    pass: () => ship(aboard(2)) },
  { code: "slotTypeMismatch", fail: () => queryStore("all"), name: "group query into one actor",
    pass: () => queryStore("first") },
  { code: "tooMany", fail: () => base([], { variables: Array.from({ length: 17 }, (_, index) =>
    ({ ...board({ filter: { kind: "any" }, kind: "players" }), id: `var-b${index}`,
      name: `board${index}` }) as never) }),
  name: "multiboard count", pass: () => base([]) }
];

function forEach(max: number, owner: object = player1): ScriptAction {
  return { as: "unit", body: [], id: "fe", k: "forEach", max, over: { kind: "type", owner,
    type: { type: ref("content", "soldier:archer") } } } as ScriptAction;
}
function spawn(count: number): ScriptAction {
  return doStep("s1", "spawn", { at: ref("region", "region-1"), count: num(count), owner: player1,
    type: { type: ref("content", "soldier:shield") } });
}
function endMap(exit: string, outcome = "victory"): MapScript {
  return base([doStep("s1", "endMap", { exit: ref("exit", exit), outcome: str(outcome) })]);
}
function counterQuest(counter: string): MapScript {
  return base([], { quests: { ...emptyScript().quests, quests: [quest("q1", { objective: { counter,
    kind: "counterReached", since: "activation", target: 8 } })] } });
}
function commanderAppear(): MapScript {
  const script = commander();
  script.triggers[0]!.actions = [doStep("s1", "appear", { actor: { actor: ref("actor", "actor-c"),
    kind: "instance" } })];
  return script;
}
function selfFeeding(runLimit: number | null): MapScript {
  return base([], { triggers: [trigger("t1", { actions: [increase()], events: [{ kind: "variableChanged",
    player: { kind: "any" }, slots: { variable: ref("variable", "var-n") } }], runLimit })] });
}
function aboard(count: number, owner: object = player1): ScriptAction {
  return doStep("s1", "spawnAboard", { count: num(count), owner, ship: { actor: ref("actor", "actor-ship"),
    kind: "instance" }, type: { type: ref("content", "soldier:shield") } });
}
function queryStore(pick: string): MapScript {
  const script = shipReinforcements();
  const step = script.triggers[2]!.actions[0] as unknown as { args: { selector: { query: { pick: object } } } };
  step.args.selector.query.pick = { kind: pick };
  return script;
}

for (const rule of CASES) {
  test(`rule ${rule.code}: ${rule.name}`, () => {
    const severity = rule.severity ?? "error";
    const has = (script: unknown) => issuesOf(script, rule.kind, rule.context)
      .some(issue => issue.code === rule.code && issue.severity === severity);
    const passContext = rule.code === "commanderWithoutLodge" ? {} : rule.context;
    assert.equal(has(rule.fail()), true, "failing fixture reports the rule");
    assert.equal(issuesOf(rule.pass(), rule.passKind ?? rule.kind,
      passContext).some(issue => issue.code === rule.code), false,
      "passing fixture is clean of the rule");
  });
}

test("scriptReadsEnvironment is derived from hour/weather reads and writes", () => {
  const plain = validateMapScript(base([increase()]), { catalog, mapKind: "home" });
  const weather = validateMapScript(base([doStep("s1", "setWeather", { state: str("rain") })]),
    { catalog, mapKind: "home" });
  const predicate = validateMapScript(base([], { triggers: [trigger("t1", { conditions: { args: {
    weather: str("snow") }, k: "is", pred: "weatherIs" } })] }), { catalog, mapKind: "home" });
  assert.deepEqual([plain.scriptReadsEnvironment, weather.scriptReadsEnvironment, predicate.scriptReadsEnvironment],
    [false, true, true]);
});

test("a malformed document stops after the shape pass", () => {
  const result = validateMapScript({ version: 2 }, { mapKind: "home" });
  assert.equal(result.ready, false);
  assert.ok(result.errors.every(issue => issue.code === "invalidShape"));
  assert.equal(validateMapScript(null, { mapKind: "home" }).ready, false);
});

test("a hidden quest needs no title and a boolean literal stays boolean", () => {
  const script = base([doStep("s1", "setInvulnerable", { actor: { ...typeSelector("soldier:archer"), owner: player1 },
    on: bool(true) })], { quests: { ...emptyScript().quests, quests: [{ ...quest("q1"), title: undefined,
    visibility: "hidden" }] } });
  assert.deepEqual(validateMapScript(script, { catalog, mapKind: "campaign" }).errors, []);
});

test("endMap exits: unchecked without exit ids, a plain victory needs none, only exit references fit", () => {
  const codes = (script: unknown, context: Partial<ScriptValidationContext> = {}) =>
    issuesOf(script, "campaign", context).map(issue => issue.code).filter(code => code !== "unusedVariable");
  assert.deepEqual(codes(endMap("exit-9")), []);
  assert.deepEqual(codes(base([doStep("s1", "endMap", { outcome: str("victory") })]), { exitIds: new Set() }), []);
  assert.deepEqual(codes(base([doStep("s1", "endMap", { exit: str("exit-1"), outcome: str("victory") })])),
    ["slotTypeMismatch"]);
  assert.deepEqual(codes(base([doStep("s1", "endMap", { exit: ref("quest", "q1"), outcome: str("victory") })])),
    ["slotTypeMismatch"]);
});

/** A used spawn actor with the given look and display name (owner 2026-11-13: pirate and bandit names). */
const namedActor = (look: object, displayName?: unknown): MapScript => {
  const script = commanderAppear();
  script.actors[0] = { ...script.actors[0]!, look, type: { type: ref("content", "soldier:archer") },
    ...(displayName === undefined ? {} : { displayName }) } as MapScript["actors"][number];
  return script;
};
const codesAt = (script: MapScript, path: string) => issuesOf(script).filter(issue => issue.path.startsWith(path))
  .map(issue => `${issue.severity}:${issue.code}`);

test("an actor's display name: free text per language within the limit, English required, no translation warning",
  () => {
    const limit = SCRIPT_LIMITS.actorDisplayNameLength;
    assert.deepEqual(codesAt(namedActor({ kind: "pirates" }, { en: "Redbeard" }), "actors[0]"), []);
    assert.deepEqual(codesAt(namedActor({ kind: "bandits" }, { en: "x".repeat(limit), hu: "Vörös Róka" }),
      "actors[0]"), []);
    assert.deepEqual(codesAt(namedActor({ kind: "pirates" }), "actors[0]"), [], "no name: the look default shows");
    assert.deepEqual(codesAt(namedActor({ kind: "pirates" }, { en: "  " }), "actors[0].displayName"),
      ["error:missingEnglishText"]);
    for (const malformed of [{ en: "x".repeat(limit + 1) }, { en: "Redbeard", hu: "y".repeat(limit + 1) },
      { hu: "Vörös" }, "Redbeard", { en: "Redbeard", "not a language": "x" }, { en: 7 }]) {
      const result = validateMapScript(namedActor({ kind: "pirates" }, malformed), { catalog, mapKind: "campaign" });
      assert.equal(result.ready, false, JSON.stringify(malformed));
      assert.ok(result.errors.some(issue => issue.path.startsWith("actors[0].displayName")), JSON.stringify(malformed));
    }
  });

test("actor display names default per look: pirates and bandits have an English name, nation looks have none", () => {
  const [pirate] = namedActor({ kind: "pirates" }).actors, [bandit] = namedActor({ kind: "bandits" }).actors;
  const [roman] = namedActor({ kind: "nation", nation: "roman" }).actors;
  assert.deepEqual(actorDisplayName(pirate!), { en: "Pirate" });
  assert.deepEqual(actorDisplayName(bandit!), { en: "Bandit" });
  assert.equal(actorDisplayName(roman!), null);
  assert.equal(defaultLookName({ kind: "ownerNation" }), null);
  const named = namedActor({ kind: "nation", nation: "roman" }, { en: "Marcus", hu: "Márkusz" });
  assert.deepEqual(actorDisplayName(named.actors[0]!), { en: "Marcus", hu: "Márkusz" });
  assert.deepEqual(actorDisplayName({ ...pirate!, displayName: { en: " " } }), { en: "Pirate" },
    "a blank name falls back to the look default");
  assert.deepEqual([...namedActorIds(named)], ["actor-c"]);
  assert.deepEqual([...namedActorIds(namedActor({ kind: "ownerNation" }))], []);
});
