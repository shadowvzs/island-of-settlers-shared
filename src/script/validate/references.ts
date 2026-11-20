import { scriptReferences, type ScriptReference } from "../references.ts";
import type { ScriptRefKind } from "../types/refs.ts";
import type { ValidationRun } from "./context.ts";

/**
 * Existence of every reference, from the one generic walk (rev M4): map-local ids against the script, catalog ids
 * and family paths against the content catalog. Slot checks later only test the reference kind and type.
 */

const localExists = (run: ValidationRun, kind: ScriptRefKind, id: string): boolean => {
  const { index } = run;
  const sets: Partial<Record<ScriptRefKind, { has: (id: string) => boolean }>> = {
    actor: index.actors, folder: index.folders, quest: index.quests, region: index.regions, reward: index.rewards,
    sequence: index.sequences, shot: index.shots, step: index.steps, trigger: index.triggers,
    variable: index.variables
  };
  return sets[kind]?.has(id) ?? true;
};

const checkVariableRef = (run: ValidationRun, reference: ScriptReference, expected: "multiboard" | "timer") => {
  const variable = run.index.variables.get(reference.id);
  const { path } = reference;
  if (!variable) run.sink.add("error", "unknownReference", path, { id: reference.id, kind: expected });
  else if (variable.type !== expected)
    run.sink.add("error", "refTypeMismatch", path, { actual: variable.type, expected, id: reference.id });
};

const checkContent = (run: ValidationRun, { id, path }: ScriptReference) => {
  const entry = run.catalog.entry(id);
  if (!entry) run.sink.add("error", "unknownContent", path, { id });
  else if (entry.retired) run.sink.add("error", "retiredContent", path, { id });
};

const checkReference = (run: ValidationRun, reference: ScriptReference) => {
  const { id, kind, path } = reference;
  if (kind === "content") return checkContent(run, reference);
  if (kind === "family") {
    if (run.catalog.family(id).length === 0) run.sink.add("error", "unknownFamily", path, { family: id });
    return;
  }
  if (kind === "multiboard" || kind === "timer") return checkVariableRef(run, reference, kind);
  if (kind === "speaker") {
    const speakers = run.context.speakerIds;
    if (speakers && !speakers.has(id)) run.sink.add("error", "unknownReference", path, { id, kind });
    return;
  }
  if (kind === "exit") {
    const exits = run.context.exitIds;
    if (exits && !exits.has(id)) run.sink.add("error", "endMapUnknownExit", path, { exit: id });
    return;
  }
  if (!localExists(run, kind, id)) run.sink.add("error", "unknownReference", path, { id, kind });
};

const checkDuplicates = (run: ValidationRun, items: readonly { id: string }[], path: string) => {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) run.sink.add("error", "duplicateId", `${path}[${index}].id`, { id: item.id });
    seen.add(item.id);
  });
};

/** Unique ids per collection, then every reference of the script; returns the reference list for later rules. */
export const checkReferences = (run: ValidationRun): ScriptReference[] => {
  const { script } = run;
  checkDuplicates(run, script.actors, "actors");
  checkDuplicates(run, script.folders, "folders");
  checkDuplicates(run, script.homeRewards, "homeRewards");
  checkDuplicates(run, script.quests.groups, "quests.groups");
  checkDuplicates(run, script.quests.quests, "quests.quests");
  checkDuplicates(run, script.regions, "regions");
  checkDuplicates(run, script.triggers, "triggers");
  checkDuplicates(run, script.variables, "variables");
  const references = scriptReferences(script);
  for (const reference of references) checkReference(run, reference);
  return references;
};
