import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FORMATS, formatVersionIssue, isCurrentFormat, isFormat, migrateFormat
} from "../src/formats.ts";
import {
  arrayOf, boolean, checkValue, conforms, discriminatedUnion, enumOf, FORBIDDEN_KEYS, guard, hasPlainPrototype,
  integer, isFiniteNumber, isPlainObject, isPositiveCount, isSafeCount, isSafeTree, isTick, literal, MAX_SAVE_DEPTH,
  nullable, number, objectOf, optional, recordOf, SAVE_UPLOAD_DEPTH, string, treeIssue, union
} from "../src/validation/index.ts";

const summary = (issues: readonly { code: string; path: string }[]) =>
  issues.map(issue => `${issue.code}@${issue.path}`);

const nested = (levels: number) => {
  let value: unknown = 1;
  for (let level = 0; level < levels; level++) value = { child: value };
  return value;
};

test("isPlainObject refuses null, arrays and typed arrays but not class instances", () => {
  assert.equal(isPlainObject({}), true);
  assert.equal(isPlainObject(Object.create(null)), true);
  assert.equal(isPlainObject(new Map()), true);
  for (const value of [null, undefined, [], new Uint8Array(2), new DataView(new ArrayBuffer(2)), "x", 1])
    assert.equal(isPlainObject(value), false, String(value));
  assert.equal(hasPlainPrototype({}), true);
  assert.equal(hasPlainPrototype(Object.create(null)), true);
  assert.equal(hasPlainPrototype(new Map()), false);
});

test("number guards", () => {
  assert.equal(isFiniteNumber(1.5), true);
  assert.equal(isFiniteNumber(Number.NaN), false);
  assert.equal(isFiniteNumber(Infinity), false);
  assert.equal(isSafeCount(0), true);
  assert.equal(isSafeCount(-1), false);
  assert.equal(isSafeCount(1.5), false);
  assert.equal(isSafeCount(2 ** 53), false);
  assert.equal(isPositiveCount(0), false);
  assert.equal(isTick(20), true);
  assert.deepEqual([...FORBIDDEN_KEYS].sort(), ["__proto__", "constructor", "prototype"]);
});

test("safe trees bound depth, nodes, prototype keys and non-data", () => {
  assert.equal(isSafeTree(nested(MAX_SAVE_DEPTH), MAX_SAVE_DEPTH), true);
  assert.equal(isSafeTree(nested(MAX_SAVE_DEPTH + 1), MAX_SAVE_DEPTH), false);
  assert.equal(SAVE_UPLOAD_DEPTH, MAX_SAVE_DEPTH + 1);
  assert.equal(treeIssue(JSON.parse('{"a":{"__proto__":1}}'), { maxDepth: 5 }), "forbiddenKey");
  assert.equal(treeIssue({ constructor: 1 }, { maxDepth: 5 }), "forbiddenKey");
  assert.equal(treeIssue({ a: [1, Number.NaN] }, { maxDepth: 5 }), "notData");
  assert.equal(treeIssue({ a: () => 1 }, { maxDepth: 5 }), "notData");
  assert.equal(treeIssue({ a: undefined, b: null, c: "x", d: true }, { maxDepth: 5 }), null);
  assert.equal(treeIssue([1, 2, 3], { maxDepth: 5, maxNodes: 3 }), "nodes");
  assert.equal(treeIssue({ a: new Map() }, { maxDepth: 5, plainObjectsOnly: true }), "notData");
  assert.equal(treeIssue({ a: new Uint8Array(2) }, { maxDepth: 5 }), null);
  const shared = { x: 1 };
  assert.equal(treeIssue({ a: shared, b: shared }, { maxDepth: 5 }), null);
  assert.equal(treeIssue({ a: shared, b: shared }, { maxDepth: 5, uniqueReferences: true }), "sharedReference");
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  assert.equal(treeIssue(cycle, { maxDepth: 5 }), "depth");
});

test("scalar checks report typed codes at the path", () => {
  assert.deepEqual(summary(checkValue(string({ maxLength: 3 }), "abcd", "name")), ["length@name"]);
  assert.deepEqual(summary(checkValue(string({ pattern: /^[a-z]+$/ }), "A1", "id")), ["pattern@id"]);
  assert.deepEqual(summary(checkValue(string(), 1, "id")), ["type@id"]);
  assert.deepEqual(summary(checkValue(number({ min: 0, maxExclusive: 24 }), 24, "hour")), ["range@hour"]);
  assert.deepEqual(summary(checkValue(number(), Infinity, "x")), ["type@x"]);
  assert.deepEqual(summary(checkValue(integer(1, 3), 2.5, "n")), ["type@n"]);
  assert.deepEqual(summary(checkValue(integer(1, 3), 4, "n")), ["range@n"]);
  assert.deepEqual(summary(checkValue(boolean, 0, "b")), ["type@b"]);
  assert.deepEqual(summary(checkValue(literal("a"), "b", "k")), ["literal@k"]);
  assert.deepEqual(summary(checkValue(enumOf(["a", "b"]), "c", "k")), ["enum@k"]);
  assert.deepEqual(summary(checkValue(guard(value => value === 1, "One", "range"), 2, "k")), ["range@k"]);
  assert.deepEqual(checkValue(optional(string()), undefined, "k"), []);
  assert.deepEqual(checkValue(nullable(string()), null, "k"), []);
});

test("objects are strict, arrays and records are bounded, unions and discriminated unions", () => {
  const point = objectOf({ x: number(), z: optional(number()) });
  assert.deepEqual(checkValue(point, { x: 1 }, "p"), []);
  assert.deepEqual(summary(checkValue(point, { x: "1", y: 2 }, "p")), ["unknownField@p.y", "type@p.x"]);
  assert.deepEqual(summary(checkValue(point, [1], "p")), ["type@p"]);
  assert.deepEqual(summary(checkValue(arrayOf(point, 1), [{ x: 1 }, { x: 2 }], "list")), ["length@list"]);
  assert.deepEqual(summary(checkValue(arrayOf(point), [{ x: 1 }, {}], "list")), ["type@list[1].x"]);
  const counts = recordOf(integer(0), { key: string({ pattern: /^[a-z]+$/ }), maxEntries: 3 });
  assert.deepEqual(summary(checkValue(counts, JSON.parse('{"logs":1,"__proto__":2,"B":-1}'), "goods")),
    ["forbiddenKey@goods.__proto__", "pattern@goods.B", "range@goods.B"]);
  assert.deepEqual(summary(checkValue(counts, { a: 1, b: 1, c: 1, d: 1 }, "goods")), ["length@goods"]);
  assert.deepEqual(checkValue(union(string(), number()), 2, "v"), []);
  assert.deepEqual(summary(checkValue(union(string(), number()), true, "v")), ["union@v"]);
  const shape = discriminatedUnion("kind", { circle: { r: number() }, dot: {} });
  assert.deepEqual(checkValue(shape, { kind: "circle", r: 1 }, "s"), []);
  assert.deepEqual(summary(checkValue(shape, { kind: "square" }, "s")), ["discriminator@s.kind"]);
  assert.deepEqual(summary(checkValue(shape, { kind: "dot", r: 1 }, "s")), ["unknownField@s.r"]);
  assert.equal(conforms<{ x: number }>(point, { x: 3 }), true);
  assert.deepEqual(summary(checkValue(point, { x: "a" })), ["type@x"]);
});

test("format registry: version issues, tagged documents and the migrations hook", () => {
  assert.equal(FORMATS.gameSave.id, "island-settlers-game");
  assert.equal(FORMATS.gameSave.current, 4);
  assert.equal(formatVersionIssue(FORMATS.gameSave, 4), null);
  assert.equal(formatVersionIssue(FORMATS.gameSave, 5), "newerVersion");
  assert.equal(formatVersionIssue(FORMATS.gameSave, 3), "unsupportedVersion");
  assert.equal(formatVersionIssue(FORMATS.gameSave, "4"), "invalidVersion");
  assert.equal(formatVersionIssue(FORMATS.commandLog, 1), null);
  assert.equal(isFormat({ format: "island-settlers-command-log", version: 1 }, FORMATS.commandLog), true);
  assert.equal(isCurrentFormat({ format: "island-settlers-command-log", version: 1 }, FORMATS.commandLog), false);
  assert.equal(isFormat({ format: "island-settlers-game", version: 4 }, FORMATS.settlement), false);
  assert.equal(isFormat([], FORMATS.gameSave), false);
  assert.equal(isCurrentFormat({ version: 2 }, FORMATS.sceneReplay), true);
  const ids = Object.values(FORMATS).map(format => format.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const format of Object.values(FORMATS)) assert.ok(format.accepted.includes(format.current), format.id);
  const steps = { 2: (doc: Record<string, unknown>) => ({ ...doc, b: 1, version: 3 }),
    3: (doc: Record<string, unknown>) => ({ ...doc, c: 1, version: 4 }) };
  assert.deepEqual(migrateFormat(FORMATS.gameSave, { version: 2 }, steps), { b: 1, c: 1, version: 4 });
  assert.deepEqual(migrateFormat(FORMATS.gameSave, { version: 4 }, {}), { version: 4 });
  assert.equal(migrateFormat(FORMATS.gameSave, { version: 1 }, steps), null);
  assert.equal(migrateFormat(FORMATS.gameSave, { version: 5 }, steps), null);
  assert.equal(migrateFormat(FORMATS.gameSave, { version: 2 }, { 2: doc => ({ ...doc, version: 2 }) }), null);
});
