import { FORMATS, formatVersionIssue } from "../formats.ts";
import {
  arrayOf, boolean, type Check, checkValue, enumOf, guard, integer, isPlainObject, literal, nullable, objectOf,
  recordOf, string, type ValidationIssue
} from "../validation/index.ts";
import { MAP_KINDS, QUEST_STATES, SCRIPT_LIMITS } from "./constants.ts";
import { questText, scriptId } from "./shape-nodes.ts";

/**
 * Envelope checks of the per-island script state and the player-wide quest digests (owner 2026-11-11, §6.14). The
 * run state body itself is checked by the engine's loader (TRG2); here only its version and the island fields.
 */

const islandKey = string({ maxLength: SCRIPT_LIMITS.identifierLength, minLength: 1 });
const utc = integer(0);

const runStateEnvelope: Check = (value, path, sink) => {
  if (!isPlainObject(value)) {
    sink.add("type", path, "A run state is an object");
    return;
  }
  if (formatVersionIssue(FORMATS.scriptRunState, value.version) !== null)
    sink.add("literal", `${path}.version`, "Unsupported run state version");
  if (!Number.isSafeInteger(value.scriptTick) || (value.scriptTick as number) < 0)
    sink.add("range", `${path}.scriptTick`, "The script clock is a tick count");
};

const islandScriptState = objectOf({
  islandKey,
  leftAtTick: integer(0),
  leftAtUtc: utc,
  mapKind: enumOf(MAP_KINDS),
  runState: runStateEnvelope,
  version: literal(1)
});

const digest = objectOf({
  bookId: scriptId,
  islandKey,
  mapKind: enumOf(MAP_KINDS),
  quests: arrayOf(objectOf({
    claimable: boolean, deadlineUtc: nullable(utc), questId: scriptId, state: enumOf(QUEST_STATES), title: questText
  }), SCRIPT_LIMITS.quests),
  updatedAtUtc: utc
});

const playerScriptState = objectOf({
  announcedColonyExpiries: arrayOf(guard(value => typeof value === "string"), SCRIPT_LIMITS.quests),
  digests: recordOf(digest, { maxEntries: SCRIPT_LIMITS.islands }),
  version: literal(1)
});

export const checkIslandScriptState = (value: unknown): ValidationIssue[] =>
  checkValue(islandScriptState, value, "islandScriptState");

export const checkPlayerScriptState = (value: unknown): ValidationIssue[] =>
  checkValue(playerScriptState, value, "playerScriptState");
