import { mapRegionShape } from "../campaign/campaign-shape.ts";
import { CINEMATIC_LIMITS } from "../campaign/cinematics/constants.ts";
import { cameraShot, cinematicSequence } from "../campaign/cinematics/shape.ts";
import { FORMATS, formatVersionIssue } from "../formats.ts";
import {
  arrayOf, boolean, type Check, type CheckFields, checkValue, discriminatedUnion, enumOf, guard, integer, isPlainObject,
  isSafeTree, literal, nullable, number, objectOf, optional, string
} from "../validation/index.ts";
import {
  DAYS_PER_MONTH_MAX, DAYS_PER_WEEK, HOURS_PER_DAY, MINUTES_PER_DAY, MONTHS_PER_YEAR, QUEST_RESOURCES,
  SCRIPT_LIMITS, SCRIPT_MAX_SOLDIER_RANK, VARIABLE_TYPES
} from "./constants.ts";
import type { ScriptIssueSink } from "./issues.ts";
import {
  actionList, actorDisplayNameText, actorLook, actorTypeRef, BARE_STRING_REFERENCE, condition, count, editorName, expr,
  faction, goodsLines, playerFilter,
  positiveCount, questText, rewardLines, scriptId, scriptRef, slotRecord
} from "./shape-nodes.ts";

/** Structural check of a whole `MapScript` (trigger design §11.1: shape first, one walk, then the semantics). */

const nullableText = nullable(questText);
const minuteOfDay = integer(0, MINUTES_PER_DAY - 1);
const seconds = number({ min: 0, max: SCRIPT_LIMITS.maxCount });

const owner = discriminatedUnion("kind", { neutral: {}, slot: { faction } });
const actorBase: CheckFields = {
  color: optional(string({ maxLength: SCRIPT_LIMITS.identifierLength })),
  displayName: optional(actorDisplayNameText),
  id: scriptId,
  lifetime: enumOf(["keepIncarnation", "clearOnGone"]),
  name: editorName,
  speakerId: optional(scriptRef)
};
const fingerprint = objectOf({ cell: integer(0), content: scriptRef, objectId: integer(0) });
const actor = discriminatedUnion("binding", {
  placed: { ...actorBase, hiddenAtStart: boolean, objects: arrayOf(fingerprint, SCRIPT_LIMITS.actorMembers), owner },
  spawn: {
    ...actorBase,
    buildMode: optional(discriminatedUnion("kind", { construct: { seconds }, instant: {} })),
    count: integer(1, SCRIPT_LIMITS.actorMembers),
    look: actorLook,
    owner,
    place: objectOf({ facing: optional(number()), region: scriptRef }),
    respawn: enumOf(["refuse", "add"]),
    spawnAtStart: boolean,
    type: actorTypeRef
  }
});

const variable = objectOf({
  comment: optional(string({ maxLength: SCRIPT_LIMITS.textLength })),
  id: scriptId,
  initial: guard(value => isPlainObject(value) && typeof value.type === "string" && "value" in value,
    "An initial value is { type, value }"),
  maxLength: optional(integer(1, SCRIPT_LIMITS.arrayLength)),
  name: string({ maxLength: SCRIPT_LIMITS.identifierLength }),
  questVisible: optional(boolean),
  type: enumOf(VARIABLE_TYPES)
});

const event = objectOf({ kind: string({ maxLength: SCRIPT_LIMITS.identifierLength }),
  phrasing: optional(enumOf(["primary", "inverse"])), player: playerFilter, slots: slotRecord });
const trigger = objectOf({
  actions: actionList,
  comment: optional(string({ maxLength: SCRIPT_LIMITS.textLength })),
  concurrency: enumOf(["queue", "parallel", "ignore"]),
  conditions: condition,
  enabled: boolean,
  events: arrayOf(event, SCRIPT_LIMITS.eventsPerTrigger),
  folderId: nullable(scriptId),
  id: scriptId,
  name: editorName,
  runLimit: nullable(positiveCount)
});

const quantifier = enumOf(["any", "all"]);
const scenarioRule = { all: optional(boolean), holdSeconds: optional(seconds) };
const objective = discriminatedUnion("kind", {
  actionPerformed: { action: string({ maxLength: SCRIPT_LIMITS.identifierLength }), count: positiveCount,
    since: enumOf(["activation", "ever"]) },
  actorAppeared: { actor: scriptRef },
  actorDied: { actor: scriptRef, quantifier },
  actorGone: { actor: scriptRef, quantifier },
  actorLeftRegion: { actor: scriptRef, quantifier, region: scriptRef },
  actorReachedRegion: { actor: scriptRef, quantifier, region: scriptRef },
  areaReached: { region: scriptRef, unitFilter: enumOf(["any", "soldier", "commander"]) },
  buildingCompleted: { building: scriptRef, count: positiveCount },
  clockTime: { hour: number({ maxExclusive: HOURS_PER_DAY, min: 0 }) },
  condition: { condition, progress: nullable(objectOf({ current: expr, target: expr })) },
  counterReached: { counter: string({ maxLength: SCRIPT_LIMITS.identifierLength * 2 }),
    since: enumOf(["activation", "mapStart"]), target: positiveCount },
  defeat: {},
  elapsedTime: { seconds },
  enemiesDefeated: { ...scenarioRule, count: positiveCount },
  enemyBuildingDestroyed: { ...scenarioRule, buildingId: nullable(integer(0)) },
  mapStart: {},
  prerequisitesDone: {},
  scripted: {},
  soldierCount: { count: positiveCount, soldierType: nullable(scriptRef), stationed: optional(boolean) },
  stockLevel: { amount: positiveCount, building: optional(scriptRef), ware: scriptRef },
  victory: {},
  wareProduced: { amount: positiveCount, since: literal("activation"), ware: scriptRef }
});

const clockParts = { days: count, hours: integer(0, HOURS_PER_DAY - 1), minutes: minuteOfDay };
const deadline = discriminatedUnion("kind", {
  date: { at: expr },
  dateAfterActivation: clockParts,
  gameTime: { seconds },
  playTime: { seconds }
});
const retryAfterFail = boolean;
const repeat = discriminatedUnion("kind", {
  calendar: { day: optional(integer(1, DAYS_PER_MONTH_MAX)), minuteUtc: minuteOfDay,
    month: optional(integer(1, MONTHS_PER_YEAR)), retryAfterFail, weekday: optional(integer(0, DAYS_PER_WEEK - 1)) },
  interval: { ...clockParts, retryAfterFail },
  onCompletion: { maxClaims: nullable(positiveCount), retryAfterFail },
  once: { retryAfterFail }
});

const questRewards = objectOf({
  buildingUnlocks: arrayOf(integer(0), SCRIPT_LIMITS.actionsPerList),
  coins: count,
  decorations: arrayOf(objectOf({ amount: positiveCount, item: string({ maxLength: SCRIPT_LIMITS.nameLength,
    minLength: 1 }) })),
  gems: count,
  goods: goodsLines,
  settlers: optional(count),
  soldiers: optional(arrayOf(objectOf({ amount: positiveCount, rank: optional(integer(0, SCRIPT_MAX_SOLDIER_RANK)),
    type: string({ maxLength: SCRIPT_LIMITS.identifierLength }) }))),
  xp: count
});

const skipRule = discriminatedUnion("kind", { missingResource: { resource: enumOf(QUEST_RESOURCES) } });

const quest = objectOf({
  activation: optional(enumOf(["action", "auto"])),
  completeSequence: optional(scriptRef),
  cost: goodsLines,
  deadline: nullable(deadline),
  details: optional(objectOf({ benefit: nullableText, tips: nullableText })),
  failure: nullable(condition),
  groupId: optional(nullable(scriptId)),
  highlightRegion: optional(boolean),
  homeReward: optional(nullable(questRewards)),
  id: scriptId,
  imageId: optional(nullable(string({ maxLength: SCRIPT_LIMITS.nameLength }))),
  mapReward: optional(nullable(questRewards)),
  objective,
  onActivate: actionList,
  onFailure: actionList,
  onSuccess: actionList,
  optional: optional(boolean),
  prerequisites: optional(arrayOf(scriptRef, SCRIPT_LIMITS.quests)),
  repeat,
  skippableWhen: optional(nullable(skipRule)),
  startSequence: optional(scriptRef),
  text: optional(questText),
  title: optional(questText),
  unlock: optional(nullable(discriminatedUnion("kind", { playerLevel: { level: integer(1,
    SCRIPT_LIMITS.maxPlayerLevel) } }))),
  visibility: enumOf(["visible", "hidden"])
});

const group = objectOf({
  activation: enumOf(["parallel", "sequential"]),
  completionTopUp: nullable(literal("nextLevel")),
  id: scriptId,
  requiresGroups: arrayOf(scriptId, SCRIPT_LIMITS.questGroups),
  title: questText,
  unlock: nullable(discriminatedUnion("kind", { playerLevel: { level: integer(1, SCRIPT_LIMITS.maxPlayerLevel) } }))
});

const questBook = objectOf({
  daily: enumOf(["global", "off"]),
  dailyResetUtcMinutes: minuteOfDay,
  groups: arrayOf(group, SCRIPT_LIMITS.questGroups),
  id: scriptId,
  quests: arrayOf(quest, SCRIPT_LIMITS.quests),
  revision: integer(0),
  version: literal(1)
});

const homeReward = objectOf({
  id: scriptId,
  name: editorName,
  occurrence: discriminatedUnion("kind", {
    counter: { maxOccurrences: integer(1, SCRIPT_LIMITS.homeRewardOccurrences) },
    once: {},
    window: { repeat }
  }),
  rewards: rewardLines
});

const counter = integer(0);
const mapScript = objectOf({
  actors: arrayOf(actor, SCRIPT_LIMITS.actors),
  cameraShots: arrayOf(cameraShot, CINEMATIC_LIMITS.cameraShots),
  folders: arrayOf(objectOf({ id: scriptId, name: editorName, parentId: nullable(scriptId) }), SCRIPT_LIMITS.folders),
  homeRewards: arrayOf(homeReward, SCRIPT_LIMITS.homeRewards),
  nextIds: objectOf({ actor: counter, folder: counter, region: counter, reward: counter, trigger: counter,
    variable: counter }),
  quests: questBook,
  regions: arrayOf(mapRegionShape, SCRIPT_LIMITS.regions),
  revision: integer(0),
  scriptUid: string({ maxLength: SCRIPT_LIMITS.identifierLength, minLength: 1 }),
  sequences: arrayOf(cinematicSequence, CINEMATIC_LIMITS.sequences),
  triggers: arrayOf(trigger, SCRIPT_LIMITS.triggers),
  variables: arrayOf(variable, SCRIPT_LIMITS.variables),
  version: guard(value => formatVersionIssue(FORMATS.mapScript, value) === null, "Unsupported map script version")
});

const scriptBytes = (value: unknown) => {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Infinity;
  }
};

/**
 * Size, depth and structure of a stored script. Returns false when the semantic pass must not run (the document
 * is not a well-formed script); every problem is reported to `sink`.
 */
export const checkMapScriptShape = (value: unknown, sink: ScriptIssueSink): boolean => {
  if (!isSafeTree(value, SCRIPT_LIMITS.scriptDepth)) {
    sink.add("error", "scriptTooDeep", "", { limit: SCRIPT_LIMITS.scriptDepth });
    return false;
  }
  const bytes = scriptBytes(value);
  if (bytes > SCRIPT_LIMITS.scriptBytes) {
    sink.add("error", "scriptTooLarge", "", { bytes, limit: SCRIPT_LIMITS.scriptBytes });
    return false;
  }
  return checkNodeShape(mapScript, value, "", sink);
};

/** Runs a node check and reports its issues as `invalidShape`; true when the value conforms. */
export const checkNodeShape = (check: Check, value: unknown, path: string, sink: ScriptIssueSink) => {
  const issues = checkValue(check, value, path);
  for (const issue of issues) {
    if (issue.message === BARE_STRING_REFERENCE) sink.add("error", "bareStringReference", issue.path,
      { expected: "id" });
    else sink.add("error", "invalidShape", issue.path, { detail: issue.code });
  }
  return issues.length === 0;
};
