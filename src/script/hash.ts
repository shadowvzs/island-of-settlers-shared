import { sha256Hex } from "../sha256.ts";
import type { MapScript } from "./types/script.ts";

/**
 * Canonical JSON and the script hash (trigger design §4.1, QU §4.2 rule): object keys sorted by code unit, no
 * whitespace, numbers and strings exactly as `JSON.stringify` writes them, `undefined` object fields left out (as
 * `JSON.stringify` does). Two scripts with the same content but another key order hash equally.
 */

const canonicalValue = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(item => canonicalValue(item ?? null)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const fields = Object.keys(record).sort()
    .filter(key => record[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${canonicalValue(record[key])}`);
  return `{${fields.join(",")}}`;
};

export const canonicalJson = (value: unknown): string => canonicalValue(value);

/** SHA-256 (hex) of the canonical JSON of any document. */
export const canonicalHash = (value: unknown): string =>
  sha256Hex(new TextEncoder().encode(canonicalJson(value)));

/**
 * Hashes of deep-frozen scripts (loaded maps and run snapshots, `freezeMapScript`): game saves re-write the map
 * header often, so a frozen script is hashed once. Editable (unfrozen) scripts are hashed on every call.
 */
const FROZEN_SCRIPT_HASHES = new WeakMap<MapScript, string>();

const deepFreeze = (value: unknown) => {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
};

/** Freezes the whole script (it never changes after load or snapshot); returns it. */
export const freezeMapScript = (script: MapScript): MapScript => {
  deepFreeze(script);
  return script;
};

/** The script hash stored as `MapHeader.scriptHash` and cited by claims and run snapshots. */
export const mapScriptHash = (script: MapScript): string => {
  if (!Object.isFrozen(script)) return canonicalHash(script);
  const cached = FROZEN_SCRIPT_HASHES.get(script);
  if (cached !== undefined) return cached;
  const hash = canonicalHash(script);
  FROZEN_SCRIPT_HASHES.set(script, hash);
  return hash;
};

/** A lower-case SHA-256 hex digest. */
export const isScriptHash = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
