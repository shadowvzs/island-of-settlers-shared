import { isNonEmptyString, isPlainObject } from "../../validation/index.ts";
import {
  ASSET_ROOTS, CUE_ID_PATTERN, ENTRY_PATH_TOKENS, PATH_SEGMENT_PATTERN, PATH_TOKEN_PATTERN,
  RECIPE_ID_PATTERN, RECIPE_TEMPLATE_PATTERN, RULE_ID_PATTERN
} from "../constants.ts";
import { splitContentId } from "../family.ts";
import type { Qualifiers, VariantAxes } from "../types/entry.ts";
import type { AssetRoot, ContentKind } from "../types/refs.ts";
import type { CatalogIssue, Fields, IssueSink } from "./issues.ts";

/** What reference checks may look up: every entry id of the catalog being validated. */
export interface RefContext {
  ids: ReadonlySet<string>;
  /** Optional existence check of a sidecar path (relative to `catalog/data/`), e.g. a Node `existsSync`. */
  sidecarExists?: (path: string) => boolean;
}

/** Tokens a path of this entry may use: `code`, `key` and its declared variant axes. */
export const allowedPathTokens = (variants: unknown): ReadonlySet<string> =>
  new Set([...ENTRY_PATH_TOKENS, ...(isPlainObject(variants) ? Object.keys(variants) : [])]);

const pathTokens = (path: string) => [...path.matchAll(PATH_TOKEN_PATTERN)].map(match => match[1]!);

/** A relative POSIX path whose tokens are all allowed; `suffix` is the required extension, if any. */
const checkTokens = (value: string, path: string, tokens: ReadonlySet<string>, sink: IssueSink) => {
  for (const token of pathTokens(value))
    if (!tokens.has(token)) sink.add("pathToken", path, `Token {${token}} is not code, key or a declared axis`);
};

const checkRelativePath = (
  value: unknown, path: string, tokens: ReadonlySet<string>, sink: IssueSink, suffix?: string
): value is string => {
  if (!isNonEmptyString(value) || value.split("/").some(segment => !PATH_SEGMENT_PATTERN.test(segment))) {
    sink.add("assetPath", path, "Paths are relative POSIX paths without '.', '..' or empty segments");
    return false;
  }
  if (suffix && !value.endsWith(suffix)) sink.add("assetPath", path, `The path must end in ${suffix}`);
  checkTokens(value, path, tokens, sink);
  return true;
};

export const checkAssetRef = (value: unknown, path: string, tokens: ReadonlySet<string>, sink: IssueSink) => {
  if (!isPlainObject(value) || Object.keys(value).length !== 2) {
    sink.add("assetPath", path, "An asset reference is { root, path }");
    return;
  }
  if (!ASSET_ROOTS.includes(value.root as AssetRoot)) sink.add("assetPath", `${path}.root`, "Unknown asset root");
  checkRelativePath(value.path, `${path}.path`, tokens, sink);
};

export const checkSidecarRef = (
  value: unknown, path: string, tokens: ReadonlySet<string>, sink: IssueSink, context: RefContext
) => {
  if (!isPlainObject(value) || Object.keys(value).length !== 1) {
    sink.add("sidecar", path, "A sidecar reference is { path }");
    return;
  }
  if (!checkRelativePath(value.path, `${path}.path`, tokens, sink, ".json")) return;
  const concrete = pathTokens(value.path).length === 0;
  if (concrete && context.sidecarExists && !context.sidecarExists(value.path))
    sink.add("sidecar", `${path}.path`, `Sidecar ${value.path} does not exist`);
};

const CODE_REF_PATTERNS = { cue: CUE_ID_PATTERN, recipe: RECIPE_ID_PATTERN, rule: RULE_ID_PATTERN } as const;

/** A `rule:`, `recipe:` or `cue:` id; registries in the client check that it is registered. */
export const checkCodeRef = (
  value: unknown, prefix: keyof typeof CODE_REF_PATTERNS, path: string, sink: IssueSink
) => {
  if (!isNonEmptyString(value) || !CODE_REF_PATTERNS[prefix].test(value))
    sink.add("reference", path, `Expected a ${prefix}:<area>.<name> id`);
};

/**
 * An entry's model recipe id, optionally a template whose `{token}`s are code, key or declared axes; the client
 * registry test checks that every expansion is registered.
 */
export const checkRecipeTemplate = (value: unknown, path: string, tokens: ReadonlySet<string>, sink: IssueSink) => {
  if (!isNonEmptyString(value) || !RECIPE_TEMPLATE_PATTERN.test(value)) {
    sink.add("reference", path, "Expected a recipe:<kind>.<key>[.{token}…] id");
    return;
  }
  checkTokens(value, path, tokens, sink);
};

/** A `<kind>:<key>` id of an existing entry whose kind is allowed for the field. */
export const checkContentRef = (
  value: unknown, kinds: readonly ContentKind[], path: string, sink: IssueSink, context: RefContext
) => {
  const parts = isNonEmptyString(value) ? splitContentId(value) : null;
  if (!parts || !kinds.includes(parts.kind as ContentKind)) {
    sink.add("reference", path, `Expected an id of kind ${kinds.join(" or ")}`);
    return;
  }
  if (!context.ids.has(value as string)) sink.add("reference", path, `Unknown content id ${String(value)}`);
};

const rangeIssue = (axis: Fields, value: unknown) =>
  !Number.isInteger(value) || (value as number) < (axis.min as number) || (value as number) > (axis.max as number);

const listIssue = (axis: unknown, value: unknown) =>
  axis !== "all" && (!Array.isArray(axis) || !axis.includes(value));

/**
 * Qualifier check for trigger actor types and registry variants: every qualifier must be a declared
 * axis of the entry, inside its range or list. Returns the issues (empty when valid).
 */
export const qualifierIssues = (
  variants: VariantAxes | undefined, qualifiers: Qualifiers, path = "qualifiers"
): CatalogIssue[] => {
  const issues: CatalogIssue[] = [];
  for (const [axis, value] of Object.entries(qualifiers)) {
    const declared = variants?.[axis as keyof VariantAxes];
    const refused = declared === undefined
      || (isPlainObject(declared) ? rangeIssue(declared, value) : listIssue(declared, value));
    if (refused) issues.push({ code: "qualifier", message: `${axis} ${String(value)} is not declared`, path });
  }
  return issues;
};
