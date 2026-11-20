import {
  arrayOf, boolean, type Check, type CheckFields, discriminatedUnion, enumOf, guard, integer, isPlainObject, literal,
  nullable, number, objectOf, optional, recordOf, string
} from "../validation/index.ts";
import {
  ACTOR_RESPONSE_KEYS, ACTOR_STATE_FILTERS, CELL_CONTEXT_TYPES, CELL_FORMATS, COMPARE_OPERATORS,
  CONTENT_NAME_FORMS, LANGUAGE_CODE_PATTERN, MATH_OPERATORS,
  QUEST_TEXT_RESERVED_FIELDS, RESPONSE_TYPES, ROUND_MODES, SCRIPT_ID_PATTERN, SCRIPT_LIMITS, SCRIPT_NAME_PATTERN,
  SCRIPT_MAX_SOLDIER_RANK, SCRIPT_REF_KINDS, SCRIPT_TRANSLATION_KEY_PATTERN
} from "./constants.ts";

/**
 * Structural checks of the recursive script nodes (trigger design §4.2–§4.8) on the shared validation kit.
 * Positions typed by a catalogue slot (event slots, action, predicate and function arguments) are only "data"
 * here; the semantic pass checks them against their slot type with the node checks below.
 */

/** Defers to a check defined later (recursive node types). */
const lazy = (get: () => Check): Check => (value, path, sink) => get()(value, path, sink);

export const scriptId = string({ maxLength: SCRIPT_LIMITS.identifierLength, minLength: 1, pattern: SCRIPT_ID_PATTERN });
export const editorName = string({ maxLength: SCRIPT_LIMITS.nameLength });
export const localName = string({ maxLength: SCRIPT_LIMITS.identifierLength, pattern: SCRIPT_NAME_PATTERN });
export const count = integer(0, SCRIPT_LIMITS.maxCount);
export const positiveCount = integer(1, SCRIPT_LIMITS.maxCount);
export const faction = integer(0, SCRIPT_LIMITS.maxFaction);
const finite = number();
const keyText = string({ maxLength: SCRIPT_LIMITS.identifierLength, minLength: 1 });

/** A catalogue-typed position: an object, an array or null; the slot type decides the rest. */
export const slotValue = guard(value => value === null || typeof value === "string" || isPlainObject(value) ||
  Array.isArray(value), "A slot holds an object, a list or null");
export const slotRecord = recordOf(slotValue, { maxEntries: SCRIPT_LIMITS.slotsPerNode });

/** The message a bare string in a reference position carries; the shape pass reports it as `bareStringReference`. */
export const BARE_STRING_REFERENCE = "A reference is { k: \"ref\", kind, id }, not a bare string";
const refFields = objectOf({ id: scriptId, k: literal("ref"), kind: enumOf(SCRIPT_REF_KINDS) });
export const scriptRef: Check = (value, path, sink) => {
  if (typeof value === "string") sink.add("type", path, BARE_STRING_REFERENCE);
  else refFields(value, path, sink);
};

const playerVariants: Readonly<Record<string, CheckFields>> = {
  alliesOf: { faction, includeSelf: boolean },
  any: {},
  computers: {},
  enemiesOf: { faction },
  humans: {},
  neutral: {},
  response: { key: literal("triggeringPlayer") },
  slot: { faction }
};
export const playerFilter = discriminatedUnion("kind", playerVariants);

const range = objectOf({ max: optional(integer(0, SCRIPT_LIMITS.maxCount)), min: optional(integer(0)) });
export const actorTypeRef = objectOf({
  level: optional(range),
  nation: optional(string({ maxLength: SCRIPT_LIMITS.identifierLength, minLength: 1 })),
  rank: optional(range),
  type: scriptRef,
  variant: optional(objectOf({ axis: enumOf(["finish", "form"]), value: keyText }))
});

const member = optional(enumOf(["all", "any"]));
const selector: Check = lazy(() => actorSelector);
/** A selector or a region reference (the `nearest` anchor). */
const selectorOrRef: Check = (value, path, sink) => {
  if (isPlainObject(value) && value.k === "ref") scriptRef(value, path, sink);
  else selector(value, path, sink);
};
const queryShape = objectOf({
  from: selector,
  includeGone: optional(boolean),
  limit: optional(integer(1, SCRIPT_LIMITS.forEachMax)),
  pick: discriminatedUnion("kind", { all: {}, first: {}, nearest: { to: selectorOrRef }, random: {} }),
  state: optional(arrayOf(enumOf(ACTOR_STATE_FILTERS), ACTOR_STATE_FILTERS.length))
});
export const actorSelector: Check = discriminatedUnion("kind", {
  family: { family: scriptRef, owner: optional(playerFilter), region: optional(scriptRef) },
  instance: { actor: scriptRef, member },
  local: { name: localName },
  query: { query: queryShape },
  response: { key: enumOf(ACTOR_RESPONSE_KEYS) },
  type: { owner: optional(playerFilter), region: optional(scriptRef), type: actorTypeRef },
  variable: { member, variable: scriptRef }
});

const expr: Check = lazy(() => exprCheck);


const questTextValue = discriminatedUnion("kind", {
  content: { content: scriptRef, form: enumOf(CONTENT_NAME_FORMS) },
  expr: { expr, format: enumOf(CELL_FORMATS) },
  number: { value: finite }
});

const languageEntry = (language: string, value: unknown, path: string, sink: Parameters<Check>[2]) => {
  const [translationKey, values] = QUEST_TEXT_RESERVED_FIELDS;
  if (language === translationKey) string({ pattern: SCRIPT_TRANSLATION_KEY_PATTERN })(value, path, sink);
  else if (language === values) recordOf(questTextValue, { maxEntries: SCRIPT_LIMITS.slotsPerNode })(value, path, sink);
  else if (!LANGUAGE_CODE_PATTERN.test(language)) sink.add("pattern", path, "Unknown language code");
  else string({ maxLength: SCRIPT_LIMITS.textLength })(value, path, sink);
};

/** QuestText: English required, other language codes, plus the reserved `translationKey` and `values`. */
export const questText: Check = (value, path, sink) => {
  if (!isPlainObject(value) || typeof value.en !== "string") {
    sink.add("type", path, "A text is { en, …languages }");
    return;
  }
  for (const [language, entry] of Object.entries(value)) languageEntry(language, entry, `${path}.${language}`, sink);
};

const displayNameEntry = string({ maxLength: SCRIPT_LIMITS.actorDisplayNameLength });

/** An actor's display name: English required, other language codes, every entry within the name length. */
export const actorDisplayNameText: Check = (value, path, sink) => {
  if (!isPlainObject(value) || typeof value.en !== "string") {
    sink.add("type", path, "A display name is { en, …languages }");
    return;
  }
  for (const [language, entry] of Object.entries(value)) {
    if (LANGUAGE_CODE_PATTERN.test(language)) displayNameEntry(entry, `${path}.${language}`, sink);
    else sink.add("pattern", `${path}.${language}`, "Unknown language code");
  }
};

const literalValue: Check = (value, path, sink) => {
  objectOf({ k: literal("lit"), type: enumOf(["boolean", "number", "string"]), value: guard(item =>
    typeof item === "boolean" || Number.isFinite(item) || typeof item === "string") })(value, path, sink);
  if (isPlainObject(value) && ["boolean", "number", "string"].includes(value.type as string) &&
    typeof value.value !== value.type) sink.add("type", `${path}.value`, `A ${String(value.type)} literal`);
};

const exprVariants = discriminatedUnion("k", {
  cell: { key: enumOf(Object.keys(CELL_CONTEXT_TYPES)) },
  fn: { args: slotRecord, fn: keyText },
  list: { items: arrayOf(expr, SCRIPT_LIMITS.arrayLength), type: enumOf(["number[]", "string[]"]) },
  local: { name: localName },
  math: { a: expr, b: expr, op: enumOf(MATH_OPERATORS) },
  ref: { id: scriptId, kind: enumOf(SCRIPT_REF_KINDS) },
  resp: { key: enumOf(Object.keys(RESPONSE_TYPES)) },
  round: { mode: enumOf(ROUND_MODES), of: expr },
  text: { text: questText },
  var: { index: optional(expr), variable: scriptRef }
});

const exprCheck: Check = (value, path, sink) => {
  if (isPlainObject(value) && value.k === "lit") literalValue(value, path, sink);
  else exprVariants(value, path, sink);
};
export { exprCheck as expr };

const condition: Check = lazy(() => conditionCheck);
const conditionCheck = discriminatedUnion("k", {
  all: { of: arrayOf(condition, SCRIPT_LIMITS.actionsPerList) },
  any: { of: arrayOf(condition, SCRIPT_LIMITS.actionsPerList) },
  bool: { of: expr },
  compare: { a: expr, b: expr, op: enumOf(COMPARE_OPERATORS) },
  is: { args: slotRecord, pred: keyText },
  not: { of: condition }
});
export { conditionCheck as condition };

const actionList: Check = lazy(() => actionListCheck);
const waitSpec = objectOf({ onFail: enumOf(["continue", "stop"]), timeoutSeconds: optional(finite) });
const stepBase: CheckFields = { comment: optional(string({ maxLength: SCRIPT_LIMITS.textLength })),
  disabled: optional(boolean), id: scriptId };
const step = (fields: CheckFields): CheckFields => ({ ...stepBase, ...fields });
const actionCheck = discriminatedUnion("k", {
  comment: step({ text: string({ maxLength: SCRIPT_LIMITS.textLength }) }),
  do: step({ args: slotRecord, op: keyText, overridable: optional(boolean), wait: optional(waitSpec) }),
  forEach: step({ as: localName, body: actionList, max: positiveCount, over: slotValue }),
  forRange: step({ as: localName, body: actionList, from: expr, to: expr }),
  if: step({ cond: condition, else: actionList, then: actionList }),
  repeat: step({ body: actionList, times: expr }),
  runTrigger: step({ checkConditions: boolean, trigger: scriptRef, wait: boolean }),
  stop: step({}),
  wait: step({ seconds: expr }),
  waitUntil: step({ cond: condition, timeoutSeconds: nullable(number({ min: 0 })) })
});
const actionListCheck = arrayOf(actionCheck, SCRIPT_LIMITS.actionsPerList);
export { actionCheck as action, actionListCheck as actionList };

export const actorLook = discriminatedUnion("kind", {
  bandits: {}, nation: { nation: keyText }, ownerNation: {}, pirates: {}
});

/** An audio slot value: a catalog entry id or an uploaded map audio asset id. */
export const audioRef = discriminatedUnion("kind", {
  catalog: { id: keyText }, upload: { assetId: scriptId }
});

const noFields: CheckFields = {};
export const uiTarget = discriminatedUnion("kind", {
  building: { actor: actorSelector },
  colonyTracker: noFields,
  expeditionPlanner: noFields,
  fleet: noFields,
  gemShop: noFields,
  inventory: noFields,
  language: noFields,
  mainPanel: { view: enumOf(["build", "menu", "notices", "ships"]) },
  market: noFields,
  messages: { mailId: optional(string({ maxLength: SCRIPT_LIMITS.nameLength })) },
  overview: noFields,
  quests: { quest: optional(scriptRef) },
  settings: { section: optional(enumOf(["graphics", "sound", "weather", "dayMode", "world", "dialogueSpeed"])) },
  talents: noFields,
  terrainSurvey: noFields,
  tradeOffice: noFields
});

export const goodsLines = arrayOf(objectOf({ amount: positiveCount, ware: keyText }),
  SCRIPT_LIMITS.actionsPerList);
export const soldierLines = arrayOf(objectOf({
  amount: positiveCount, rank: optional(integer(0, SCRIPT_MAX_SOLDIER_RANK)), type: scriptRef
}), SCRIPT_LIMITS.actionsPerList);
export const rewardLines = guard(Array.isArray, "Rewards are a list");
