import { FORMATS } from "./formats.ts";

/**
 * The map file envelope shared by the client and the API (trigger design §9.4: the server decodes header scripts
 * without the client package). A `.island` file is 4 magic bytes, the format version (uint16, little endian), the
 * compression codec (one byte, see `MAP_CODECS`), 1 reserved byte, then the compressed stream of the payload: the
 * JSON header length (uint32), the JSON header, the layer chunks back to back. Layers stay client-side.
 */
export const MAP_MAGIC = FORMATS.binaryMap.id;
export const MAP_FORMAT_VERSION = FORMATS.binaryMap.current;
export const MIN_MAP_FORMAT_VERSION = Math.min(...FORMATS.binaryMap.accepted);
/** Magic, version, codec and reserved byte before the compressed stream. */
export const MAP_PREFIX_BYTES = 8;
/** Compression of the payload, by the value of the prefix's codec byte (offset 6). */
export const MAP_CODECS = ["gzip", "brotli"] as const;
export type MapCodec = (typeof MAP_CODECS)[number];
export const MAP_CODEC_OFFSET = 6;

export const MAP_DAMAGED = "The map file is damaged.";

/** A file that is not a map, a newer format, or damaged: the message is shown to the player. */
export class MapFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapFileError";
  }
}

/**
 * Checks the magic and the version (every version since the first loads); returns nothing or
 * throws a message for the player.
 */
export const checkMapPrefix = (bytes: Uint8Array) => {
  const magic = new TextDecoder().decode(bytes.subarray(0, MAP_MAGIC.length));
  if (bytes.length < MAP_PREFIX_BYTES || magic !== MAP_MAGIC) {
    throw new MapFileError("This is not an island map file.");
  }
  const version = new DataView(bytes.buffer, bytes.byteOffset).getUint16(4, true);
  if (version > MAP_FORMAT_VERSION) {
    throw new MapFileError("The map was saved by a newer version of the game.");
  }
  if (version < MIN_MAP_FORMAT_VERSION) throw new MapFileError("Unknown map file version.");
  if (bytes[MAP_CODEC_OFFSET]! >= MAP_CODECS.length) throw new MapFileError("Unknown map file compression.");
};

const pipeBytes = async (bytes: Uint8Array, stream: GenericTransformStream) => {
  const source = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream();
  const piped = source.pipeThrough(stream as TransformStream<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(piped).arrayBuffer());
};

/** gzip or brotli through the platform's compression streams (browsers and Node). */
export const compressBytes = (bytes: Uint8Array, codec: MapCodec) =>
  pipeBytes(bytes, new CompressionStream(codec as CompressionFormat));

/** Throws on a damaged stream, or when the platform cannot decompress the codec. */
export const decompressBytes = (bytes: Uint8Array, codec: MapCodec) =>
  pipeBytes(bytes, new DecompressionStream(codec as CompressionFormat));

/** The decompressed payload of a prefix-checked map file. */
export const inflateMapPayload = async (bytes: Uint8Array) => {
  const codec = MAP_CODECS[bytes[MAP_CODEC_OFFSET]!]!;
  const compressed = bytes.subarray(MAP_PREFIX_BYTES);
  try {
    return await decompressBytes(compressed, codec);
  } catch (error) {
    if (codec !== "gzip" && error instanceof TypeError) {
      throw new MapFileError(`This map uses ${codec} compression, which this browser cannot read.`);
    }
    throw new MapFileError(MAP_DAMAGED);
  }
};

/** The parsed (unchecked) JSON header of a payload and where the layer chunks start. */
export const splitMapHeader = (payload: Uint8Array): { header: unknown; offset: number } => {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const length = payload.length >= 4 ? view.getUint32(0, true) : -1;
  if (length < 2 || 4 + length > payload.length) throw new MapFileError(MAP_DAMAGED);
  try {
    const text = new TextDecoder().decode(payload.subarray(4, 4 + length));
    return { header: JSON.parse(text) as unknown, offset: 4 + length };
  } catch {
    throw new MapFileError(MAP_DAMAGED);
  }
};

/** The JSON header of a whole map file (the API reads scripts this way; layers are not decoded). */
export const readMapFileHeader = async (bytes: Uint8Array): Promise<unknown> => {
  checkMapPrefix(bytes);
  return splitMapHeader(await inflateMapPayload(bytes)).header;
};
