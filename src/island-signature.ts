/**
 * Content signature of one stored island document (research 12 S07, owner 2026-11-07). Client and server
 * compute it over the same text: the schema version, the metadata JSON and the island's compact JSON text
 * (the exact text the server stores in `game.islands.compressed_save`). Both ends hash the text they already
 * hold, so no extra serialisation is needed, and a mismatch only costs one complete upload.
 */
const encoder = new TextEncoder();
const SIGNATURE_PATTERN = /^[a-f0-9]{64}$/;

export const isIslandSignature = (value: unknown): value is string =>
  typeof value === 'string' && SIGNATURE_PATTERN.test(value);

const toHex = (digest: ArrayBuffer) =>
  Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');

/** `metadataJson` is `JSON.stringify(metadata)`; `dataJson` the island's compact JSON text (string or bytes). */
export const islandContentSignature = async (
  schemaVersion: number, metadataJson: string, dataJson: string | Uint8Array
): Promise<string> => {
  const head = encoder.encode(`${schemaVersion}\n${metadataJson}\n`);
  const data = typeof dataJson === 'string' ? encoder.encode(dataJson) : dataJson;
  const bytes = new Uint8Array(head.length + data.length);
  bytes.set(head);
  bytes.set(data, head.length);
  return toHex(await crypto.subtle.digest('SHA-256', bytes));
};
