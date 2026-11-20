import type { ScriptRunState } from "../types/run-state.ts";

/**
 * Canonical hashing of plain JSON data (sorted object keys, undefined fields skipped) with a 53-bit cyrb53 mix,
 * printed as 14 hex digits. Not cryptographic: it compares run states (determinism, save/load, verifier parity).
 */

const appendCanonical = (value: unknown, parts: string[]) => {
  if (value === null || typeof value !== "object") {
    parts.push(JSON.stringify(value) ?? "null");
    return;
  }
  if (Array.isArray(value)) {
    parts.push("[");
    value.forEach((item, index) => {
      if (index > 0) parts.push(",");
      appendCanonical(item === undefined ? null : item, parts);
    });
    parts.push("]");
    return;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter(key => record[key] !== undefined).sort();
  parts.push("{");
  keys.forEach((key, index) => {
    if (index > 0) parts.push(",");
    parts.push(JSON.stringify(key), ":");
    appendCanonical(record[key], parts);
  });
  parts.push("}");
};

/** Canonical JSON text: equal for equal data regardless of key insertion order. */
export const canonicalJson = (value: unknown) => {
  const parts: string[] = [];
  appendCanonical(value, parts);
  return parts.join("");
};

const cyrb53 = (text: string) => {
  let first = 0xdeadbeef;
  let second = 0x41c6ce57;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 2654435761);
    second = Math.imul(second ^ code, 1597334677);
  }
  first = Math.imul(first ^ (first >>> 16), 2246822507) ^ Math.imul(second ^ (second >>> 13), 3266489909);
  second = Math.imul(second ^ (second >>> 16), 2246822507) ^ Math.imul(first ^ (first >>> 13), 3266489909);
  const high = (second & 0x1fffff) >>> 0;
  return high.toString(16).padStart(6, "0") + (first >>> 0).toString(16).padStart(8, "0");
};

/** Hash of any plain JSON value. */
export const hashCanonical = (value: unknown) => cyrb53(canonicalJson(value));

/**
 * Run-state hash (design §9.1): everything saved except the script body, which the snapshot's `scriptHash`
 * already identifies.
 */
export const hashScriptRunState = (state: ScriptRunState) => {
  const { snapshot, ...rest } = state;
  return hashCanonical({ ...rest, snapshot: { revision: snapshot.revision, scriptHash: snapshot.scriptHash } });
};
