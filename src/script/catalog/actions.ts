import { MUSIC_MODES } from "../audio.ts";
import {
  ACTOR_FADE_THEN, AI_GOALS, AI_LEVELS, AI_MODES, AI_STYLES, BUILD_MODES, COLONY_END_REASONS, ENEMY_WAVE_ARRIVALS,
  HIGHLIGHT_UNTIL, KILL_ORDERS, LATER_ACTION_LANES, MAP_OUTCOMES, PASSENGER_KINDS, MOVE_STANCES, SPEAK_TIMINGS,
  STORE_ACTOR_MODES, WAIT_CONTAINER, WAIT_DONE, WAIT_MOVE, WAIT_PRESENCE, WEATHER_STATES
} from "../constants.ts";
import { type ActionDef, type CinematicMode, slot, type SlotDef } from "./slots.ts";

/**
 * Action catalogue (trigger design §5.2, keys §5.4). Actor slots name the action a target entry must list in
 * `actor.targetOf` (null = any scriptable entry). `wait` lists the outcomes of "wait until done"; `since: 2` marks
 * actions of the later lanes (TRG5b containers and ships, TRG5c combat, TRG5d props and wares, PRES0).
 */

interface ActionOptions {
  archipelago?: boolean;
  cinematic?: CinematicMode;
  emits?: readonly string[];
  environment?: boolean;
  pending?: string;
  presentation?: boolean;
  since?: 1 | 2;
  wait?: readonly string[] | null;
}

const action = (args: readonly SlotDef[], options: ActionOptions = {}): ActionDef => ({
  args,
  archipelago: options.archipelago,
  cinematic: options.cinematic ?? "guaranteed",
  emits: options.emits,
  environment: options.environment,
  pending: options.pending,
  presentation: options.presentation,
  since: options.since ?? 1,
  wait: options.wait ?? null
});

const actor = (requires: string | null = null) => slot.actor("actor", requires);
const instance = () => slot.actor("actor", null, { instanceOnly: true });
const ms = (name = "fadeMs") => slot.value(name, "number", true);
const ui = (args: readonly SlotDef[], options: ActionOptions = {}) =>
  action(args, { ...options, cinematic: "deferred", presentation: true });
/** Audio effects: presentation only like the UI actions, but they play at once, also inside a cinematic. */
const audio = (args: readonly SlotDef[]) => action(args, { cinematic: "native", presentation: true });
const quest = (emits: readonly string[]) => action([slot.ref("quest", "quest")], { emits });
const variable = (args: readonly SlotDef[]) => action([slot.ref("variable", "variable"), ...args],
  { emits: ["variableChanged"] });
const timer = (args: readonly SlotDef[] = []) => action([slot.ref("timer", "timer"), ...args]);
const board = () => action([slot.ref("multiboard", "multiboard"), slot.player("audience", true)]);
const { carry: CARRY, combat: COMBAT, containers: SHIPS } = LATER_ACTION_LANES;

export const ACTION_CATALOG = {
  // Presence (§5.2.1)
  spawn: action([
    slot.actorType("type", "spawn"), slot.value("count", "number", true), slot.player("owner"),
    slot.of("look", "look", true), slot.ref("at", "region"), slot.value("facing", "number", true), ms(),
    slot.ref("store", "variable", true), slot.choice("buildMode", BUILD_MODES, true),
    slot.value("buildSeconds", "number", true)
  ], { emits: ["actorAppeared"], wait: ["done", "blocked"] }),
  appear: action([instance(), ms()], { emits: ["actorAppeared"], wait: WAIT_PRESENCE }),
  fade: action([actor(), slot.value("ms", "number"), slot.choice("then", ACTOR_FADE_THEN),
    slot.value("clearVariables", "boolean", true)], { emits: ["actorGone"], wait: WAIT_PRESENCE }),
  despawn: action([actor(), ms()], { emits: ["actorGone"], wait: WAIT_PRESENCE }),
  kill: action([actor("kill"), slot.value("count", "number", true)],
    { emits: ["actorKilled", "actorGone"], wait: WAIT_PRESENCE }),
  killCount: action([actor("kill"), slot.value("count", "number"), slot.choice("order", KILL_ORDERS, true),
    slot.ref("region", "region", true)], { emits: ["actorKilled", "actorGone"] }),
  setOwner: action([actor("setOwner"), slot.player("owner")]),
  hide: action([actor(), slot.value("hidden", "boolean")]),
  setInvulnerable: action([actor("invulnerable"), slot.value("on", "boolean")]),

  // Units (§5.2.2)
  move: action([actor("move"), slot.ref("region", "region"), slot.choice("stance", MOVE_STANCES, true)],
    { emits: ["enteredRegion", "leftRegion"], wait: WAIT_MOVE }),
  teleport: action([actor("teleport"), slot.ref("region", "region"), slot.value("facing", "number", true)],
    { emits: ["enteredRegion", "leftRegion"] }),
  face: action([actor("face"), slot.value("angle", "number", true), slot.actor("target", null, {}, true)]),
  lookSpyglass: action([actor("spyglass"), slot.value("yawDeg", "number", true),
    slot.value("pitchDeg", "number", true), slot.actor("target", null, {}, true), slot.value("seconds", "number")],
  { emits: ["scoutLooked"], wait: WAIT_PRESENCE }),
  enterBuilding: action([actor("enterBuilding"), slot.actor("building", "enter", { kinds: ["building"] })],
    { ...SHIPS, wait: WAIT_CONTAINER }),
  leaveBuilding: action([actor("enterBuilding")], { ...SHIPS, wait: WAIT_CONTAINER }),
  boardShip: action([actor("board"), slot.actor("ship", "board")], { ...SHIPS, wait: WAIT_CONTAINER }),
  disembark: action([actor("board"), slot.ref("region", "region", true)], { ...SHIPS, wait: WAIT_CONTAINER }),
  attack: action([actor("attack"), slot.actor("target", "attackTarget")],
    { ...COMBAT, wait: ["done", "actorGone", "timeout"] }),
  dealDamage: action([actor("damage"), slot.value("amount", "number"), slot.actor("source", null, {}, true)],
    { ...COMBAT }),
  takeDamage: action([actor("damage"), slot.value("amount", "number"), slot.actor("source", null, {}, true)],
    { ...COMBAT }),
  cutTree: action([actor("cutTree"), slot.actor("tree", "cut", { kinds: ["tree", "plant"] })],
    { ...CARRY, wait: ["done", "targetGone", "unreachable", "timeout"] }),
  pickUp: action([actor("carry"), slot.actor("target", "pickUp")], { ...CARRY, wait: WAIT_CONTAINER }),
  putDown: action([actor("carry"), slot.ref("region", "region")], { ...CARRY, wait: WAIT_CONTAINER }),
  carryInto: action([actor("carry"), slot.actor("building", "enter", { kinds: ["building"] })],
    { ...CARRY, wait: WAIT_CONTAINER }),
  loadIntoShip: action([actor("carry"), slot.actor("ship", "board")], { ...CARRY, wait: WAIT_CONTAINER }),
  playClip: action([actor("playClip"), slot.value("clip", "string"), slot.value("loops", "number", true)],
    { wait: WAIT_DONE }),
  speak: action([slot.ref("speaker", "speaker", true), slot.actor("actor", null, {}, true), slot.value("text", "text"),
    slot.choice("timing", SPEAK_TIMINGS, true), slot.player("audience", true)], { cinematic: "native",
      wait: WAIT_DONE }),
  release: action([actor("move")]),

  // Buildings and ships (§5.2.3)
  constructBuilding: action([actor("construct"), slot.value("seconds", "number")],
    { emits: ["constructionCompleted"], wait: WAIT_DONE }),
  openDoor: action([actor("door"), slot.value("open", "boolean")]),
  addStock: action([actor("stock"), slot.value("ware", "ware"), slot.value("amount", "number")]),
  catapultTarget: action([actor("catapult"), slot.actor("target", "attackTarget")],
    { ...COMBAT, wait: ["done", "timeout"] }),
  sail: action([slot.actor("ship", "sail"), slot.of("to", "regionOrEdge")],
    { ...SHIPS, wait: ["done", "unreachable", "timeout"] }),
  dock: action([slot.actor("ship", "sail"), slot.actor("harbour", "dock")], { ...SHIPS, wait: WAIT_CONTAINER }),
  /**
   * Creates units or wares directly aboard a ship actor (owner 2026-11-11), within the deck capacity of the ship's
   * catalog entry; over capacity the outcome is `full`. `store` binds the new handles to an actor variable.
   */
  spawnAboard: action([slot.actor("ship", "cargo"), slot.actorType("type", "board", PASSENGER_KINDS, true),
    slot.value("count", "number", true), slot.of("cargo", "goods", true), slot.player("owner"),
    slot.of("look", "look", true), slot.ref("store", "variable", true)],
  { ...SHIPS, emits: ["actorAppeared"], wait: ["done", "full", "targetGone"] }),
  /**
   * Unloads passengers/wares at a harbour actor or a region; unloaded units become normal actors (controllable,
   * `actorUnloaded` fires per unit, `store` binds their handles).
   */
  unload: action([slot.actor("ship", "cargo"), slot.actor("harbour", "dock", {}, true),
    slot.ref("region", "region", true), slot.actor("selector", null, {}, true), slot.value("ware", "ware", true),
    slot.value("amount", "number", true), slot.ref("store", "variable", true)],
  { ...SHIPS, emits: ["actorUnloaded"], wait: WAIT_CONTAINER }),
  sink: action([slot.actor("ship", "sink"), ms()], { ...SHIPS, emits: ["shipSunk"], wait: WAIT_DONE }),

  // World and environment (§5.2.4)
  setWeather: action([slot.choice("state", WEATHER_STATES), slot.value("transitionSeconds", "number", true)],
    { cinematic: "native", environment: true }),
  timeOfDay: action([slot.value("hour", "number")], { cinematic: "native", environment: true }),
  lightning: action([slot.value("count", "number", true), slot.ref("region", "region", true)],
    { cinematic: "native", environment: true }),
  revealFog: action([slot.ref("region", "region")]),
  buildingAvailability: action([slot.content("building", ["building"]), slot.value("available", "boolean")],
    { cinematic: "deferred" }),
  enemyWave: action([slot.of("soldiers", "soldiers"), slot.choice("arrival", ENEMY_WAVE_ARRIVALS),
    slot.ref("from", "region"), slot.ref("target", "region")], { emits: ["actorAppeared"] }),
  /**
   * Sets the level a computer faction's military commander plays at (A14-5): it outranks the map's AI level, the
   * island's difficulty and the global difficulty, and acts from the faction's next decision. Saved.
   */
  setCommanderLevel: action([slot.player("faction"), slot.choice("level", AI_LEVELS)]),
  /**
   * Switches a computer faction's economy AI mid-map (enemy economy AI plan §5.2, EAI2c): the mode, the style and
   * the level, each kept when its slot is unset. `none` keeps everything standing and stops decisions. The faction
   * must be on the map (an AI entry, or authored units or buildings); the AI reads the change at its next due
   * decision, and a level also sets the faction's commander level. Saved.
   */
  setFactionAi: action([slot.player("faction"), slot.choice("mode", AI_MODES, true),
    slot.choice("style", AI_STYLES, true), slot.choice("level", AI_LEVELS, true)]),
  /** Pauses or resumes a computer faction's economy AI decisions (EAI2c); what it built keeps working. Saved. */
  factionAiPause: action([slot.player("faction"), slot.value("paused", "boolean")]),
  /**
   * Overrides a computer faction's strategic posture (enemy economy AI plan §5.2, EAI4c) for `seconds`, or until
   * the next `setFactionGoal` when unset. `attack` strikes a building the faction knows (inside `region` when set)
   * and scouts while it knows none; `defend` and `hold` post its free soldiers in `region` (its own base when
   * unset); `expand` makes it build as if no enemy were known. The AI reads the goal at its next decision. Saved.
   */
  setFactionGoal: action([slot.player("faction"), slot.choice("goal", AI_GOALS), slot.ref("region", "region", true),
    slot.value("seconds", "number", true)]),
  highlightRegion: action([slot.ref("region", "region"), slot.value("on", "boolean")], { cinematic: "native" }),
  spawnPresentation: action([slot.actorType("type", "spawn", ["whale", "fish", "critter", "bird", "butterfly"]),
    slot.ref("region", "region"), slot.value("clip", "string", true), slot.value("seconds", "number", true)],
  { pending: "PRES0", since: 2 }),
  /** Plays a catalog sound or an uploaded one once; `volume` 0..1 scales the player's effect volume. */
  playSound: audio([slot.audio("cue", "sound"), slot.value("volume", "number", true)]),
  /**
   * Switches the music to a catalog track or an uploaded one: the current music fades out, the new one fades in.
   * `mode` loop (default) repeats it, once plays it one time; `volume` 0..1 scales the player's music volume.
   */
  playMusic: audio([slot.audio("track", "music"), slot.value("volume", "number", true),
    slot.choice("mode", MUSIC_MODES, true), slot.value("fadeInSeconds", "number", true),
    slot.value("fadeOutSeconds", "number", true)]),
  stopMusic: audio([slot.value("fadeOutSeconds", "number", true)]),

  // Cinematics (§5.2.5)
  playSequence: action([slot.ref("sequence", "sequence")],
    { cinematic: "refused", emits: ["sequenceStarted", "sequenceFinished"], wait: WAIT_DONE }),

  // Quests, triggers, variables (§5.2.6)
  activateQuest: quest(["questActivated"]),
  completeQuest: quest(["questSucceeded"]),
  failQuest: quest(["questFailed"]),
  resetQuest: quest([]),
  setQuestVisible: action([slot.ref("quest", "quest"), slot.value("visible", "boolean")]),
  enableTrigger: action([slot.ref("trigger", "trigger")]),
  disableTrigger: action([slot.ref("trigger", "trigger")]),
  setVariable: variable([slot.value("index", "number", true), slot.variableValue("value", "variable")]),
  increaseVariable: variable([slot.value("index", "number", true), slot.value("amount", "number")]),
  decreaseVariable: variable([slot.value("index", "number", true), slot.value("amount", "number")]),
  arrayAppend: variable([slot.variableValue("value", "variable", "always")]),
  arrayRemoveAt: variable([slot.value("index", "number")]),
  arrayClear: variable([]),
  storeActor: action([slot.ref("variable", "variable"), slot.actor("selector", null),
    slot.choice("mode", STORE_ACTOR_MODES)], { emits: ["variableChanged"] }),
  timerStart: timer([slot.value("seconds", "number", true)]),
  timerPause: timer(),
  timerResume: timer(),
  timerStop: timer(),

  // Multiboards (§5.2.7)
  showMultiboard: board(),
  hideMultiboard: board(),
  collapseMultiboard: action([slot.ref("multiboard", "multiboard")]),
  expandMultiboard: action([slot.ref("multiboard", "multiboard")]),
  setMultiboardTitle: action([slot.ref("multiboard", "multiboard"), slot.value("text", "text")]),

  // Mail, notifications, rewards, map end (§5.2.8)
  sendMail: action([slot.player("audience", true), slot.value("title", "text"), slot.value("body", "text"),
    slot.of("attachmentsInfo", "goods", true)], { cinematic: "deferred" }),
  notify: action([slot.value("text", "text"), slot.value("important", "boolean", true)],
    { archipelago: true, cinematic: "deferred" }),
  grantMapReward: action([slot.of("rewards", "rewards")], { cinematic: "deferred" }),
  grantHomeReward: action([slot.ref("reward", "reward")], { cinematic: "deferred" }),
  // `exit`: a declared exit of the campaign map (BR2); absent = the implicit `victory` exit.
  endMap: action([slot.choice("outcome", MAP_OUTCOMES), slot.ref("storyQuest", "quest", true),
    slot.ref("exit", "exit", true)], { cinematic: "deferred" }),
  colonyEnd: action([slot.choice("reason", COLONY_END_REASONS)], { archipelago: true, cinematic: "deferred" }),

  // UI actions (§5.2.9; presentation only)
  openUi: ui([slot.of("target", "uiTarget"), slot.player("audience", true)]),
  closeUi: ui([slot.of("target", "uiTarget")]),
  highlightUi: ui([slot.value("anchor", "string"), slot.value("text", "text", true),
    slot.choice("until", HIGHLIGHT_UNTIL), slot.value("seconds", "number", true)], { wait: ["done", "timeout"] }),
  clearHighlights: ui([]),
  focusCamera: ui([slot.actor("actor", null, {}, true), slot.ref("region", "region", true)])
} as const satisfies Record<string, ActionDef>;

export type ScriptActionKind = keyof typeof ACTION_CATALOG;

export const isScriptActionKind = (kind: unknown): kind is ScriptActionKind =>
  typeof kind === "string" && Object.hasOwn(ACTION_CATALOG, kind);

export const actionDef = (kind: ScriptActionKind): ActionDef => ACTION_CATALOG[kind];
