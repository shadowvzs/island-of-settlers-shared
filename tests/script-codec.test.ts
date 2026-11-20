import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compressBytes, MAP_CODEC_OFFSET, MAP_FORMAT_VERSION, MAP_MAGIC, MAP_PREFIX_BYTES, MapFileError
} from "../src/map-file.ts";
import { decodeHeaderScript, encodeHeaderScript, readMapFileScript } from "../src/script/codec.ts";
import { scriptReadsEnvironment } from "../src/script/environment.ts";
import { canonicalJson, mapScriptHash } from "../src/script/hash.ts";
import { restoreScriptSnapshot, startScriptSnapshot, storeScriptSnapshot } from "../src/script/snapshot.ts";
import type { MapScript } from "../src/script/types/index.ts";
import { validateMapScript } from "../src/script/validate.ts";
import { sha256Hex } from "../src/sha256.ts";
import { DESIGN_EXAMPLES, doStep, emptyScript, num, plantTrees, TEST_CATALOG, trigger } from "./script-fixtures.ts";

/** TRG1: canonical script hash, header codec, environment flag and run snapshots. */

const reversedKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(reversedKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reversedKeys(item)]));
};

const webDigest = async (bytes: Uint8Array) => Buffer.from(
  await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>)).toString("hex");

/** A minimal `.island` file: prefix + gzip(header length, header JSON); layers are not needed for the header. */
const mapFileOf = async (header: Record<string, unknown>) => {
  const json = new TextEncoder().encode(JSON.stringify(header));
  const payload = new Uint8Array(4 + json.length);
  new DataView(payload.buffer).setUint32(0, json.length, true);
  payload.set(json, 4);
  const prefix = new Uint8Array(MAP_PREFIX_BYTES);
  prefix.set(new TextEncoder().encode(MAP_MAGIC));
  new DataView(prefix.buffer).setUint16(4, MAP_FORMAT_VERSION, true);
  prefix[MAP_CODEC_OFFSET] = 0;
  const body = await compressBytes(payload, "gzip");
  const file = new Uint8Array(prefix.length + body.length);
  file.set(prefix);
  file.set(body, prefix.length);
  return file;
};

test("sha256Hex equals Web Crypto for empty, block-edge and large inputs", async () => {
  for (const length of [0, 1, 55, 56, 63, 64, 65, 1000, 70_000]) {
    const bytes = Uint8Array.from({ length }, (_, index) => (index * 31 + 7) & 0xff);
    assert.equal(sha256Hex(bytes), await webDigest(bytes), `length ${length}`);
  }
  assert.equal(sha256Hex(new TextEncoder().encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("canonical JSON sorts keys, drops undefined fields and keeps arrays in order", () => {
  assert.equal(canonicalJson({ b: [3, { y: 1, x: undefined, a: "s" }], a: -0, c: null }),
    '{"a":0,"b":[3,{"a":"s","y":1}],"c":null}');
});

test("the script hash is stable across key order and changes with content", () => {
  for (const { script } of DESIGN_EXAMPLES) {
    const document = script();
    assert.equal(mapScriptHash(reversedKeys(document) as MapScript), mapScriptHash(document));
  }
  const base = emptyScript();
  assert.notEqual(mapScriptHash({ ...base, revision: 2 }), mapScriptHash(base));
});

test("header fields: none without a script; write → read → hash equal with a script", () => {
  assert.deepEqual(encodeHeaderScript(undefined), {});
  assert.equal(decodeHeaderScript({}), null);
  for (const { script } of DESIGN_EXAMPLES) {
    const header = JSON.parse(JSON.stringify(encodeHeaderScript(script())));
    const decoded = decodeHeaderScript(header)!;
    assert.equal(decoded.scriptHash, header.scriptHash);
    assert.equal(mapScriptHash(decoded.script), header.scriptHash);
    assert.ok(Object.isFrozen(decoded.script.triggers));
  }
});

test("damaged, foreign or inconsistent header scripts are refused with a MapFileError", () => {
  const header = JSON.parse(JSON.stringify(encodeHeaderScript(plantTrees())));
  const cases: Record<string, unknown>[] = [
    { scriptHash: header.scriptHash },
    { ...header, scriptHash: "0".repeat(64) },
    { ...header, script: { ...header.script, revision: 9 } },
    { ...header, script: { ...header.script, version: 2 },
      scriptHash: mapScriptHash({ ...header.script, version: 2 }) },
    { ...header, script: { ...header.script, extra: 1 } },
    { ...header, scriptReadsEnvironment: true }
  ];
  for (const value of cases) assert.throws(() => decodeHeaderScript(value), MapFileError);
});

test("the environment flag matches the Ready check on every design example and on hour/weather scripts", () => {
  const timed = emptyScript({ triggers: [trigger("trigger-1", {
    actions: [doStep("s1", "timeOfDay", { hour: num(20) })]
  })] });
  for (const document of [...DESIGN_EXAMPLES.map(example => example.script()), timed]) {
    const result = validateMapScript(document, { catalog: TEST_CATALOG, mapKind: "campaign" });
    assert.equal(scriptReadsEnvironment(document), result.scriptReadsEnvironment);
  }
  assert.equal(scriptReadsEnvironment(timed), true);
  assert.equal(encodeHeaderScript(timed).scriptReadsEnvironment, true);
  assert.equal("scriptReadsEnvironment" in encodeHeaderScript(plantTrees()), false);
});

test("the API path decodes a header script from map file bytes with shared code only", async () => {
  const script = plantTrees();
  const file = await mapFileOf({ name: "x", ...encodeHeaderScript(script) });
  const decoded = await readMapFileScript(file);
  assert.equal(decoded?.scriptHash, mapScriptHash(script));
  assert.equal(await readMapFileScript(await mapFileOf({ name: "plain" })), null);
  await assert.rejects(readMapFileScript(new Uint8Array(12)), MapFileError);
});

test("snapshots store only the hash when the map header has the same script", () => {
  const script = plantTrees();
  const snapshot = startScriptSnapshot(script);
  const header = { script, scriptHash: snapshot.scriptHash };
  const compact = storeScriptSnapshot(snapshot, header);
  assert.deepEqual(Object.keys(compact).sort(), ["revision", "scriptHash"]);
  const restored = restoreScriptSnapshot(JSON.parse(JSON.stringify(compact)), header);
  assert.equal(restored.ok && restored.snapshot.scriptHash, snapshot.scriptHash);
  const changedMap = { ...emptyScript(), revision: 2 };
  const changedHeader = { script: changedMap, scriptHash: mapScriptHash(changedMap) };
  const full = JSON.parse(JSON.stringify(storeScriptSnapshot(snapshot, changedHeader)));
  assert.ok(full.script);
  const kept = restoreScriptSnapshot(full, changedHeader);
  assert.equal(kept.ok && kept.snapshot.revision, script.revision);
  assert.equal(restoreScriptSnapshot(compact, changedHeader).ok, false);
  assert.equal(restoreScriptSnapshot(compact, null).ok, false);
  assert.equal(restoreScriptSnapshot({ ...full, scriptHash: "f".repeat(64) }, null).ok, false);
  assert.equal(restoreScriptSnapshot({ ...compact, extra: 1 }, header).ok, false);
});
