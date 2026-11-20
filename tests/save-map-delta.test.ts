import assert from 'node:assert/strict';
import { test } from 'node:test';
import { brotliCompressSync, brotliDecompressSync, gzipSync, gunzipSync } from 'node:zlib';
import {
  base64ToBytes, bytesToBase64, compactIsland, createMapDelta, expandIsland, mapHash,
  restoreMapDelta, type MapBase, type MapBases
} from '../src/save-map-delta.ts';

const makeMap = (heights: number[], extra = false, savedAt = 1) => {
  const values = new Float32Array(heights);
  const header = Buffer.from(JSON.stringify({ seed: 7, cellsX: 8, cellsZ: 8, savedAt, chunks: [
    { name: 'heights', type: 'f32', length: values.length },
    ...(extra ? [{ name: 'lakeWater', type: 'u8', length: 3 }] : [])
  ] }));
  const size = Buffer.alloc(4); size.writeUInt32LE(header.length);
  const payload = Buffer.concat([size, header, Buffer.from(values.buffer), ...(extra ? [Buffer.from([0, 1, 0])] : [])]);
  return bytesToBase64(Buffer.concat([Buffer.from([73, 79, 83, 77, 2, 0, 0, 0]), gzipSync(payload)]));
};
const raw = (map: string) => {
  const bytes = base64ToBytes(map);
  return (bytes[6] === 1 ? brotliDecompressSync : gunzipSync)(bytes.subarray(8));
};
const memoryBases = (): MapBases => {
  const keys = new Map<string, MapBase>(), hashes = new Map<string, string>();
  return { read: async hash => hashes.get(hash) ?? null, find: async key => keys.get(key) ?? null,
    write: async (key, base) => { keys.set(key, base); hashes.set(base.hash, base.map); } };
};

test('map deltas preserve exact float bytes, header changes and added/removed/resized layers', async () => {
  const initial = makeMap([0, -0, 1.123456789, 9]);
  const base = { hash: await mapHash(initial), map: initial };
  const bases = memoryBases(); await bases.write('home', base);
  for (const map of [initial, makeMap([0, -0, 1.123456789, 10], true, 1000), makeMap([4, 5], false, 2000)]) {
    const restored = await restoreMapDelta(await createMapDelta(map, base), bases);
    assert.deepEqual(raw(restored), raw(map));
  }
  const added = makeMap([1, 2, 3], true);
  const second = { hash: await mapHash(added), map: added }; await bases.write('colony', second);
  assert.deepEqual(raw(await restoreMapDelta(await createMapDelta(initial, second), bases)), raw(initial));
});

test('island persistence preserves all simulation data and keeps deltas cumulative against one base', async () => {
  const bases = memoryBases();
  const game = { format: 'island-settlers-game', map: makeMap([1, 2, 3]),
    progress: { fog: { length: 5, packed: 'GQA=' }, surveyed: [[1, true]] },
    settlement: { world: { seed: 7, cellsX: 8, cellsZ: 8 },
      actors: [{ uid: 9, x: 1.123456789, timer: .125, path: [{ x: 2, z: 3 }], carried: { logs: 1 } }],
      buildings: [{ foundationTileIndex: 2, foundationTileWork: .25 }], plantingRandomState: 123 } };
  for (const key of ['home', 'colony-1', 'adventure-2']) {
    const stored = await compactIsland(game, key, bases);
    assert.equal(stored.map, '');
    const restored = await expandIsland(stored, bases);
    assert.deepEqual({ ...restored, map: game.map }, game);
    assert.deepEqual(raw(restored.map as string), raw(game.map));
    const changed = { ...game, map: makeMap([1, 8, 3], true, 2) };
    const next = await compactIsland(changed, key, bases);
    const restoredNext = await expandIsland(next, bases);
    assert.deepEqual(raw(restoredNext.map as string), raw(changed.map));
    // A delta remains self-contained with its base; it does not require the previous saved delta.
    assert.deepEqual(await expandIsland(stored, bases), restored);
  }
  assert.equal(await expandIsland(game, bases), game);
});

test('missing bases and malformed patches fail instead of regenerating or guessing terrain', async () => {
  const map = makeMap([1, 2, 3]);
  const base = { hash: await mapHash(map), map };
  const delta = await createMapDelta(makeMap([2, 2, 3]), base);
  await assert.rejects(restoreMapDelta(delta, memoryBases()), /missing/);
  const bases = memoryBases(); await bases.write('home', base);
  delta.chunks.heights = [[999999, 'AA==']];
  await assert.rejects(restoreMapDelta(delta, bases));
});

const toPlanes = (values: Float32Array | Uint8Array) => {
  const elementBytes = values.BYTES_PER_ELEMENT, source = new Uint8Array(values.buffer);
  const planes = new Uint8Array(source.length);
  for (let plane = 0; plane < elementBytes; plane++)
    for (let index = 0; index < values.length; index++) planes[plane * values.length + index] = source[index * elementBytes + plane]!;
  return planes;
};
/** A map whose layers are byte planes like the game's: a prop layer of each element size. */
const makePropMap = (count: number, change: (x: Float32Array, types: Uint8Array) => void = () => {}, savedAt = 1) => {
  const x = Float32Array.from({ length: count }, (_, index) => Math.fround(index * 0.37 + 0.001));
  const types = Uint8Array.from({ length: count }, (_, index) => index % 7);
  change(x, types);
  const header = Buffer.from(JSON.stringify({ seed: 7, cellsX: 8, cellsZ: 8, savedAt, propCount: count, chunks: [
    { name: 'props.x', type: 'f32', length: count }, { name: 'props.types', type: 'u8', length: count }] }));
  const size = Buffer.alloc(4); size.writeUInt32LE(header.length);
  const payload = Buffer.concat([size, header, toPlanes(x), toPlanes(types)]);
  return bytesToBase64(Buffer.concat([Buffer.from([73, 79, 83, 77, 2, 0, 0, 0]), gzipSync(payload)]));
};
const restoreAgainst = async (base: string, map: string) => {
  const bases = memoryBases(), baseEntry = { hash: await mapHash(base), map: base };
  await bases.write('home', baseEntry);
  const delta = await createMapDelta(map, baseEntry);
  return { delta, restored: await restoreMapDelta(JSON.parse(JSON.stringify(delta)), bases) };
};

test('an unchanged header is omitted and a changed one is sent as a small patch', async () => {
  const base = makePropMap(50);
  const same = await restoreAgainst(base, makePropMap(50));
  assert.equal(same.delta.version, 2);
  assert.equal(same.delta.header, undefined);
  assert.equal(same.delta.headerPatch, undefined);
  assert.deepEqual(Object.keys(same.delta.chunks), []);
  assert.deepEqual(raw(same.restored), raw(base));
  const later = makePropMap(50, () => {}, 99999);
  const patched = await restoreAgainst(base, later);
  assert.equal(patched.delta.header, undefined);
  assert.ok(patched.delta.headerPatch && patched.delta.headerPatch.middle.length <= 8);
  assert.deepEqual(raw(patched.restored), raw(later));
});

test('grown and shrunk layers are diffed plane by plane and restore exactly', async () => {
  for (const grow of [1, 1000, -1, -40]) {
    const count = 4000 + grow;
    const changed = (x: Float32Array, types: Uint8Array) => {
      x[2] = 123.5; x[7] = -4; types[3] = 99;
    };
    const map = makePropMap(count, changed, 5);
    const { delta, restored } = await restoreAgainst(makePropMap(4000), map);
    assert.deepEqual(raw(restored), raw(map), `grow ${grow}`);
    for (const name of ['props.x', 'props.types']) assert.ok(typeof delta.chunks[name] === 'object' && !Array.isArray(delta.chunks[name]), name);
  }
});

test('a prop appended to a dense forest costs under 1% of resending the layers', async () => {
  const base = makePropMap(100_000), grown = makePropMap(100_001, (x) => { x[5] = 9.25; });
  const { delta, restored } = await restoreAgainst(base, grown);
  assert.deepEqual(raw(restored), raw(grown));
  const full = 4 * Math.ceil(100_000 * 4 / 3) + 4 * Math.ceil(100_000 / 3);
  assert.ok(JSON.stringify(delta).length < full / 100, String(JSON.stringify(delta).length));
});

test('version 1 deltas still restore', async () => {
  const initial = makeMap([1, 2, 3, 4]);
  const bases = memoryBases(), base = { hash: await mapHash(initial), map: initial }; await bases.write('home', base);
  const changed = makeMap([1, 2, 9, 4], false, 7);
  const delta = await createMapDelta(changed, base);
  const version1 = { version: 1, base: base.hash, prefix: delta.prefix, header: bytesToBase64(raw(changed).subarray(4, 4 + raw(changed).readUInt32LE(0))),
    chunks: { heights: [[8, bytesToBase64(raw(changed).subarray(raw(changed).length - 8, raw(changed).length - 4))]] } };
  assert.deepEqual(raw(await restoreMapDelta(version1 as never, bases)), raw(changed));
});

test('malformed version 2 patches fail', async () => {
  const base = makePropMap(2000), bases = memoryBases(), entry = { hash: await mapHash(base), map: base };
  await bases.write('home', entry);
  const delta = JSON.parse(JSON.stringify(await createMapDelta(makePropMap(2002), entry)));
  const broken = (change: (value: typeof delta) => void) => {
    const copy = structuredClone(delta); change(copy); return restoreMapDelta(copy, bases);
  };
  await assert.rejects(broken(value => { value.chunks['props.x'].planes.pop(); }));
  await assert.rejects(broken(value => { value.chunks['props.x'].planes[0].tail = ''; }));
  await assert.rejects(broken(value => { value.headerPatch = { middle: '', prefix: 1e6, suffix: 0 }; }));
  await assert.rejects(broken(value => { value.version = 1; }));
});

/** A map file with another prefix version and codec (map format 3 adds the codec byte). */
const withFormat = (map: string, version: number, codec: 'gzip' | 'brotli') => {
  const payload = raw(map);
  const compressed = codec === 'brotli' ? brotliCompressSync(payload) : gzipSync(payload);
  return bytesToBase64(Buffer.concat([Buffer.from([73, 79, 83, 77, version, 0, codec === 'brotli' ? 1 : 0, 0]), compressed]));
};

test('a delta restores against a base of another format version and codec, recompressed as gzip', async () => {
  const initial = makeMap([1, 2, 3, 4]);
  const baseMap = withFormat(initial, 2, 'gzip');
  const base = { hash: await mapHash(baseMap), map: baseMap };
  const bases = memoryBases(); await bases.write('home', base);
  for (const codec of ['gzip', 'brotli'] as const) {
    const current = withFormat(makeMap([1, 2, 9, 4], false, 5), 3, codec);
    const restored = await restoreMapDelta(await createMapDelta(current, base), bases);
    assert.deepEqual(raw(restored), raw(current));
    assert.deepEqual([...base64ToBytes(restored).subarray(4, 7)], [3, 0, 0]);
  }
});

test('a brotli base is decoded and an unknown codec is rejected', async () => {
  const baseMap = withFormat(makeMap([1, 2, 3]), 3, 'brotli');
  const base = { hash: await mapHash(baseMap), map: baseMap };
  const bases = memoryBases(); await bases.write('home', base);
  assert.deepEqual(raw(await restoreMapDelta(await createMapDelta(baseMap, base), bases)), raw(baseMap));
  const tampered = Buffer.from(base64ToBytes(baseMap)); tampered[6] = 7;
  await assert.rejects(createMapDelta(bytesToBase64(tampered), base));
});
