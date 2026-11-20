import { isPlainObject } from "../../validation/index.ts";
import { AI_MODES } from "../constants.ts";
import type { ScriptAction } from "../types/triggers.ts";
import type { ScriptFactionAiView, ValidationRun } from "./context.ts";

/**
 * The faction AI actions' Ready rules (enemy economy AI plan §5.2, lane EAI2c): the faction must be on the map (an
 * AI entry, or authored units or buildings), a style needs the develop mode, a switch to develop needs start
 * settlers, must not give the map more develop factions than it may have, and a switched mode must keep the
 * island inside its people target. `setFactionGoal` (EAI4c) shares the faction rule. The map-kind refusal is
 * `scopes.ts`.
 * Without `context.factionAi` (no map at hand) only the map-independent rules run. Factions and modes named by
 * expressions are checked when the action runs.
 */

type DoStep = Extract<ScriptAction, { k: "do" }>;

const DEVELOP = "develop";

const literalString = (value: unknown) =>
  isPlainObject(value) && value.k === "lit" && typeof value.value === "string" ? value.value : undefined;

const isExpression = (value: unknown) => isPlainObject(value) && "k" in value;

/** The faction of a single-faction player filter, else null (groups, the neutral owner, unset). */
const slotFaction = (value: unknown) =>
  isPlainObject(value) && value.kind === "slot" && typeof value.faction === "number" ? value.faction : null;

/** The faction a step names when it is on the map; an issue and null when it names none. */
const checkedFaction = (run: ValidationRun, view: ScriptFactionAiView, step: DoStep, path: string) => {
  const value: unknown = step.args.faction;
  if (value === undefined || value === null || isExpression(value)) return null;
  const faction = slotFaction(value);
  if (faction !== null && view.modes.has(faction)) return faction;
  run.sink.add("error", "factionWithoutAi", `${path}.args.faction`);
  return null;
};

const checkDevelopSwitch = (
  run: ValidationRun, view: ScriptFactionAiView, faction: number, path: string
) => {
  if (!view.canDevelop(faction)) run.sink.add("error", "factionAiDevelopWithoutSettlers", `${path}.args.mode`);
  run.developFactions.add(faction);
  if (run.developFactions.size > view.maxDevelopFactions)
    run.sink.add("error", "factionAiSecondDevelop", `${path}.args.mode`, { max: view.maxDevelopFactions });
};

const checkPeople = (run: ValidationRun, view: ScriptFactionAiView, faction: number, mode: string, path: string) => {
  const people = view.peopleWith(faction, mode);
  if (people > view.peopleTarget)
    run.sink.add("error", "factionAiPeopleAboveTarget", `${path}.args.mode`, { people, target: view.peopleTarget });
};

export const checkSetFactionAi = (run: ValidationRun, step: DoStep, path: string) => {
  const mode = literalString(step.args.mode);
  if (step.args.style && mode !== undefined && mode !== DEVELOP)
    run.sink.add("error", "factionAiStyleWithoutDevelop", `${path}.args.style`);
  const view = run.context.factionAi;
  if (!view) return;
  const faction = checkedFaction(run, view, step, path);
  // An unknown mode is the closed list's own error.
  if (faction === null || mode === undefined || !(AI_MODES as readonly string[]).includes(mode)) return;
  if (mode === DEVELOP) checkDevelopSwitch(run, view, faction, path);
  checkPeople(run, view, faction, mode, path);
};

export const checkFactionAiPause = (run: ValidationRun, step: DoStep, path: string) => {
  const view = run.context.factionAi;
  if (view) checkedFaction(run, view, step, path);
};

/** `setFactionGoal` (EAI4c): the faction is on the map and a literal duration is more than 0 seconds. */
export const checkSetFactionGoal = (run: ValidationRun, step: DoStep, path: string) => {
  const seconds: unknown = step.args.seconds;
  if (isPlainObject(seconds) && seconds.k === "lit" && !(Number(seconds.value) > 0))
    run.sink.add("error", "factionGoalSecondsNotPositive", `${path}.args.seconds`);
  checkFactionAiPause(run, step, path);
};
