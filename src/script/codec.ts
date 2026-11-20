import { MAP_DAMAGED, MapFileError, readMapFileHeader } from "../map-file.ts";
import { isPlainObject } from "../validation/index.ts";
import { scriptReadsEnvironment } from "./environment.ts";
import { freezeMapScript, isScriptHash, mapScriptHash } from "./hash.ts";
import { createScriptIssueSink, formatScriptIssue } from "./issues.ts";
import { checkMapScriptShape } from "./shape.ts";
import type { MapScript } from "./types/script.ts";

/**
 * The map header's script fields (trigger design §4.1, TRG1): `script` (versioned through `FORMATS.mapScript`),
 * `scriptHash` (canonical JSON SHA-256) and `scriptReadsEnvironment` (only written when true). Maps without a script
 * carry none of the three, so their bytes are unchanged. Shared by the client map reader/writer and the API.
 */
export interface HeaderScriptFields {
  script?: MapScript;
  scriptHash?: string;
  scriptReadsEnvironment?: true;
}

/** A decoded, structurally valid script whose hash matched; the script is deep-frozen. */
export interface DecodedHeaderScript {
  script: MapScript;
  scriptHash: string;
  scriptReadsEnvironment: boolean;
}

/** The header fields of a script (nothing for none). */
export const encodeHeaderScript = (script: MapScript | undefined): HeaderScriptFields => {
  if (!script) return {};
  const readsEnvironment = scriptReadsEnvironment(script);
  return { script, scriptHash: mapScriptHash(script), ...(readsEnvironment ? { scriptReadsEnvironment: true } : {}) };
};

const damaged = (detail: string) => new MapFileError(`${MAP_DAMAGED} (script: ${detail})`);

const checkShape = (value: unknown) => {
  const sink = createScriptIssueSink();
  if (checkMapScriptShape(value, sink)) return value as MapScript;
  throw damaged(formatScriptIssue(sink.issues[0]!, "en"));
};

const checkFlag = (header: Readonly<Record<string, unknown>>, derived: boolean) => {
  const stored = header.scriptReadsEnvironment;
  if (stored !== undefined && stored !== true) throw damaged("environment flag");
  if ((stored === true) !== derived) throw damaged("environment flag");
};

/**
 * The script of a parsed map header, checked: structure (size, depth, strict shape, version), stored hash and
 * environment flag. Null when the header has no script; throws `MapFileError` for a damaged or foreign script. The
 * Ready check (`validateMapScript`) is not part of reading: a draft map loads.
 */
export const decodeHeaderScript = (header: Readonly<Record<string, unknown>>): DecodedHeaderScript | null => {
  if (header.script === undefined) {
    if (header.scriptHash !== undefined || header.scriptReadsEnvironment !== undefined) throw damaged("no script");
    return null;
  }
  const script = freezeMapScript(checkShape(header.script));
  const scriptHash = mapScriptHash(script);
  if (!isScriptHash(header.scriptHash) || header.scriptHash !== scriptHash) throw damaged("hash");
  const readsEnvironment = scriptReadsEnvironment(script);
  checkFlag(header, readsEnvironment);
  return { script, scriptHash, scriptReadsEnvironment: readsEnvironment };
};

/** The script of a whole `.island` file without decoding its layers (API: books by hash, §9.4). */
export const readMapFileScript = async (bytes: Uint8Array): Promise<DecodedHeaderScript | null> => {
  const header = await readMapFileHeader(bytes);
  if (!isPlainObject(header)) throw new MapFileError(MAP_DAMAGED);
  return decodeHeaderScript(header);
};
