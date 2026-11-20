import { CORE_CATEGORIES, CORE_DATA_FILES } from "./data/index.ts";
import { familyMatches } from "./family.ts";
import { deepFreeze } from "./helpers.ts";
import type { CatalogCategory, ContentEntry, ContentKind, EntryOfKind } from "./types/index.ts";

interface LoadedCatalog {
  byCode: ReadonlyMap<ContentKind, readonly (ContentEntry | undefined)[]>;
  byId: ReadonlyMap<string, ContentEntry>;
  byKind: ReadonlyMap<ContentKind, readonly ContentEntry[]>;
  byTag: ReadonlyMap<string, readonly ContentEntry[]>;
  categories: readonly CatalogCategory[];
  entries: readonly ContentEntry[];
}

const pushTo = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

/** Dense array by code per kind: hot paths index it directly instead of looking up strings. */
const indexCodes = (entries: readonly ContentEntry[]) => {
  const byCode = new Map<ContentKind, (ContentEntry | undefined)[]>();
  for (const entry of entries) {
    if (entry.code === undefined) continue;
    const codes = byCode.get(entry.kind) ?? [];
    codes[entry.code] = entry;
    byCode.set(entry.kind, codes);
  }
  return byCode;
};

const buildCatalog = (): LoadedCatalog => {
  // The data is validated in tests, the client Vite build/dev start and the API start-up (validate/index.ts).
  const entries = CORE_DATA_FILES.flatMap(file => file.entries as readonly ContentEntry[]);
  const categories = [...(CORE_CATEGORIES as readonly CatalogCategory[])]
    .sort((first, second) => first.order - second.order);
  const byKind = new Map<ContentKind, ContentEntry[]>();
  const byTag = new Map<string, ContentEntry[]>();
  for (const entry of entries.filter(item => !item.retired)) {
    pushTo(byKind, entry.kind, entry);
    for (const tag of entry.tags) pushTo(byTag, tag, entry);
  }
  deepFreeze(entries);
  deepFreeze(categories);
  for (const lists of [byKind, byTag]) for (const list of lists.values()) Object.freeze(list);
  const byCode = indexCodes(entries);
  for (const codes of byCode.values()) Object.freeze(codes);
  return { byCode, byId: new Map(entries.map(entry => [entry.id, entry])), byKind, byTag, categories, entries };
};

let loaded: LoadedCatalog | null = null;
/** The core catalog: built once on first use, deep-frozen, never validated at runtime. */
const catalog = () => (loaded ??= buildCatalog());

/** Every core entry, retired ones included (ids are never reused). */
export const catalogEntries = (): readonly ContentEntry[] => catalog().entries;

/** The entry of an id, retired ones included; undefined for an unknown id. */
export const getContentEntry = (id: string): ContentEntry | undefined => catalog().byId.get(id);

/** The active (non-retired) entries of one kind, in data file order. */
export const entriesOfKind = <K extends ContentKind>(kind: K): readonly EntryOfKind<K>[] =>
  (catalog().byKind.get(kind) ?? []) as readonly EntryOfKind<K>[];

/** The entry of a persisted numeric code, retired ones included. */
export const entryByCode = <K extends ContentKind>(kind: K, code: number): EntryOfKind<K> | undefined =>
  catalog().byCode.get(kind)?.[code] as EntryOfKind<K> | undefined;

/** The entry of a persisted key (`ware`, "logs"), retired ones included. */
export const entryByKey = <K extends ContentKind>(kind: K, key: string): EntryOfKind<K> | undefined =>
  catalog().byId.get(`${kind}:${key}`) as EntryOfKind<K> | undefined;

/** Active entries whose family the selector covers ("animal" covers "animal.deer"). */
export const entriesInFamily = (selector: string): readonly ContentEntry[] =>
  catalog().entries.filter(entry => !entry.retired && familyMatches(selector, entry.family));

/** Active entries carrying a tag. */
export const entriesWithTag = (tag: string): readonly ContentEntry[] => catalog().byTag.get(tag) ?? [];

/** The categories of a kind in display order. */
export const categoriesOfKind = (kind: ContentKind): readonly CatalogCategory[] =>
  catalog().categories.filter(category => category.kind === kind);

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const HEX_DIGITS = 8;

let version: string | null = null;
/**
 * Content hash of the core catalog (FNV-1a over its JSON): map files store the version they were authored with
 * and the map editor warns when a loaded map's version differs. Computed lazily, once.
 */
export const contentCatalogVersion = () => {
  if (version) return version;
  const text = JSON.stringify({ categories: CORE_CATEGORIES, files: CORE_DATA_FILES });
  let hash = FNV_OFFSET;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), FNV_PRIME);
  version = (hash >>> 0).toString(16).padStart(HEX_DIGITS, "0");
  return version;
};
