import type { IssueSink as KitIssueSink } from "../../validation/index.ts";

/** Why a catalog file or entry is refused; `path` points into the raw data ("wares.json[3].text.name.key"). */
export type CatalogIssueCode =
  | "notJson" | "shape" | "duplicateId" | "duplicateCode" | "duplicateTranslationKey" | "idFormat"
  | "keyFormat" | "kindMismatch" | "unknownKind" | "family" | "category" | "tag" | "translationKey"
  | "text" | "assetPath" | "pathToken" | "sidecar" | "reference" | "variants" | "qualifier" | "payload" | "actor"
  | "reward";

export interface CatalogIssue {
  code: CatalogIssueCode;
  /** The entry id when the issue belongs to one entry. */
  id?: string;
  message: string;
  path: string;
}

export type Fields = Record<string, unknown>;

/** Collects issues for one entry (the validation kit's sink with the entry id); checks append, never throw. */
export interface IssueSink extends KitIssueSink<CatalogIssueCode> {
  issues: CatalogIssue[];
}

export const createIssueSink = (id?: string): IssueSink => {
  const issues: CatalogIssue[] = [];
  const owner = id === undefined ? {} : { id };
  return {
    add: (code, path, message) => { issues.push({ code, ...owner, message, path }); },
    issues
  };
};
