import type { MapRegion } from "../src/campaign/campaign-regions.ts";
import type {
  MapScript, ScriptAction, ScriptQuest, ScriptTrigger, ScriptVariable
} from "../src/script/types/index.ts";
import { CONTENT_CATALOG_VIEW, type ScriptCatalogView } from "../src/script/validate.ts";
import { sequence } from "./cinematic-fixtures.ts";

/**
 * Map script fixtures: the design examples (trigger design §14, plus the owner's ship reinforcement example) as
 * complete scripts on the real content catalog, and small builders for rule fixtures.
 */

/** The real content catalog (units, ships and buildings landed with CAT5/CAT6/CAT7a). */
export const TEST_CATALOG: ScriptCatalogView = CONTENT_CATALOG_VIEW;

export const ref = <K extends string>(kind: K, id: string) => ({ id, k: "ref" as const, kind });
export const num = (value: number) => ({ k: "lit" as const, type: "number" as const, value });
export const str = (value: string) => ({ k: "lit" as const, type: "string" as const, value });
export const bool = (value: boolean) => ({ k: "lit" as const, type: "boolean" as const, value });
export const words = (en: string, hu = `${en} (hu)`) => ({ k: "text" as const, text: { en, hu } });
export const player1 = { faction: 0, kind: "slot" as const };

export const region = (id: string, x = 10): MapRegion =>
  ({ id, name: id, shape: { kind: "rect", maxX: x + 4, maxZ: x + 4, minX: x, minZ: x } });

export const numberVariable = (id: string, name: string): ScriptVariable =>
  ({ id, initial: { type: "number", value: 0 }, name, type: "number" });

export const quest = (id: string, fields: Partial<ScriptQuest> = {}): ScriptQuest => ({
  cost: [], deadline: null, failure: null, id, objective: { kind: "scripted" }, onActivate: [], onFailure: [],
  onSuccess: [], repeat: { kind: "once", retryAfterFail: false }, title: { en: `Quest ${id}`, hu: `Küldetés ${id}` },
  visibility: "visible", ...fields
});

export const trigger = (id: string, fields: Partial<ScriptTrigger> = {}): ScriptTrigger => ({
  actions: [], concurrency: "queue", conditions: { k: "all", of: [] }, enabled: true,
  events: [{ kind: "mapStarted", player: { kind: "any" }, slots: {} }], folderId: null, id, name: id, runLimit: null,
  ...fields
});

export const doStep = (id: string, op: string, args: Record<string, unknown>, extra: object = {}): ScriptAction =>
  ({ args, id, k: "do", op, ...extra }) as ScriptAction;

export const emptyScript = (fields: Partial<MapScript> = {}): MapScript => ({
  actors: [], cameraShots: [], folders: [], homeRewards: [],
  nextIds: { actor: 0, folder: 0, region: 0, reward: 0, trigger: 0, variable: 0 },
  quests: { daily: "off", dailyResetUtcMinutes: 0, groups: [], id: "test-book", quests: [], revision: 1, version: 1 },
  regions: [], revision: 1, scriptUid: "uid-test", sequences: [], triggers: [], variables: [], version: 1,
  ...fields
});

const book = (quests: ScriptQuest[]) => ({ ...emptyScript().quests, quests });
const instance = (id: string) => ({ actor: ref("actor", id), kind: "instance" as const });

/** §14.1 Hunter kills a deer-family animal → counter. */
export const huntCounter = (): MapScript => emptyScript({
  folders: [{ id: "folder-2", name: "Counters", parentId: null }],
  triggers: [{ actions: [doStep("s1", "increaseVariable", { amount: num(1), variable: ref("variable", "var-1") })],
    concurrency: "queue", conditions: { k: "all", of: [] }, enabled: true,
    events: [{ kind: "animalKilled", player: player1, slots: {
      killer: { kind: "type", type: { type: ref("content", "settler:hunter") } },
      victim: { family: ref("family", "animal.deer"), kind: "family", owner: { kind: "neutral" } }
    } }], folderId: "folder-2", id: "trigger-1", name: "Deer hunt counter", runLimit: null } as ScriptTrigger],
  variables: [numberVariable("var-1", "deerCount")]
});

/** §14.2 Escort the Nubian archer. */
export const escortArcher = (): MapScript => emptyScript({
  actors: [{ binding: "spawn", count: 1, id: "actor-4", lifetime: "keepIncarnation", look: { kind: "nation",
    nation: "nubian" }, name: "Nubian archer", owner: player1, place: { region: ref("region", "region-1") },
  respawn: "refuse", spawnAtStart: false, type: { rank: { max: 2, min: 2 }, type: ref("content", "soldier:archer") } }],
  quests: book([quest("escort", {
    deadline: { kind: "playTime", seconds: 900 },
    failure: { k: "not", of: { args: { actor: instance("actor-4") }, k: "is", pred: "actorAlive" } },
    objective: { actor: ref("actor", "actor-4"), kind: "actorReachedRegion", quantifier: "any",
      region: ref("region", "region-7") },
    onActivate: [doStep("s1", "appear", { actor: instance("actor-4"), fadeMs: num(800) }),
      doStep("s2", "playSequence", { sequence: ref("sequence", "seq-archer-intro") },
        { wait: { onFail: "continue", timeoutSeconds: 120 } })],
    onFailure: [doStep("s1", "sendMail", { body: words("The escort failed."), title: words("The archer fell") })],
    onSuccess: [doStep("s1", "speak", { actor: instance("actor-4"), speaker: ref("speaker", "archer"),
      text: { k: "text", text: { en: "We made it. Thank you!", hu: "Megérkeztünk. Köszönöm!" } } })],
    repeat: { kind: "once", retryAfterFail: true }
  })]),
  regions: [region("region-1"), region("region-7", 40)],
  sequences: [sequence("seq-archer-intro", { steps: [] })]
});

/** §14.3 Enemy flees by ship → victory after 4 s (TRG5b actions: shapes only, a warning says they do not run). */
export const chiefFlees = (): MapScript => emptyScript({
  actors: [
    { binding: "spawn", count: 1, id: "actor-chief", lifetime: "keepIncarnation", look: { kind: "bandits" },
      name: "Bandit chief", owner: { faction: 1, kind: "slot" }, place: { region: ref("region", "region-1") },
      respawn: "refuse", spawnAtStart: true, type: { type: ref("content", "soldier:heavy") } },
    { binding: "spawn", count: 1, id: "actor-raider", lifetime: "keepIncarnation", look: { kind: "pirates" },
      name: "Raider", owner: { faction: 1, kind: "slot" }, place: { region: ref("region", "region-1") },
      respawn: "refuse", spawnAtStart: true, type: { type: ref("content", "ship:raider") } }
  ],
  quests: book([quest("q-defend"), quest("q-fled")]),
  regions: [region("region-1")],
  triggers: [
    trigger("trigger-5", { actions: [
      doStep("s1", "boardShip", { actor: instance("actor-chief"), ship: instance("actor-raider") },
        { overridable: false, wait: { onFail: "continue", timeoutSeconds: 60 } }),
      doStep("s2", "sail", { ship: instance("actor-raider"), to: str("mapEdge") },
        { overridable: false, wait: { onFail: "continue", timeoutSeconds: 120 } })
    ], concurrency: "ignore", events: [{ kind: "questSucceeded", player: { kind: "any" },
      slots: { quest: ref("quest", "q-defend") } }], name: "Chief flees", runLimit: 1 }),
    trigger("trigger-6", { actions: [{ id: "s1", k: "wait", seconds: num(4) },
      doStep("s2", "endMap", { outcome: str("victory"), storyQuest: ref("quest", "q-fled") })],
    concurrency: "ignore", events: [{ kind: "shipLeftMap", player: { faction: 1, kind: "slot" },
      slots: { ship: instance("actor-raider") } }], name: "Fled → victory", runLimit: 1 })
  ]
});

/** §14.4 Plant 8 trees with a multiboard (`tree:oak` of the design is `tree:broadleafTree` in the catalog). */
export const plantTrees = (): MapScript => emptyScript({
  quests: book([quest("grove", {
    objective: { condition: { a: { k: "var", variable: ref("variable", "var-2") }, b: num(8), k: "compare",
      op: ">=" }, kind: "condition", progress: { current: { k: "var", variable: ref("variable", "var-2") },
      target: num(8) } },
    onActivate: [doStep("s1", "showMultiboard", { multiboard: ref("multiboard", "var-3") })],
    onSuccess: [doStep("s1", "hideMultiboard", { multiboard: ref("multiboard", "var-3") })]
  })]),
  triggers: [trigger("trigger-7", { actions: [doStep("s1", "increaseVariable", { amount: num(1),
    variable: ref("variable", "var-2") })], events: [{ kind: "treePlanted", player: player1, slots: {} }],
  name: "Count planting" })],
  variables: [numberVariable("var-2", "planted"), { id: "var-3", initial: { type: "multiboard", value: {
    audience: player1,
    cells: { done: { current: { k: "var", variable: ref("variable", "var-2") }, format: "fraction",
      target: num(8) }, task: { expr: { k: "cell", key: "rowLabel" }, format: "text" } },
    columns: [{ align: "left", header: { en: "Task", hu: "Feladat" }, id: "task", width: "auto" },
      { align: "right", header: { en: "Done", hu: "Kész" }, id: "done", width: 64 }],
    initiallyCollapsed: false, initiallyVisible: false,
    rows: { kind: "static", rows: [{ icon: ref("content", "tree:broadleafTree"), id: "trees",
      label: { en: "Plant trees", hu: "Ültess fákat" } }] },
    sort: null, title: { en: "Grove project", hu: "Liget projekt" }
  } }, name: "groveBoard", type: "multiboard" }]
});

/** §14.5 Colony expiration with a local notice (owner round 6). */
export const colonyHold = (): MapScript => emptyScript({
  quests: book([quest("colony.hold", {
    deadline: { days: 14, hours: 0, kind: "dateAfterActivation", minutes: 0 },
    onFailure: [doStep("s1", "colonyEnd", { reason: str("expired") }),
      doStep("s2", "notify", { important: bool(true), text: { k: "text", text: {
        en: "{island} has expired. Its remaining settlers, troops and goods returned home.",
        translationKey: "notice.colony.expired",
        values: { island: { expr: { args: {}, fn: "islandName", k: "fn" }, format: "text", kind: "expr" } }
      } } })],
    title: { en: "Hold the colony", translationKey: "quest.colony.hold.title" }
  })])
});

/** §14.6 Player clicks any sea star. */
export const seaStar = (): MapScript => emptyScript({
  quests: book([quest("q-beachcomber")]),
  triggers: [trigger("trigger-9", { actions: [doStep("s1", "completeQuest", { quest: ref("quest", "q-beachcomber") })],
    concurrency: "ignore", events: [{ kind: "shellPickedUp", player: player1, slots: { shell: { kind: "type",
      owner: { kind: "neutral" }, type: { type: ref("content", "shell:seaStar") } } } }],
    name: "Sea star found", runLimit: 1 })]
});

/** §14.7 Deer enters region → dialogue for player 1. */
export const deerSpring = (): MapScript => emptyScript({
  regions: [region("region-spring")],
  sequences: [sequence("seq-spring-deer", { steps: [] })],
  triggers: [trigger("trigger-10", {
    actions: [doStep("s1", "storeActor", { mode: str("replace"), selector: { key: "enteringActor", kind: "response" },
      variable: ref("variable", "var-deer") }),
    doStep("s2", "playSequence", { sequence: ref("sequence", "seq-spring-deer") },
      { wait: { onFail: "continue", timeoutSeconds: 60 } })],
    concurrency: "ignore", conditions: { k: "not", of: { args: {}, k: "is", pred: "cinematicActive" } },
    events: [{ kind: "enteredRegion", player: { kind: "neutral" }, slots: {
      region: ref("region", "region-spring"), subject: { family: ref("family", "animal.deer"), kind: "family" } } }],
    name: "Deer at the spring", runLimit: 1
  })],
  variables: [{ id: "var-deer", initial: { type: "actor", value: [] }, name: "deer", type: "actor" }]
});

/** §14.8 Open the quest window on a quest and wait for the build menu click. */
export const tutorialUi = (): MapScript => emptyScript({
  quests: book([quest("farm.wheat")]),
  triggers: [trigger("trigger-11", { actions: [
    doStep("s3", "openUi", { target: { kind: "quests", quest: ref("quest", "farm.wheat") } }),
    doStep("s4", "highlightUi", { anchor: str("bottomBar.build"), text: words("Open the build menu",
      "Nyisd meg az építés menüt"), until: str("clicked") }, { wait: { onFail: "continue", timeoutSeconds: 120 } }),
    { cond: { a: { k: "resp", key: "outcome" }, b: str("done"), k: "compare", op: "==" }, else: [], id: "s5", k: "if",
      then: [doStep("s6", "highlightUi", { anchor: str("build.tab.food"), seconds: num(10),
        until: str("seconds") })] }
  ], name: "Tutorial build" })]
});

/** Owner addition: reinforcements arrive by ship, unload at the harbour region, then march to the gate. */
export const shipReinforcements = (): MapScript => emptyScript({
  actors: [{ binding: "spawn", count: 1, id: "actor-ship", lifetime: "keepIncarnation", look: { kind: "ownerNation" },
    name: "Relief ship", owner: player1, place: { region: ref("region", "region-sea") }, respawn: "refuse",
    spawnAtStart: true, type: { type: ref("content", "ship:sailingShip") } }],
  regions: [region("region-sea", 2), region("region-dock", 20), region("region-gate", 40)],
  triggers: [
    trigger("trigger-20", { actions: [
      doStep("s1", "spawnAboard", { count: num(6), owner: player1, ship: instance("actor-ship"),
        store: ref("variable", "var-reinforcements"), type: { rank: { max: 1, min: 1 },
          type: ref("content", "soldier:shield") } }, { wait: { onFail: "stop", timeoutSeconds: 5 } }),
      doStep("s2", "sail", { ship: instance("actor-ship"), to: ref("region", "region-dock") },
        { wait: { onFail: "stop", timeoutSeconds: 300 } }),
      doStep("s3", "unload", { region: ref("region", "region-dock"), ship: instance("actor-ship"),
        store: ref("variable", "var-reinforcements") }, { wait: { onFail: "continue", timeoutSeconds: 120 } }),
      doStep("s4", "move", { actor: { kind: "variable", variable: ref("variable", "var-reinforcements") },
        region: ref("region", "region-gate") }, { wait: { onFail: "continue", timeoutSeconds: 300 } })
    ], name: "Reinforcements", runLimit: 1 }),
    trigger("trigger-21", { actions: [doStep("s1", "storeActor", { mode: str("add"),
      selector: { key: "triggeringActor", kind: "response" }, variable: ref("variable", "var-landed") })],
    events: [{ kind: "actorUnloaded", player: player1, slots: { ship: instance("actor-ship") } }],
    name: "Count landed" }),
    trigger("trigger-22", { actions: [doStep("s1", "storeActor", { mode: str("replace"), selector: { kind: "query",
      query: { from: { family: ref("family", "ship"), kind: "family", owner: player1 },
        pick: { kind: "nearest", to: ref("region", "region-gate") }, state: ["docked"] } },
      variable: ref("variable", "var-nearest-ship") })],
    conditions: { a: { args: { ship: instance("actor-ship") }, fn: "capacityLeft", k: "fn" }, b: num(0), k: "compare",
      op: ">" },
    name: "Nearest docked ship" })
  ],
  variables: [
    { id: "var-reinforcements", initial: { type: "actorGroup", value: [] }, maxLength: 8, name: "reinforcements",
      type: "actorGroup" },
    { id: "var-landed", initial: { type: "actorGroup", value: [] }, maxLength: 8, name: "landed",
      type: "actorGroup" },
    { id: "var-nearest-ship", initial: { type: "actor", value: [] }, name: "nearestShip", type: "actor" }
  ]
});

export const HOLD_SECONDS = 300;
const holdTimer = ref("timer", "var-hold");
const soldiersInPass = { args: { region: ref("region", "region-pass"), selector: { family: ref("family", "soldier"),
  kind: "family" as const, owner: player1 } }, fn: "countInRegion" as const, k: "fn" as const };
const passEvent = (kind: "enteredRegion" | "leftRegion") => ({ kind, player: player1, slots: {
  region: ref("region", "region-pass"), subject: { family: ref("family", "soldier"), kind: "family" as const } } });

/**
 * EXT-TIMER: hold the pass for 5 minutes. The countdown runs while a soldier of the player stands in the region,
 * pauses when the last one leaves, and its expiry completes the quest; a board shows the remaining time.
 */
export const holdRegion = (): MapScript => emptyScript({
  quests: book([quest("hold", {
    onActivate: [doStep("s1", "showMultiboard", { multiboard: ref("multiboard", "var-hold-board") })],
    onSuccess: [doStep("s1", "hideMultiboard", { multiboard: ref("multiboard", "var-hold-board") })]
  })]),
  regions: [region("region-pass")],
  triggers: [
    trigger("trigger-30", { actions: [{ cond: { a: { args: { timer: holdTimer }, fn: "timerRemaining", k: "fn" },
      b: num(0), k: "compare", op: ">" }, else: [doStep("s3", "timerStart", { timer: holdTimer })], id: "s1", k: "if",
    then: [doStep("s2", "timerResume", { timer: holdTimer })] }],
    conditions: { args: { quest: ref("quest", "hold"), state: str("active") }, k: "is", pred: "questIs" },
    events: [passEvent("enteredRegion")], name: "Hold: soldiers in the pass" }),
    trigger("trigger-31", { actions: [doStep("s1", "timerPause", { timer: holdTimer })],
      conditions: { a: soldiersInPass, b: num(0), k: "compare", op: "==" }, events: [passEvent("leftRegion")],
      name: "Hold: pass abandoned" }),
    trigger("trigger-32", { actions: [doStep("s1", "completeQuest", { quest: ref("quest", "hold") })],
      events: [{ kind: "timerExpired", player: { kind: "any" }, slots: { timer: holdTimer } }],
      name: "Hold: time is up", runLimit: 1 })
  ],
  variables: [
    { id: "var-hold", initial: { type: "timer", value: { autoStart: false, periodic: false, seconds: HOLD_SECONDS,
      window: null } }, name: "holdTimer", type: "timer" },
    { id: "var-hold-board", initial: { type: "multiboard", value: {
      audience: player1,
      cells: { left: { expr: { args: { timer: holdTimer }, fn: "timerRemaining", k: "fn" }, format: "countdown" },
        task: { expr: { k: "cell", key: "rowLabel" }, format: "text" } },
      columns: [{ align: "left", header: { en: "Task", hu: "Feladat" }, id: "task", width: "auto" },
        { align: "right", header: { en: "Time left", hu: "Hátralévő idő" }, id: "left", width: 72 }],
      initiallyCollapsed: false, initiallyVisible: false,
      rows: { kind: "static", rows: [{ id: "hold", label: { en: "Hold the pass", hu: "Tartsd a szorost" } }] },
      sort: null, title: { en: "Defence of the pass", hu: "A szoros védelme" }
    } }, name: "holdBoard", type: "multiboard" }
  ]
});

/** Every example with the map kind it is authored for. */
export const DESIGN_EXAMPLES = [
  { kind: "home", name: "14.1 hunt counter", script: huntCounter },
  { kind: "campaign", name: "14.2 escort archer", script: escortArcher },
  { kind: "campaign", name: "14.3 chief flees", script: chiefFlees },
  { kind: "home", name: "14.4 plant trees", script: plantTrees },
  { kind: "colony", name: "14.5 colony hold", script: colonyHold },
  { kind: "home", name: "14.6 sea star", script: seaStar },
  { kind: "campaign", name: "14.7 deer spring", script: deerSpring },
  { kind: "home", name: "14.8 tutorial UI", script: tutorialUi },
  { kind: "campaign", name: "14.9 ship reinforcements", script: shipReinforcements },
  { kind: "campaign", name: "EXT-TIMER hold region", script: holdRegion }
] as const;
