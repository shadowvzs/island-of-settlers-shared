import { FORMATS, formatVersionIssue, isCurrentFormat } from './formats.ts';

/** Lossless storage codec. Runtime saves and the game loader continue to use complete maps and fog arrays. */
export interface MapBase { hash: string; map: string }
export interface MapBases {
  /** Server storage can use its bounded, fast gzip codec without changing decoded map bytes. */
  encodeMap?(prefix: Uint8Array, payload: Uint8Array): Promise<string>;
  read(hash: string): Promise<string | null>;
  find(key: string, preferredHash?: string): Promise<MapBase | null>;
  /**
   * Server storage: pins the published catalogue map with this hash as the key's base without the client
   * uploading it (S08, owner D-S7). False when no such published revision exists.
   */
  linkCatalogue?(key: string, hash: string): Promise<boolean>;
  write(key: string, base: MapBase): Promise<void>;
}
interface Chunk { name: string; type: 'u8' | 'u16' | 'f32'; length: number }
/** A map file's uncompressed pieces: prefix, JSON header and every layer's byte planes by name. */
export interface MapParts { prefix: Uint8Array; header: Uint8Array; chunks: Map<string, Uint8Array> }
/** The current map of a save that is still in memory: its parts, and (only when needed) the whole map file. */
export interface LiveMap { file(): Promise<string>; parts: MapParts }
type Runs = [number, string][];
/** A grown or shrunk layer: per byte plane, patches of the common part and the new tail. */
interface PlaneDelta { planes: { runs: Runs; tail: string }[] }
/** The header as the base header's first `prefix` bytes, `middle`, and its last `suffix` bytes. */
interface HeaderPatch { middle: string; prefix: number; suffix: number }
/** Version 2: `header` and `headerPatch` are both absent when the header is the base's; version 1 always has `header`. */
interface MapDelta {
  version: 1 | 2; base: string; prefix: string; header?: string; headerPatch?: HeaderPatch;
  chunks: Record<string, string | Runs | PlaneDelta>;
}
const MAX_BYTES = 128 * 1024 * 1024;
const invalid = () => new Error('Invalid saved map delta');
export const bytesToBase64 = (bytes: Uint8Array): string => {
  let value = '';
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
};
export const base64ToBytes = (value: string): Uint8Array => {
  if (typeof value !== 'string' || value.length > MAX_BYTES * 2) throw invalid();
  const decoded = atob(value), bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
  return bytes;
};
/** Compression of a map file's payload by the prefix's codec byte (offset 6); version 1 and 2 files are gzip. */
const CODECS = ['gzip', 'brotli'] as const;
type Codec = typeof CODECS[number];
const CODEC_OFFSET = 6;
const codecOf = (prefix: Uint8Array): Codec => {
  const codec = CODECS[prefix[CODEC_OFFSET]!];
  if (!codec) throw invalid();
  return codec;
};
/** Brotli on a platform whose `DecompressionStream` lacks it (an older Node server): the built-in zlib. */
const brotliFallback = (bytes: Uint8Array): Uint8Array => {
  const zlib = (globalThis as { process?: { getBuiltinModule?: (name: string) => typeof import('node:zlib') } })
    .process?.getBuiltinModule?.('node:zlib');
  if (!zlib) throw invalid();
  return zlib.brotliDecompressSync(bytes, { maxOutputLength: MAX_BYTES });
};
const inflate = async (bytes: Uint8Array, codec: Codec) => {
  try { return await pipe(bytes, codec, true); }
  catch (error) { if (codec === 'brotli' && error instanceof TypeError) return brotliFallback(bytes); throw error; }
};
const pipe = async (bytes: Uint8Array, codec: Codec, decompress: boolean) => {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(
    decompress ? new DecompressionStream(codec as CompressionFormat) : new CompressionStream(codec as CompressionFormat));
  const reader = stream.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > MAX_BYTES) { await reader.cancel(); throw invalid(); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
};
const chunkTable = (header: Uint8Array): Chunk[] => {
  const value = JSON.parse(new TextDecoder().decode(header)) as { chunks?: Chunk[] };
  if (!Array.isArray(value.chunks) || value.chunks.length > 256) throw invalid();
  const names = new Set<string>();
  for (const chunk of value.chunks) {
    if (!chunk || typeof chunk.name !== 'string' || names.has(chunk.name) ||
      !['u8', 'u16', 'f32'].includes(chunk.type) || !Number.isSafeInteger(chunk.length) || chunk.length < 0)
      throw invalid();
    names.add(chunk.name);
  }
  return value.chunks;
};
const ELEMENT_BYTES = { u8: 1, u16: 2, f32: 4 };
const chunkLength = (chunk: Chunk) => chunk.length * ELEMENT_BYTES[chunk.type];
// At most one active map plus its base; inactive worlds cannot grow a process-wide save cache.
const mapPartsCache = new Map<string, { parts: MapParts; bytes: number }>();
const MAP_CACHE_BYTES = 48 * 1024 * 1024;
let cachedMapBytes = 0;
const splitMap = async (map: string): Promise<MapParts> => {
  const cached = mapPartsCache.get(map);
  if (cached) {
    mapPartsCache.delete(map); mapPartsCache.set(map, cached);
    return cached.parts;
  }
  const bytes = base64ToBytes(map);
  if (bytes.length < 12 || new TextDecoder().decode(bytes.subarray(0, 4)) !== 'IOSM') throw invalid();
  const raw = await inflate(bytes.subarray(8), codecOf(bytes));
  if (raw.length < 4) throw invalid();
  const length = new DataView(raw.buffer).getUint32(0, true);
  if (length > raw.length - 4) throw invalid();
  const header = raw.slice(4, 4 + length), chunks = new Map<string, Uint8Array>();
  let offset = 4 + length;
  for (const chunk of chunkTable(header)) {
    const end = offset + chunkLength(chunk);
    if (end > raw.length) throw invalid();
    chunks.set(chunk.name, raw.subarray(offset, end)); offset = end;
  }
  if (offset !== raw.length) throw invalid();
  const parts = { prefix: bytes.slice(0, 8), header, chunks };
  // Include the retained UTF-16 base64 key and header in the memory budget.
  const retained = raw.byteLength + map.length * 2 + header.byteLength + 8;
  if (retained <= MAP_CACHE_BYTES) {
    while (mapPartsCache.size && (mapPartsCache.size >= 2 || cachedMapBytes + retained > MAP_CACHE_BYTES)) {
      const oldest = mapPartsCache.keys().next().value!;
      cachedMapBytes -= mapPartsCache.get(oldest)!.bytes; mapPartsCache.delete(oldest);
    }
    mapPartsCache.set(map, { parts, bytes: retained }); cachedMapBytes += retained;
  }
  return parts;
};
export const mapIdentity = async (map: string) => {
  const parts = await splitMap(map);
  const header = JSON.parse(new TextDecoder().decode(parts.header));
  return `${header.seed}:${header.cellsX}:${header.cellsZ}`;
};
const equal = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return false;
  return true;
};
export const mapHash = async (map: string) => {
  const digest = await crypto.subtle.digest('SHA-256', base64ToBytes(map) as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};
const base64Length = (bytes: Uint8Array) => 4 * Math.ceil(bytes.length / 3);
/** The changed byte ranges of `bytes` against `previous` over their common length (runs merged within 8 bytes). */
const diffRuns = (bytes: Uint8Array, previous: Uint8Array, length = Math.min(bytes.length, previous.length)) => {
  const runs: Runs = [];
  let cursor = 0;
  while (cursor < length) {
    if (bytes[cursor] === previous[cursor]) { cursor++; continue; }
    const start = cursor;
    let lastChange = cursor++;
    while (cursor < length && cursor - lastChange <= 8) {
      if (bytes[cursor] !== previous[cursor]) lastChange = cursor;
      cursor++;
    }
    const end = lastChange + 1;
    runs.push([start, bytesToBase64(bytes.subarray(start, end))]);
    cursor = end;
  }
  return runs;
};
/** A layer whose length changed, diffed plane by plane (a prop appended shifts every byte plane). */
const diffPlanes = (bytes: Uint8Array, previous: Uint8Array, elementBytes: number): PlaneDelta => {
  const count = bytes.length / elementBytes, previousCount = previous.length / elementBytes;
  const common = Math.min(count, previousCount);
  const planes = Array.from({ length: elementBytes }, (_, plane) => {
    const current = bytes.subarray(plane * count, (plane + 1) * count);
    const before = previous.subarray(plane * previousCount, (plane + 1) * previousCount);
    return { runs: diffRuns(current, before, common), tail: bytesToBase64(current.subarray(common)) };
  });
  return { planes };
};
const diffChunk = (bytes: Uint8Array, previous: Uint8Array | undefined, elementBytes: number, sameType: boolean) => {
  const replacement = bytesToBase64(bytes);
  if (!previous || !sameType) return replacement;
  const diff = previous.length === bytes.length ? diffRuns(bytes, previous) : diffPlanes(bytes, previous, elementBytes);
  return JSON.stringify(diff).length < base64Length(bytes) ? diff : replacement;
};
const diffHeader = (header: Uint8Array, previous: Uint8Array): Pick<MapDelta, 'header' | 'headerPatch'> => {
  if (equal(header, previous)) return {};
  const limit = Math.min(header.length, previous.length);
  let prefix = 0;
  while (prefix < limit && header[prefix] === previous[prefix]) prefix++;
  let suffix = 0;
  while (suffix < limit - prefix && header[header.length - 1 - suffix] === previous[previous.length - 1 - suffix]) suffix++;
  const middle = bytesToBase64(header.subarray(prefix, header.length - suffix));
  return middle.length < base64Length(header) ? { headerPatch: { middle, prefix, suffix } } : { header: bytesToBase64(header) };
};
const typeByName = (header: Uint8Array) => new Map(chunkTable(header).map(chunk => [chunk.name, chunk.type]));
/** Only changed byte ranges are stored; every bit of every terrain float is preserved. */
export const createMapDelta = async (map: string, base: MapBase): Promise<MapDelta> =>
  createMapDeltaFromParts(await splitMap(map), base);
/** The same delta for a map held as parts (no compression and inflation of the current map). */
export const createMapDeltaFromParts = async (current: MapParts, base: MapBase): Promise<MapDelta> => {
  const original = await splitMap(base.map);
  const types = typeByName(current.header), previousTypes = typeByName(original.header);
  const chunks: MapDelta["chunks"] = Object.create(null);
  for (const [name, bytes] of current.chunks) {
    const previous = original.chunks.get(name);
    if (previous && equal(bytes, previous)) continue;
    const type = types.get(name)!;
    chunks[name] = diffChunk(bytes, previous, ELEMENT_BYTES[type], previousTypes.get(name) === type);
  }
  return { version: FORMATS.saveMapDelta.current, base: base.hash, prefix: bytesToBase64(current.prefix),
    ...diffHeader(current.header, original.header), chunks };
};
const applyHeaderPatch = (patch: HeaderPatch, previous: Uint8Array) => {
  if (!patch || typeof patch !== 'object' || !Number.isSafeInteger(patch.prefix) || !Number.isSafeInteger(patch.suffix) ||
    patch.prefix < 0 || patch.suffix < 0 || patch.prefix + patch.suffix > previous.length) throw invalid();
  const middle = base64ToBytes(patch.middle), header = new Uint8Array(patch.prefix + middle.length + patch.suffix);
  header.set(previous.subarray(0, patch.prefix)); header.set(middle, patch.prefix);
  header.set(previous.subarray(previous.length - patch.suffix), patch.prefix + middle.length);
  return header;
};
const restoreHeader = (delta: MapDelta, previous: Uint8Array) => {
  if (delta.version === 2 && delta.headerPatch !== undefined) return applyHeaderPatch(delta.headerPatch, previous);
  if (delta.header !== undefined) return base64ToBytes(delta.header);
  if (delta.version === 2) return previous;
  throw invalid();
};
const applyRuns = (runs: unknown, bytes: Uint8Array, limit = bytes.length) => {
  if (!Array.isArray(runs) || runs.length > limit) throw invalid();
  let end = 0;
  for (const run of runs) {
    if (!Array.isArray(run) || run.length !== 2 || !Number.isSafeInteger(run[0]) || run[0] < end ||
      typeof run[1] !== 'string') throw invalid();
    const replacement = base64ToBytes(run[1]);
    end = run[0] + replacement.length;
    if (!replacement.length || end > limit) throw invalid();
    bytes.set(replacement, run[0]);
  }
};
/** The grown or shrunk layer: base plane prefix, its patches, then the new tail of every plane. */
const applyPlanes = (patch: PlaneDelta, previous: Uint8Array, chunk: Chunk) => {
  const elementBytes = ELEMENT_BYTES[chunk.type], previousCount = previous.length / elementBytes;
  if (!Array.isArray(patch.planes) || patch.planes.length !== elementBytes || !Number.isInteger(previousCount)) throw invalid();
  const bytes = new Uint8Array(chunkLength(chunk)), common = Math.min(chunk.length, previousCount);
  patch.planes.forEach((plane, index) => {
    if (!plane || typeof plane.tail !== 'string') throw invalid();
    const target = bytes.subarray(index * chunk.length, (index + 1) * chunk.length);
    target.set(previous.subarray(index * previousCount, index * previousCount + common));
    applyRuns(plane.runs, target, common);
    const tail = base64ToBytes(plane.tail);
    if (tail.length !== chunk.length - common) throw invalid();
    target.set(tail, common);
  });
  return bytes;
};
const restoreChunk = (delta: MapDelta, chunk: Chunk, previous: Uint8Array | undefined) => {
  if (!Object.hasOwn(delta.chunks, chunk.name)) return previous?.slice();
  const patch = delta.chunks[chunk.name];
  if (typeof patch === 'string') return base64ToBytes(patch);
  if (!previous) throw invalid();
  if (Array.isArray(patch)) {
    const bytes = previous.slice();
    applyRuns(patch, bytes);
    return bytes;
  }
  if (delta.version === 2 && patch && typeof patch === 'object') return applyPlanes(patch, previous, chunk);
  throw invalid();
};
export const restoreMapDelta = async (delta: MapDelta, bases: Pick<MapBases, 'read' | 'encodeMap'>): Promise<string> => {
  if (!delta || formatVersionIssue(FORMATS.saveMapDelta, delta.version) || !/^[a-f0-9]{64}$/.test(delta.base) ||
    !delta.chunks || typeof delta.chunks !== 'object') throw invalid();
  const map = await bases.read(delta.base);
  if (!map) throw new Error('The immutable base map for this save is missing');
  const original = await splitMap(map), prefix = base64ToBytes(delta.prefix);
  const header = restoreHeader(delta, original.header);
  if (prefix.length !== 8 || !equal(prefix.subarray(0, 4), original.prefix.subarray(0, 4))) throw invalid();
  const table = chunkTable(header);
  const length = 4 + header.length + table.reduce((sum, chunk) => sum + chunkLength(chunk), 0);
  if (length > MAX_BYTES) throw invalid();
  const raw = new Uint8Array(length);
  new DataView(raw.buffer).setUint32(0, header.length, true); raw.set(header, 4);
  let offset = 4 + header.length;
  for (const chunk of table) {
    const bytes = restoreChunk(delta, chunk, original.chunks.get(chunk.name));
    if (!bytes || bytes.length !== chunkLength(chunk)) throw invalid();
    raw.set(bytes, offset); offset += bytes.length;
  }
  // The restored map is recompressed with fast gzip, whatever codec the saved file used.
  const gzipPrefix = Uint8Array.from(prefix); gzipPrefix[CODEC_OFFSET] = CODECS.indexOf('gzip');
  if (bases.encodeMap) return bases.encodeMap(gzipPrefix, raw);
  const compressed = await pipe(raw, 'gzip', false), output = new Uint8Array(8 + compressed.length);
  output.set(gzipPrefix); output.set(compressed, 8);
  return bytesToBase64(output);
};
const liveDeltas = new WeakMap<MapParts, { base: string; delta: MapDelta }>();
/** The delta of live parts against a base, computed once per parts and base (a save compacts twice). */
const liveDelta = async (parts: MapParts, base: MapBase) => {
  const known = liveDeltas.get(parts);
  if (known?.base === base.hash) return known.delta;
  const delta = await createMapDeltaFromParts(parts, base);
  liveDeltas.set(parts, { base: base.hash, delta });
  return delta;
};
/**
 * Storage-only marker. It is removed before returning data to any existing loader or simulator.
 * `live` carries the current map when the caller holds it as parts: `data.map` may then be empty and
 * the map file is built only when no base exists yet.
 */
export const compactIsland = async (
  data: Record<string, unknown>, key: string, bases: MapBases, live?: LiveMap
): Promise<Record<string, unknown>> => {
  if (data.format !== 'island-settlers-game' || (!live && (typeof data.map !== 'string' || !data.map))) return data;
  const world = (data.settlement as { world?: { seed: number; cellsX: number; cellsZ: number } })?.world;
  if (!world) return data;
  key = `${key}:${world.seed}:${world.cellsX}:${world.cellsZ}`;
  const preferred = (data.mapProvenance as { hash?: string } | undefined)?.hash;
  let base = await bases.find(key, preferred);
  if (!base) {
    const map = live ? await live.file() : data.map as string;
    base = { hash: await mapHash(map), map };
    await bases.write(key, base);
  }
  const delta = live ? await liveDelta(live.parts, base) : await createMapDelta(data.map as string, base);
  return { ...data, map: '', saveEncoding: { version: FORMATS.saveMapEncoding.current, map: delta } };
};
export const expandIsland = async (
  data: Record<string, unknown>, bases: Pick<MapBases, 'read' | 'encodeMap'>
): Promise<Record<string, unknown>> => {
  if (!Object.hasOwn(data, 'saveEncoding')) return data;
  const encoding = data.saveEncoding as { version: number; map: MapDelta };
  if (!isCurrentFormat(encoding, FORMATS.saveMapEncoding) || data.format !== FORMATS.gameSave.id) throw invalid();
  const { saveEncoding: _encoding, ...rest } = data;
  return { ...rest, map: await restoreMapDelta(encoding.map, bases) };
};
