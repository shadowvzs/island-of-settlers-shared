import { isPlainObject } from "../validation/index.ts";
import { freezeMapScript, isScriptHash, mapScriptHash } from "./hash.ts";
import { createScriptIssueSink } from "./issues.ts";
import { checkMapScriptShape } from "./shape.ts";
import type { ScriptRunState } from "./types/run-state.ts";
import type { MapScript } from "./types/script.ts";

/**
 * The script a run executes (trigger design §6.13, owner round 5 item 10 / round 6 item 43): copied at map start
 * and kept until the player restarts the map; home islands keep it until an admin pushes a revision (TRG2 migrates
 * then). A save stores it deduplicated against the island's own map header: when the hashes are equal only the
 * revision and hash are written, otherwise the whole script.
 */
export type MapScriptSnapshot = ScriptRunState["snapshot"];

/** The save form: `script` only when it differs from the map header's script. */
export interface StoredScriptSnapshot {
  revision: number;
  script?: MapScript;
  scriptHash: string;
}

/** The header script of the map a save belongs to (absent when the map has none). */
export interface HeaderScriptRef {
  script: MapScript;
  scriptHash: string;
}

/** The snapshot taken at map start; the frozen header script is shared, never copied again. */
export const startScriptSnapshot = (script: MapScript): MapScriptSnapshot => {
  const frozen = freezeMapScript(script);
  return { revision: frozen.revision, script: frozen, scriptHash: mapScriptHash(frozen) };
};

export const storeScriptSnapshot = (
  snapshot: MapScriptSnapshot, header: HeaderScriptRef | null
): StoredScriptSnapshot => {
  const { revision, script, scriptHash } = snapshot;
  if (header?.scriptHash === scriptHash) return { revision, scriptHash };
  return { revision, script, scriptHash };
};

export type RestoredScriptSnapshot = { ok: true; snapshot: MapScriptSnapshot } | { ok: false; reason: string };

const failed = (reason: string): RestoredScriptSnapshot => ({ ok: false, reason });

const embeddedScript = (value: unknown, scriptHash: string) => {
  if (!checkMapScriptShape(value, createScriptIssueSink())) return null;
  const script = freezeMapScript(value as MapScript);
  return mapScriptHash(script) === scriptHash ? script : null;
};

const snapshotScript = (stored: Record<string, unknown>, scriptHash: string, header: HeaderScriptRef | null) => {
  if (stored.script !== undefined) return embeddedScript(stored.script, scriptHash);
  return header?.scriptHash === scriptHash ? freezeMapScript(header.script) : null;
};

/** Checks a saved snapshot against the save's own map header; the script is frozen. */
export const restoreScriptSnapshot = (stored: unknown, header: HeaderScriptRef | null): RestoredScriptSnapshot => {
  if (!isPlainObject(stored)) return failed("Invalid script snapshot");
  const { revision, scriptHash } = stored;
  if (!Number.isSafeInteger(revision) || (revision as number) < 0 || !isScriptHash(scriptHash))
    return failed("Invalid script snapshot");
  if (Object.keys(stored).some(key => !["revision", "script", "scriptHash"].includes(key)))
    return failed("Invalid script snapshot");
  const script = snapshotScript(stored, scriptHash, header);
  if (!script) return failed("Script snapshot does not match its script");
  if (script.revision !== revision) return failed("Script snapshot revision does not match its script");
  return { ok: true, snapshot: { revision: revision as number, script, scriptHash } };
};
