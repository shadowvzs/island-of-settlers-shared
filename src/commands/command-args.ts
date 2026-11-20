import { identifier } from "../campaign/campaign-shape-checks.ts";
import { isHomeBuildingRules } from "../game-settings/building-availability.ts";
import { isSimRules } from "../game-settings/game-settings-shape.ts";
import { isRoadDecorationAction } from "../road-decoration-custody.ts";
import { isFiniteNumber, isPlainObject, isSafeIntegerFrom } from "../validation/guards.ts";
import { arrayOf, type Check, checkValue, guard } from "../validation/schema.ts";
import { homeClaimConfirmArgs } from "./home-claim-confirm-command.ts";
import { questClaimArgs } from "./quest-claim-command.ts";

/**
 * Argument shapes of recorded commands, named so the manifest stays plain serializable data. A shape checks
 * the whole argument array; `any` keeps today's untyped acceptance (only an array is required). Add a shape
 * here when a command gains a typed payload, then name it in that command's manifest entry.
 */
const nothing: Check = guard(() => false, "No arguments are accepted");

/** Road decoration transforms never take an item ID or transfer inventory ownership. */
const roadDecorationRotate: Check = guard(args => Array.isArray(args) && args.length === 1 &&
  isRoadDecorationAction({ kind: "rotate", uid: args[0] }));

const roadDecorationMove: Check = guard(args => Array.isArray(args) && args.length === 3 &&
  isRoadDecorationAction({ kind: "move", uid: args[0], position: args[1], yaw: args[2] }));

/** `scriptUiAck`: one highlight effect id `ui:<runId>:<stepId>:<scriptTick>` (trigger design §5.2.9, TRG9). */
const SCRIPT_UI_EFFECT_ID = /^ui:\d{1,9}:[A-Za-z][A-Za-z0-9._:-]{0,63}:\d{1,12}$/;
const scriptUiAck: Check = guard(args => Array.isArray(args) && args.length === 1 &&
  typeof args[0] === "string" && SCRIPT_UI_EFFECT_ID.test(args[0]));

/** Cinematic sequence and step ids (CIN1 identifiers). */
const isCinematicId = (value: unknown) => checkValue(identifier, value).length === 0;

/** `applyCinematicStep`: the active sequence id and its next world step id (CIN4). */
const cinematicStep: Check = guard(args => Array.isArray(args) && args.length === 2 &&
  isCinematicId(args[0]) && isCinematicId(args[1]));

/** `endCinematic`: the active sequence id and whether the player skipped it (a reload counts as a skip). */
const cinematicEnd: Check = guard(args => Array.isArray(args) && args.length === 2 &&
  isCinematicId(args[0]) && typeof args[1] === "boolean");

/** `adoptGameRules`: one complete pinned rules document (GS2). */
const gameRulesAdopt: Check = guard(args => Array.isArray(args) && args.length === 1 && isSimRules(args[0]));

/** `setHomeBuildingRules`: the player's home-island building rules (MAP BUILDING AVAILABILITY). */
const homeBuildingRules: Check = guard(args => Array.isArray(args) && args.length === 1 &&
  isHomeBuildingRules(args[0]));

const isCount = (value: unknown) => isSafeIntegerFrom(value, 0);

const isFactionDraft = (value: unknown) => isPlainObject(value) && isCount(value.typeId) &&
  isFiniteNumber(value.x) && isFiniteNumber(value.z) &&
  (value.rotation === undefined || Number.isSafeInteger(value.rotation));

/** One reserve line `{ count, rank, type }`; the simulation checks the troop type and the limits. */
const isFactionStartTroop = (value: unknown) => isPlainObject(value) && isCount(value.count) &&
  isCount(value.rank) && typeof value.type === "string";

const isFactionStartKit = (value: unknown) => isPlainObject(value) &&
  (value.settlers === undefined || isCount(value.settlers)) &&
  (value.soldiers === undefined || (Array.isArray(value.soldiers) && value.soldiers.every(isFactionStartTroop))) &&
  (value.stock === undefined || (isPlainObject(value.stock) && Object.values(value.stock).every(isCount)));

/** `aiPlace` (EAI1d): a computer faction, its plot and, for a finished building, the start kit. */
const aiPlace: Check = guard(args => Array.isArray(args) && (args.length === 2 || args.length === 3) &&
  isSafeIntegerFrom(args[0], 1) && isFactionDraft(args[1]) &&
  (args.length === 2 || isFactionStartKit(args[2])));

/** Each shape's refusal text is part of the verifier's mismatch reasons (tests and tools compare it). */
export const COMMAND_ARGS = {
  aiPlace: { check: aiPlace, problem: "Invalid faction building" },
  any: null,
  cinematicEnd: { check: cinematicEnd, problem: "Invalid cinematic end" },
  cinematicStep: { check: cinematicStep, problem: "Invalid cinematic step" },
  gameRulesAdopt: { check: gameRulesAdopt, problem: "Invalid game rules" },
  homeBuildingRules: { check: homeBuildingRules, problem: "Invalid building rules" },
  homeClaimConfirm: { check: homeClaimConfirmArgs, problem: "Invalid home reward confirmation" },
  questClaim: { check: questClaimArgs, problem: "Invalid quest claim" },
  roadDebugUpgrade: { check: arrayOf(nothing, 0), problem: "Road debug upgrade accepts no arguments" },
  roadDecorationMove: { check: roadDecorationMove, problem: "Invalid road decoration transform" },
  roadDecorationRotate: { check: roadDecorationRotate, problem: "Invalid road decoration transform" },
  scriptUiAck: { check: scriptUiAck, problem: "Invalid script UI acknowledgement" }
} as const satisfies Record<string, { check: Check; problem: string } | null>;

export type CommandArgsShape = keyof typeof COMMAND_ARGS;

/** Why `args` does not fit `shape` (the verifier's refusal text), or null when it fits. */
export const commandArgsProblem = (shape: CommandArgsShape, args: unknown): string | null => {
  if (!Array.isArray(args)) return "Command arguments must be an array";
  const rule = COMMAND_ARGS[shape];
  if (!rule) return null;
  return checkValue(rule.check, args).length ? rule.problem : null;
};
