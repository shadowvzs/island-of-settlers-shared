import { fillPathTokens } from "./paths.ts";
import type { AssetRef, ModelRef, RecipeId, SidecarRef } from "./types/refs.ts";

/**
 * References every entry of one data file shares (owner answer 62), written once in `data/defaults.json` instead
 * of on each entry. An entry's own value for one of these fields replaces that field's default as a whole.
 */
export interface EntryDefaults {
  /**
   * An asset path keeps its tokens (`ware-icons/{key}.png`): readers fill them per entry, exactly like a token in
   * an icon reference written on the entry itself.
   */
  icon?: AssetRef;
  /** A recipe id may use `{key}`: it is filled with the entry key when the default is applied. */
  model?: ModelRef;
  sidecars?: Readonly<Record<string, SidecarRef>>;
}

type RawEntry = Readonly<Record<string, unknown>>;

const modelOf = (model: ModelRef, key: string): ModelRef => {
  if (model.kind !== "recipe") return model;
  return { kind: "recipe", recipe: fillPathTokens(model.recipe, { key }) as RecipeId };
};

const withDefaults = (entry: RawEntry, defaults: EntryDefaults): RawEntry => {
  const needsIcon = defaults.icon !== undefined && entry.icon === undefined;
  const needsModel = defaults.model !== undefined && entry.model === undefined;
  const needsSidecars = defaults.sidecars !== undefined && entry.sidecars === undefined;
  if (!needsIcon && !needsModel && !needsSidecars) return entry;
  return {
    ...entry,
    ...(needsIcon ? { icon: defaults.icon } : undefined),
    ...(needsModel ? { model: modelOf(defaults.model!, String(entry.key)) } : undefined),
    ...(needsSidecars ? { sidecars: defaults.sidecars } : undefined)
  };
};

/**
 * The entries of a data file with the file's default references filled in, once at module load. Every reader
 * (loader, validator, version hash) works on these resolved entries, so a default resolves exactly like the
 * same reference written on the entry.
 */
export const applyEntryDefaults = (entries: unknown, defaults: EntryDefaults | undefined): unknown => {
  if (!defaults || !Array.isArray(entries)) return entries;
  return entries.map((entry: RawEntry) => withDefaults(entry, defaults));
};
