import { isPlainObject } from "../../validation/index.ts";
import { AUDIO_OPTION_RANGES, type AudioOptionName } from "../audio.ts";
import { actionDef, isScriptActionKind, type ScriptActionKind } from "../catalog/actions.ts";
import { ARRAY_ELEMENT_TYPES, SCRIPT_LIMITS, SINGLE_ACTOR_PICKS } from "../constants.ts";
import { isScriptRef } from "../references.ts";
import { isActionAllowed } from "../scopes.ts";
import { checkNodeShape } from "../shape.ts";
import { actorSelector } from "../shape-nodes.ts";
import type { ActorSelector } from "../types/actors.ts";
import type { ScriptAction } from "../types/triggers.ts";
import { checkCondition, conditionHasDependencies } from "./conditions.ts";
import { checkShipLoad } from "./cargo.ts";
import { checkSelector } from "./content.ts";
import type { ValidationRun } from "./context.ts";
import { expectType } from "./expr.ts";
import { checkFactionAiPause, checkSetFactionAi, checkSetFactionGoal } from "./faction-ai.ts";
import { deeper, type ExprScope, withLocal } from "./scope.ts";
import { checkSlots } from "./slots.ts";

/** Action lists (trigger design §4.8, §5.2): steps, waits, flow control and per-action rules. */

export interface ListContext {
  /** Quest whose list runs in the archipelago executor (only its actions are allowed). */
  archipelagoQuest?: string;
  /** Step ids already used in this trigger or quest list tree. */
  stepIds: Set<string>;
}

type DoStep = Extract<ScriptAction, { k: "do" }>;
type OpRule = (run: ValidationRun, step: DoStep, path: string) => void;

const literalOf = (value: unknown) =>
  isPlainObject(value) && value.k === "lit" ? value.value : undefined;

const variableTypeOf = (run: ValidationRun, step: DoStep) => {
  const ref = step.args.variable;
  return isScriptRef(ref) ? run.index.variables.get(ref.id)?.type : undefined;
};

const requireVariableType = (accepted: readonly string[], expected: string): OpRule => (run, step, path) => {
  const type = variableTypeOf(run, step);
  if (type && !accepted.includes(type))
    run.sink.add("error", "slotTypeMismatch", `${path}.args.variable`, { actual: type, expected });
};

const oneOf = (names: readonly string[]): OpRule => (run, step, path) => {
  if (names.every(name => step.args[name] === undefined || step.args[name] === null))
    run.sink.add("error", "missingSlot", `${path}.args`, { slot: names.join(" | ") });
};

const ARRAYS = Object.keys(ARRAY_ELEMENT_TYPES);

/** `store` binds run-time handles: it must name an actor or actor group variable. */
const checkStoreVariable: OpRule = (run, step, path) => {
  const ref: unknown = step.args.store;
  if (!isScriptRef(ref)) return;
  const type = run.index.variables.get(ref.id)?.type;
  if (type && type !== "actor" && type !== "actorGroup")
    run.sink.add("error", "refTypeMismatch", `${path}.args.store`, { actual: type, expected: "actor", id: ref.id });
};

const both = (...rules: readonly OpRule[]): OpRule => (run, step, path) => rules.forEach(rule => rule(run, step, path));

/** Literal audio options must lie in their range (expressions are clamped at run time). */
const audioOptions = (names: readonly AudioOptionName[]): OpRule => (run, step, path) => {
  for (const name of names) {
    const value = literalOf(step.args[name]);
    const { max, min } = AUDIO_OPTION_RANGES[name];
    if (typeof value === "number" && (value < min || value > max))
      run.sink.add("error", "audioOptionOutOfRange", `${path}.args.${name}`, { max, min, option: name });
  }
};

/** A named exit belongs to a campaign map's victory (campaign branching §7): never to a defeat or another map kind. */
const checkEndMapExit: OpRule = (run, step, path) => {
  if (step.args.exit === undefined || step.args.exit === null) return;
  const { mapKind } = run.context;
  if (mapKind !== "campaign") run.sink.add("error", "endMapExitOffCampaign", `${path}.args.exit`, { mapKind });
  if (literalOf(step.args.outcome) === "defeat") run.sink.add("error", "endMapExitOnDefeat", `${path}.args.exit`);
};

const OP_RULES: Partial<Record<ScriptActionKind, OpRule>> = {
  arrayAppend: requireVariableType(ARRAYS, "array"),
  arrayClear: requireVariableType(ARRAYS, "array"),
  arrayRemoveAt: requireVariableType(ARRAYS, "array"),
  decreaseVariable: requireVariableType(["number", "number[]"], "number"),
  endMap: checkEndMapExit,
  face: oneOf(["angle", "target"]),
  factionAiPause: checkFactionAiPause,
  focusCamera: oneOf(["actor", "region"]),
  highlightUi: (run, step, path) => {
    if (step.wait && literalOf(step.args.until) !== "clicked") run.sink.add("error", "highlightWaitNeedsClicked", path);
  },
  increaseVariable: requireVariableType(["number", "number[]"], "number"),
  lookSpyglass: oneOf(["yawDeg", "target"]),
  playMusic: audioOptions(["volume", "fadeInSeconds", "fadeOutSeconds"]),
  playSound: audioOptions(["volume"]),
  setFactionAi: both(oneOf(["mode", "style", "level"]), checkSetFactionAi),
  setFactionGoal: checkSetFactionGoal,
  spawn: both(checkStoreVariable, (run, step, path) => {
    const count = literalOf(step.args.count);
    if (typeof count === "number" && count > SCRIPT_LIMITS.spawnCountMax)
      run.sink.add("error", "spawnCountAboveCap", `${path}.args.count`, { cap: SCRIPT_LIMITS.spawnCountMax, count });
  }),
  stopMusic: audioOptions(["fadeOutSeconds"]),
  spawnAboard: both(checkStoreVariable, oneOf(["type", "cargo"]), checkShipLoad),
  unload: both(checkStoreVariable, oneOf(["harbour", "region"])),
  storeActor: both(requireVariableType(["actor", "actorGroup"], "actor"), (run, step, path) => {
    const selector: unknown = step.args.selector;
    const pick = isPlainObject(selector) && selector.kind === "query" && isPlainObject(selector.query) &&
      isPlainObject(selector.query.pick) ? selector.query.pick.kind : undefined;
    if (variableTypeOf(run, step) === "actor" && pick !== undefined && !SINGLE_ACTOR_PICKS.includes(pick as string))
      run.sink.add("error", "slotTypeMismatch", `${path}.args.selector`, { actual: "actorGroup", expected: "actor" });
  })
};

const checkWaitSpec = (run: ValidationRun, step: DoStep, waitable: boolean, path: string) => {
  if (!step.wait) return;
  if (!waitable) {
    run.sink.add("error", "waitNotSupported", `${path}.wait`, { kind: step.op });
    return;
  }
  const timeout = step.wait.timeoutSeconds;
  if (timeout === undefined) run.sink.add("error", "waitWithoutTimeout", `${path}.wait`, { kind: step.op });
  else if (timeout < 1 || timeout > SCRIPT_LIMITS.maxWaitSeconds)
    run.sink.add("error", "waitTimeoutOutOfRange", `${path}.wait.timeoutSeconds`,
      { limit: SCRIPT_LIMITS.maxWaitSeconds });
};

const checkDo = (run: ValidationRun, step: DoStep, scope: ExprScope, path: string, list: ListContext) => {
  if (!isScriptActionKind(step.op)) {
    run.sink.add("error", "unknownAction", `${path}.op`, { kind: String(step.op) });
    return;
  }
  const def = actionDef(step.op);
  const { mapKind } = run.context;
  if (!isActionAllowed(mapKind, step.op)) run.sink.add("error", "notOnMapKind", `${path}.op`, { kind: step.op,
    mapKind });
  if (def.pending || def.since > 1)
    run.sink.add("warning", "notYetAvailable", `${path}.op`, { kind: step.op, lane: def.pending ?? "v2" });
  if (list.archipelagoQuest && !def.archipelago)
    run.sink.add("error", "archipelagoActionNotAllowed", `${path}.op`, { op: step.op, questId: list.archipelagoQuest });
  if (def.environment) run.environment.reads = true;
  checkWaitSpec(run, step, def.wait !== null, path);
  checkSlots(run, def.args, step.args, scope, `${path}.args`, { mode: "action", subject: null });
  OP_RULES[step.op]?.(run, step, path);
};

const checkWaitUntil = (
  run: ValidationRun, step: Extract<ScriptAction, { k: "waitUntil" }>, scope: ExprScope, path: string
) => {
  checkCondition(run, step.cond, deeper(scope), `${path}.cond`);
  if (!conditionHasDependencies(step.cond)) run.sink.add("error", "waitUntilWithoutDependencies", `${path}.cond`);
  if (step.timeoutSeconds === null) run.sink.add("warning", "waitUntilWithoutTimeout", path);
  else if (step.timeoutSeconds < 1 || step.timeoutSeconds > SCRIPT_LIMITS.maxWaitSeconds)
    run.sink.add("error", "waitTimeoutOutOfRange", `${path}.timeoutSeconds`, { limit: SCRIPT_LIMITS.maxWaitSeconds });
};

const checkForEachSource = (
  run: ValidationRun, step: Extract<ScriptAction, { k: "forEach" }>, scope: ExprScope, path: string
) => {
  const over: unknown = step.over;
  if (isScriptRef(over)) {
    const type = run.index.variables.get(over.id)?.type;
    if (over.kind !== "variable" || (type && type !== "actor" && type !== "actorGroup"))
      run.sink.add("error", "slotTypeMismatch", `${path}.over`, { actual: type ?? over.kind, expected: "actorGroup" });
    return;
  }
  if (!checkNodeShape(actorSelector, over, `${path}.over`, run.sink)) return;
  const selector = over as ActorSelector;
  checkSelector(run, selector, { kind: "actor", requires: null }, scope, `${path}.over`, "other", "query");
  const unbounded = (selector.kind === "type" || selector.kind === "family") && !selector.region &&
    selector.owner?.kind === "any";
  if (unbounded) run.sink.add("warning", "unboundedForEach", `${path}.over`);
};

const checkForEach = (
  run: ValidationRun, step: Extract<ScriptAction, { k: "forEach" }>, scope: ExprScope, path: string,
  list: ListContext
) => {
  if (step.max > SCRIPT_LIMITS.forEachMax)
    run.sink.add("error", "forEachMaxAboveCap", `${path}.max`, { cap: SCRIPT_LIMITS.forEachMax, max: step.max });
  checkForEachSource(run, step, scope, path);
  checkActionList(run, step.body, withLocal(scope, step.as, "actor"), `${path}.body`, list);
};

const checkStep = (run: ValidationRun, step: ScriptAction, scope: ExprScope, path: string, list: ListContext) => {
  if (list.stepIds.has(step.id)) run.sink.add("error", "duplicateStepId", `${path}.id`, { id: step.id });
  list.stepIds.add(step.id);
  switch (step.k) {
    case "do": return checkDo(run, step, scope, path, list);
    case "wait": return expectType(run, step.seconds, "number", scope, `${path}.seconds`);
    case "waitUntil": return checkWaitUntil(run, step, scope, path);
    case "if":
      checkCondition(run, step.cond, deeper(scope), `${path}.cond`);
      checkActionList(run, step.then, deeper(scope), `${path}.then`, list);
      return checkActionList(run, step.else, deeper(scope), `${path}.else`, list);
    case "forEach": return checkForEach(run, step, scope, path, list);
    case "forRange":
      expectType(run, step.from, "number", scope, `${path}.from`);
      expectType(run, step.to, "number", scope, `${path}.to`);
      return checkActionList(run, step.body, withLocal(scope, step.as, "number"), `${path}.body`, list);
    case "repeat":
      expectType(run, step.times, "number", scope, `${path}.times`);
      return checkActionList(run, step.body, deeper(scope), `${path}.body`, list);
    default:
  }
};

/** One action list (and its nested lists) of a trigger or a quest. */
export const checkActionList = (
  run: ValidationRun, steps: readonly ScriptAction[], scope: ExprScope, path: string, list: ListContext
): void => {
  if (scope.depth > SCRIPT_LIMITS.nestingDepth) {
    run.sink.add("error", "nestingTooDeep", path, { limit: SCRIPT_LIMITS.nestingDepth });
    return;
  }
  steps.forEach((step, index) => checkStep(run, step, scope, `${path}[${index}]`, list));
};

/** Every step of a list tree in document order (warnings and global rules read it). */
export const flattenSteps = (steps: readonly ScriptAction[]): ScriptAction[] => steps.flatMap(step => {
  if (step.k === "if") return [step, ...flattenSteps(step.then), ...flattenSteps(step.else)];
  if (step.k === "forEach" || step.k === "forRange" || step.k === "repeat") return [step, ...flattenSteps(step.body)];
  return [step];
});
