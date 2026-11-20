import { entriesOfKind } from "./loader.ts";
import type { LifeEntry } from "./types/life.ts";
import type { DepositEntry, EditorToolChoice, PropEntry } from "./types/props.ts";

const PROP_KINDS = ["tree", "stone", "plant", "shell"] as const;

let byCode: readonly (PropEntry | undefined)[] | null = null;
/** Ground props by persisted prop-kind byte (trees, stones, plants, shells share one byte space). */
const propsByCode = () => {
  if (byCode) return byCode;
  const codes: (PropEntry | undefined)[] = [];
  for (const kind of PROP_KINDS) for (const entry of entriesOfKind(kind)) codes[entry.code] = entry;
  byCode = Object.freeze(codes);
  return byCode;
};

/** Every ground prop (trees, stones, plants, shells) in catalog order. */
export const propEntries = (): readonly PropEntry[] => PROP_KINDS.flatMap(kind => entriesOfKind(kind));

/** The ground prop of a prop-kind byte; undefined for a byte without an entry (e.g. `PROP_REMOVED`). */
export const propEntryByCode = (code: number): PropEntry | undefined => propsByCode()[code];

/** An entry a map editor tool places: a ground prop, a deposit or a wildlife species. */
export type EditorPlaceable = DepositEntry | LifeEntry | PropEntry;

/** The editor tool choice of a placeable entry. */
export const editorChoice = (entry: EditorPlaceable): EditorToolChoice | undefined => {
  if ("prop" in entry) return entry.prop.editor;
  if ("deposit" in entry) return entry.deposit.editor;
  return entry.life.editor;
};

/** Ground props, deposits and wildlife a map editor tool offers, in tool order. */
export const editorToolEntries = (tool: EditorToolChoice["tool"]): readonly EditorPlaceable[] =>
  [...propEntries(), ...entriesOfKind("deposit"), ...entriesOfKind("animal")]
    .filter(entry => editorChoice(entry)?.tool === tool)
    .sort((first, second) => editorChoice(first)!.order - editorChoice(second)!.order);
