import { SHIP_LOADS } from "../constants.ts";
import type { ScriptFunctionKind } from "../types/values.ts";
import { type FunctionDef, slot } from "./slots.ts";

/**
 * Read-only world functions (trigger design §4.4, §5.3). Counts read the type/family live index or cached counters
 * (QU §7.2), never a scan; `random` draws from the script's own saved stream.
 */

const selector = () => slot.actor("selector", null);
const actor = (name = "actor") => slot.actor(name, null);
const arrayVariable = () => slot.ref("variable", "variable");

export const FUNCTION_CATALOG = {
  count: { args: [selector()], result: "number" },
  countInRegion: { args: [selector(), slot.ref("region", "region")], result: "number" },
  health: { args: [actor()], result: "number" },
  healthPercent: { args: [actor()], result: "number" },
  owner: { args: [actor()], result: "player" },
  isAlive: { args: [actor()], result: "boolean" },
  isHidden: { args: [actor()], result: "boolean" },
  typeOf: { args: [actor()], result: "actorType" },
  stock: { args: [slot.value("ware", "ware"), slot.actorType("building", null, ["building"], true)],
    result: "number" },
  buildingCount: { args: [slot.actorType("type", null, ["building"]), slot.value("level", "number", true),
    slot.player("owner", true)], result: "number" },
  soldierCount: { args: [slot.actorType("type", null, ["soldier"], true), slot.value("rank", "number", true),
    slot.player("owner", true)], result: "number" },
  questState: { args: [slot.ref("quest", "quest")], result: "string" },
  questClaims: { args: [slot.ref("quest", "quest")], result: "number" },
  elapsedSeconds: { args: [], result: "number" },
  hour: { args: [], environment: true, result: "number" },
  random: { args: [slot.value("min", "number"), slot.value("max", "number")], result: "number" },
  length: { args: [arrayVariable()], result: "number" },
  contains: { args: [arrayVariable(), slot.variableValue("value", "variable", "always")], result: "boolean" },
  indexOf: { args: [arrayVariable(), slot.variableValue("value", "variable", "always")], result: "number" },
  timerRemaining: { args: [slot.ref("timer", "timer")], result: "number" },
  playerName: { args: [slot.player("player")], result: "text" },
  distance: { args: [actor("a"), actor("b")], result: "number" },
  islandName: { args: [], result: "text" },
  /** Passengers or ware boxes aboard a ship actor (owner 2026-11-11). */
  cargoCount: { args: [slot.actor("ship", null), slot.choice("load", SHIP_LOADS, true)], result: "number" },
  /** Free deck capacity from the ship's catalog entry minus what is aboard. */
  capacityLeft: { args: [slot.actor("ship", null), slot.choice("load", SHIP_LOADS, true)], result: "number" },
  /** Buildings of one computer faction, of one type when `type` is set (enemy economy AI plan §5.2, EAI4c). */
  factionBuildingCount: { args: [slot.player("faction"), slot.actorType("type", null, ["building"], true)],
    result: "number" },
  /** Soldiers of one computer faction. */
  factionSoldierCount: { args: [slot.player("faction")], result: "number" },
  /**
   * What a computer faction plays for: its running `setFactionGoal` (`AI_GOALS`), else its own posture (`grow`, or
   * `fortify` while it knows of an enemy soldier); nothing for a faction whose AI takes no decisions.
   */
  factionPosture: { args: [slot.player("faction")], result: "string" }
} as const satisfies Record<ScriptFunctionKind, FunctionDef>;

export const isScriptFunctionKind = (kind: unknown): kind is ScriptFunctionKind =>
  typeof kind === "string" && Object.hasOwn(FUNCTION_CATALOG, kind);

export const functionDef = (kind: ScriptFunctionKind): FunctionDef => FUNCTION_CATALOG[kind];
