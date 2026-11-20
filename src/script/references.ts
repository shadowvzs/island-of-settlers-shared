import { fieldPath, indexPath, isPlainObject } from "../validation/index.ts";
import { SCRIPT_REF_KINDS } from "./constants.ts";
import type { ScriptRef, ScriptRefKind } from "./types/refs.ts";
import type { MapScript } from "./types/script.ts";

/**
 * The one generic reference walk (trigger design §4.1, §13.9, rev M4): every `{ k: "ref" }` node of a script, with
 * its path and the top-level item that holds it. "Used by", delete refusal, the export dependency closure, the
 * import remapper and the validator's existence checks all read this list.
 */
export interface ScriptReference {
  id: string;
  kind: ScriptRefKind;
  /** The top-level item holding the reference, e.g. "trigger:trigger-1", "quest:grove", "variable:var-3". */
  owner: string;
  path: string;
}

export const isScriptRef = (value: unknown): value is ScriptRef => isPlainObject(value) && value.k === "ref" &&
  typeof value.id === "string" && SCRIPT_REF_KINDS.includes(value.kind as ScriptRefKind);

/** Calls `visit` for every reference node under `value` (depth first, document order). */
export const walkScriptRefs = (value: unknown, path: string, visit: (ref: ScriptRef, path: string) => void) => {
  if (isScriptRef(value)) {
    visit(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkScriptRefs(item, indexPath(path, index), visit));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, item] of Object.entries(value)) walkScriptRefs(item, fieldPath(path, key), visit);
};

/** Top-level script items that own references, with their owner prefix. */
const ownedItems = (script: MapScript) => [
  ...script.triggers.map((item, index) => ({ item, owner: `trigger:${item.id}`, path: `triggers[${index}]` })),
  ...script.quests.quests.map((item, index) =>
    ({ item, owner: `quest:${item.id}`, path: `quests.quests[${index}]` })),
  ...script.variables.map((item, index) => ({ item, owner: `variable:${item.id}`, path: `variables[${index}]` })),
  ...script.actors.map((item, index) => ({ item, owner: `actor:${item.id}`, path: `actors[${index}]` })),
  ...script.homeRewards.map((item, index) => ({ item, owner: `reward:${item.id}`, path: `homeRewards[${index}]` }))
];

/** Every reference of the script, grouped by its owning trigger, quest, variable, actor or declared reward. */
export const scriptReferences = (script: MapScript): ScriptReference[] => {
  const references: ScriptReference[] = [];
  for (const { item, owner, path } of ownedItems(script))
    walkScriptRefs(item, path, (ref, refPath) => references.push({ id: ref.id, kind: ref.kind, owner, path: refPath }));
  return references;
};

/** Owners that reference `kind`/`id` (sorted, unique): the "used by" list and the delete refusal. */
export const scriptUsersOf = (references: readonly ScriptReference[], kind: ScriptRefKind, id: string) =>
  [...new Set(references.filter(reference => reference.kind === kind && reference.id === id)
    .map(reference => reference.owner))].sort();
