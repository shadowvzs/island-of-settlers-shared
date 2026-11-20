import { familyMatches } from "../../catalog/family.ts";
import type { ScriptActor } from "../types/actors.ts";
import { checkActorTypeSlot } from "./content.ts";
import type { ValidationRun } from "./context.ts";

/** Authored actors (ACT0 generalised, trigger design §4.3): spawn types, looks and the commander rule. */

const COMMANDER_FAMILY = "commander";

const isCommander = (run: ValidationRun, actor: ScriptActor) => {
  const ids = actor.binding === "spawn" ? [actor.type.type.id] : actor.objects.map(object => object.content.id);
  return ids.some(id => familyMatches(COMMANDER_FAMILY, run.catalog.entry(id)?.family ?? ""));
};

const checkActor = (run: ValidationRun, actor: ScriptActor, path: string) => {
  // A display name is a proper name: English is required once it exists, translations are optional (no warning).
  if (actor.displayName && !actor.displayName.en.trim())
    run.sink.add("error", "missingEnglishText", `${path}.displayName`);
  if (run.context.mapHasCommandersLodge === false && isCommander(run, actor))
    run.sink.add("error", "commanderWithoutLodge", path);
  if (actor.binding !== "spawn") return;
  checkActorTypeSlot(run, actor.type, { kind: "actorType", requires: "spawn" }, `${path}.type`, "action");
  if (actor.look.kind === "nation" && !run.catalog.entry(`nation:${actor.look.nation}`))
    run.sink.add("error", "unknownContent", `${path}.look.nation`, { id: `nation:${actor.look.nation}` });
};

export const checkActors = (run: ValidationRun) =>
  run.script.actors.forEach((actor, index) => checkActor(run, actor, `actors[${index}]`));
