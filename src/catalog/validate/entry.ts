import { isNonEmptyString, isPlainObject, isStringList } from "../../validation/index.ts";
import {
  ACTOR_CAPABILITY_PATTERN, CATEGORY_PATTERN, CONTENT_KINDS, FAMILY_PATTERN, KEY_PATTERN, TAG_PATTERN,
  TRANSLATION_KEY_PATTERN
} from "../constants.ts";
import type { ContentKind } from "../types/refs.ts";
import type { Fields, IssueSink } from "./issues.ts";
import {
  allowedPathTokens, checkAssetRef, checkRecipeTemplate, checkSidecarRef, type RefContext
} from "./refs.ts";

/** What entry checks look up besides ids: the category ids with their kind. */
export interface EntryContext extends RefContext {
  categories: ReadonlyMap<string, ContentKind>;
}

const BASE_FIELDS = new Set([
  "actor", "category", "code", "family", "icon", "id", "key", "kind", "model", "placement", "retired",
  "sidecars", "tags", "text", "variants"
]);
const TEXT_FIELDS = new Set(["description", "name", "plural", "variants"]);

export const checkContentText = (value: unknown, path: string, sink: IssueSink) => {
  if (!isPlainObject(value) || !isNonEmptyString(value.key) || !isNonEmptyString(value.en) ||
    Object.keys(value).length !== 2) {
    sink.add("text", path, "A text is { key, en } with non-empty strings");
    return;
  }
  if (!TRANSLATION_KEY_PATTERN.test(value.key)) sink.add("translationKey", `${path}.key`, "Not a Lingui id");
};

const checkTexts = (value: unknown, path: string, sink: IssueSink) => {
  if (!isPlainObject(value)) {
    sink.add("text", path, "text.name is required");
    return;
  }
  checkContentText(value.name, `${path}.name`, sink);
  for (const field of ["plural", "description"] as const)
    if (value[field] !== undefined) checkContentText(value[field], `${path}.${field}`, sink);
  if (isPlainObject(value.variants))
    for (const [name, text] of Object.entries(value.variants)) checkContentText(text, `${path}.variants.${name}`, sink);
  else if (value.variants !== undefined) sink.add("text", `${path}.variants`, "Variants are a record of texts");
  for (const field of Object.keys(value))
    if (!TEXT_FIELDS.has(field)) sink.add("text", `${path}.${field}`, "Unknown text field");
};

const isRange = (value: unknown) => isPlainObject(value) && Number.isInteger(value.min) && Number.isInteger(value.max)
  && (value.min as number) <= (value.max as number) && Object.keys(value).length === 2;

const isValidAxis = (axis: string, declared: unknown) => {
  if (axis === "level" || axis === "rank") return isRange(declared);
  if (axis === "nation" && declared === "all") return true;
  return ["finish", "form", "nation"].includes(axis) && isStringList(declared);
};

const checkVariants = (value: unknown, path: string, sink: IssueSink) => {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    sink.add("variants", path, "Variants are a record of axes");
    return;
  }
  for (const [axis, declared] of Object.entries(value))
    if (!isValidAxis(axis, declared)) sink.add("variants", `${path}.${axis}`, "Unknown axis or invalid declaration");
};

const checkTags = (value: unknown, path: string, sink: IssueSink) => {
  if (!isStringList(value) || value.some(tag => !TAG_PATTERN.test(tag)) || new Set(value).size !== value.length)
    sink.add("tag", path, "Tags are unique camelCase words");
};

const isNameList = (value: unknown) => isStringList(value) && new Set(value).size === value.length &&
  value.every(name => ACTOR_CAPABILITY_PATTERN.test(name));

/**
 * The actor block (trigger design §3.2): `capabilities` = events an instance raises, `targetOf` = actions that may
 * target it; unique camelCase names. Which names exist is checked by the script catalogue tests.
 */
const checkActorBlock = (value: unknown, path: string, sink: IssueSink) => {
  if (value === undefined) return;
  if (!isPlainObject(value) || !isNameList(value.capabilities)) {
    sink.add("actor", path, "An actor block is { capabilities, targetOf? } with unique camelCase names");
    return;
  }
  if (value.targetOf !== undefined && !isNameList(value.targetOf))
    sink.add("actor", `${path}.targetOf`, "targetOf lists unique camelCase action names");
  for (const field of Object.keys(value))
    if (field !== "capabilities" && field !== "targetOf") sink.add("actor", `${path}.${field}`, "Unknown field");
};

const checkModel = (value: unknown, path: string, tokens: ReadonlySet<string>, sink: IssueSink) => {
  if (!isPlainObject(value)) sink.add("reference", path, "A model is { kind: recipe | glb }");
  else if (value.kind === "recipe") checkRecipeTemplate(value.recipe, `${path}.recipe`, tokens, sink);
  else if (value.kind === "glb") checkAssetRef(value.asset, `${path}.asset`, tokens, sink);
  else sink.add("reference", `${path}.kind`, "A model is { kind: recipe | glb }");
};

const checkIdentity = (entry: Fields, kind: ContentKind, path: string, sink: IssueSink) => {
  if (entry.kind !== kind) sink.add("kindMismatch", `${path}.kind`, `Expected kind ${kind}`);
  if (!isNonEmptyString(entry.key) || !KEY_PATTERN.test(entry.key)) sink.add("keyFormat", `${path}.key`, "Invalid key");
  if (entry.id !== `${kind}:${String(entry.key)}`) sink.add("idFormat", `${path}.id`, "The id must be <kind>:<key>");
  if (entry.code !== undefined && (!Number.isInteger(entry.code) || (entry.code as number) < 0))
    sink.add("payload", `${path}.code`, "A code is a non-negative integer");
  if (entry.retired !== undefined && entry.retired !== true) sink.add("shape", `${path}.retired`, "Only true");
};

const checkClassification = (
  entry: Fields, kind: ContentKind, path: string, sink: IssueSink, context: EntryContext
) => {
  const category = isNonEmptyString(entry.category) && CATEGORY_PATTERN.test(entry.category) ? entry.category : null;
  if (!category || context.categories.get(category) !== kind)
    sink.add("category", `${path}.category`, `Unknown category for kind ${kind}`);
  if (!isNonEmptyString(entry.family) || !FAMILY_PATTERN.test(entry.family))
    sink.add("family", `${path}.family`, "A family is a dotted camelCase path");
  checkTags(entry.tags, `${path}.tags`, sink);
};

const checkReferences = (entry: Fields, path: string, sink: IssueSink, context: EntryContext) => {
  const tokens = allowedPathTokens(entry.variants);
  if (entry.icon !== undefined) checkAssetRef(entry.icon, `${path}.icon`, tokens, sink);
  if (entry.model !== undefined) checkModel(entry.model, `${path}.model`, tokens, sink);
  if (entry.sidecars === undefined) return;
  if (!isPlainObject(entry.sidecars)) {
    sink.add("sidecar", `${path}.sidecars`, "Sidecars are a record of { path }");
    return;
  }
  for (const [name, ref] of Object.entries(entry.sidecars))
    checkSidecarRef(ref, `${path}.sidecars.${name}`, tokens, sink, context);
};

/**
 * Checks the fields every entry shares. `payload` names the kind's own field (`ware`, `nation`, …), the
 * only field allowed beside the base fields.
 */
export const checkEntryBase = (
  entry: unknown, kind: ContentKind, payload: string, path: string, sink: IssueSink, context: EntryContext
): entry is Fields => {
  if (!isPlainObject(entry)) {
    sink.add("shape", path, "An entry is an object");
    return false;
  }
  if (!CONTENT_KINDS.includes(kind)) sink.add("unknownKind", path, `Unknown kind ${kind}`);
  checkIdentity(entry, kind, path, sink);
  checkTexts(entry.text, `${path}.text`, sink);
  checkClassification(entry, kind, path, sink, context);
  checkVariants(entry.variants, `${path}.variants`, sink);
  checkReferences(entry, path, sink, context);
  checkActorBlock(entry.actor, `${path}.actor`, sink);
  for (const field of Object.keys(entry))
    if (!BASE_FIELDS.has(field) && field !== payload) sink.add("shape", `${path}.${field}`, "Unknown field");
  return true;
};
