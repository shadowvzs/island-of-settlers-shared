import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { BUILD_PROGRAMS } from "../src/catalog/ai/build-programs.ts";
import {
  CORE_CATEGORIES, CORE_DATA_FILES, validateBalance, validateBuildingSidecars, validateBuildPrograms, validateCatalog,
  validateTuningSidecars
} from "../src/catalog/index.ts";

/** The catalog's data folder: sidecar paths are relative to it. */
export const CATALOG_DATA_FOLDER = resolve(import.meta.dirname, "../src/catalog/data");

/** Reads a sidecar or data file by its path relative to the catalog's data folder. */
export const readSidecar = (path: string): unknown =>
  JSON.parse(readFileSync(join(CATALOG_DATA_FOLDER, path), "utf8"));

/**
 * Issues of the core catalog with every concrete sidecar path checked on disk, the tuning and building sidecars,
 * the balance data and the computer factions' build programs (Node only).
 */
export const contentCatalogIssues = () => [
  ...validateCatalog({ categories: CORE_CATEGORIES, files: CORE_DATA_FILES },
    { sidecarExists: path => existsSync(join(CATALOG_DATA_FOLDER, path)) }),
  ...validateTuningSidecars(CORE_DATA_FILES, readSidecar),
  ...validateBuildingSidecars(CORE_DATA_FILES, readSidecar),
  ...validateBalance(CORE_DATA_FILES, readSidecar("balance.json")),
  ...validateBuildPrograms(CORE_DATA_FILES, readSidecar, BUILD_PROGRAMS)
];

/** Fails fast (API start-up, client build/dev start) when the content catalog data is invalid. */
export const assertContentCatalog = () => {
  const issues = contentCatalogIssues();
  if (!issues.length) return;
  const lines = issues.map(issue => `${issue.path}: ${issue.message}`);
  throw new Error(`Invalid content catalog (${issues.length} issues):\n${lines.join("\n")}`);
};
