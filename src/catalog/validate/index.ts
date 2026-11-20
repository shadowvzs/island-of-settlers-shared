import { isPlainObject } from "../../validation/index.ts";
import { CATEGORY_PATTERN, CONTENT_KINDS } from "../constants.ts";
import type { ContentKind } from "../types/refs.ts";
import { checkContentText, checkEntryBase, type EntryContext } from "./entry.ts";
import { type CatalogIssue, createIssueSink, type IssueSink } from "./issues.ts";
import { checkPlainJson } from "./json.ts";
import { KIND_RULES } from "./kinds.ts";

/** One core data file: its name (for issue paths), the kind of every entry in it and the raw entries. */
export interface CatalogDataFile {
  entries: unknown;
  file: string;
  kind: ContentKind;
}

export interface CatalogSource {
  categories: unknown;
  files: readonly CatalogDataFile[];
}

export interface ValidateOptions {
  /** Existence check of a sidecar path relative to `catalog/data/` (Node: `existsSync`). */
  sidecarExists?: (path: string) => boolean;
}

interface CategoryShape {
  id: string;
  kind: ContentKind;
  text: { name: unknown };
}

const isCategoryShape = (category: unknown): category is CategoryShape =>
  isPlainObject(category) && typeof category.id === "string" && CATEGORY_PATTERN.test(category.id)
  && CONTENT_KINDS.includes(category.kind as ContentKind) && Number.isInteger(category.order)
  && isPlainObject(category.text) && Object.keys(category).length === 4;

const readCategories = (raw: unknown, sink: IssueSink) => {
  const categories = new Map<string, ContentKind>();
  if (!Array.isArray(raw)) {
    sink.add("shape", "categories.json", "Categories are an array");
    return categories;
  }
  raw.forEach((category, index) => {
    const path = `categories.json[${index}]`;
    if (!isCategoryShape(category)) {
      sink.add("category", path, "A category is { id, kind, order, text: { name } }");
      return;
    }
    checkContentText(category.text.name, `${path}.text.name`, sink);
    if (categories.has(category.id)) sink.add("duplicateId", path, `Duplicate category ${category.id}`);
    categories.set(category.id, category.kind);
  });
  return categories;
};

const entryList = (file: CatalogDataFile, sink: IssueSink): readonly unknown[] => {
  if (Array.isArray(file.entries)) return file.entries;
  sink.add("shape", file.file, "A data file is an array of entries");
  return [];
};

const collectIds = (files: readonly CatalogDataFile[], sink: IssueSink) => {
  const ids = new Set<string>();
  for (const file of files) entryList(file, createIssueSink()).forEach((entry, index) => {
    if (!isPlainObject(entry) || typeof entry.id !== "string") return;
    if (ids.has(entry.id)) sink.add("duplicateId", `${file.file}[${index}].id`, `Duplicate id ${entry.id}`);
    ids.add(entry.id);
  });
  return ids;
};

/**
 * Codes are unique per kind. A name translation key names one text: entries may share it (plant items of one
 * species, an offer named after its ware) only with the identical English source.
 */
const checkUniqueness = (files: readonly CatalogDataFile[], sink: IssueSink) => {
  const codes = new Set<string>();
  const nameKeys = new Map<string, unknown>();
  for (const file of files) entryList(file, createIssueSink()).forEach((entry, index) => {
    if (!isPlainObject(entry)) return;
    const path = `${file.file}[${index}]`;
    if (entry.code !== undefined) {
      const code = `${file.kind}:${String(entry.code)}`;
      if (codes.has(code)) sink.add("duplicateCode", `${path}.code`, `Duplicate code ${code}`);
      codes.add(code);
    }
    const name = isPlainObject(entry.text) && isPlainObject(entry.text.name) ? entry.text.name : undefined;
    if (typeof name?.key !== "string") return;
    if (nameKeys.has(name.key) && nameKeys.get(name.key) !== name.en)
      sink.add("duplicateTranslationKey", `${path}.text.name.key`, `${name.key} with another English text`);
    nameKeys.set(name.key, name.en);
  });
};

const checkFile = (file: CatalogDataFile, context: EntryContext, issues: CatalogIssue[]) => {
  const rule = KIND_RULES[file.kind];
  if (!rule) {
    issues.push({ code: "unknownKind", message: `Kind ${file.kind} has no payload rule yet`, path: file.file });
    return;
  }
  entryList(file, createIssueSink()).forEach((entry, index) => {
    const path = `${file.file}[${index}]`;
    const sink = createIssueSink(isPlainObject(entry) && typeof entry.id === "string" ? entry.id : undefined);
    if (checkEntryBase(entry, file.kind, rule.payload, path, sink, context))
      rule.check(entry[rule.payload], `${path}.${rule.payload}`, sink, context, entry);
    issues.push(...sink.issues);
  });
};

/**
 * Runtime data validation of the core catalog: plain JSON, required fields and types, unique ids, codes and
 * translation keys, categories, families, tags, references, asset and sidecar paths. Runs in tests, the
 * client Vite build/dev start and the API start-up; never in the production client.
 */
export const validateCatalog = (source: CatalogSource, options: ValidateOptions = {}): CatalogIssue[] => {
  const sink = createIssueSink();
  checkPlainJson(source.categories, "categories.json", sink);
  for (const file of source.files) checkPlainJson(file.entries, file.file, sink);
  for (const file of source.files) entryList(file, sink);
  const categories = readCategories(source.categories, sink);
  const context: EntryContext = { categories, ids: collectIds(source.files, sink), ...options };
  checkUniqueness(source.files, sink);
  for (const file of source.files) checkFile(file, context, sink.issues);
  return sink.issues;
};

export type { CatalogIssue } from "./issues.ts";
export { qualifierIssues } from "./refs.ts";
export {
  type BuildProgramCatalog, buildProgramCatalog, type BuildProgramIssue, type BuildProgramIssueKind, buildingRulesOf,
  constructionWares, goalPlaysFor, isBuildingPlaceableFor, productionWares, validateBuildPrograms
} from "./ai.ts";
export { validateBalance } from "./balance.ts";
export { BUILDING_SIDECARS, type BuildingSidecarName, validateBuildingSidecars } from "./building-sidecars.ts";
export { type RewardCheckOptions, validateRewardEntries } from "./rewards.ts";
export { TUNING_SIDECAR_RULES, validateTuningSidecars } from "./tuning.ts";
