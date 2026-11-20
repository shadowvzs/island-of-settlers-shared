import { SCRIPT_LIMITS } from "../constants.ts";
import type { ActorSelector } from "../types/actors.ts";
import type { ScriptRun } from "../types/run-state.ts";
import type { ScriptAction } from "../types/triggers.ts";
import type { ActorHandleValue } from "../types/values.ts";
import type { ScriptEngineCore } from "./core.ts";
import { evaluateExpr, resolveActors } from "./expressions.ts";
import { compareHandles } from "./values.ts";

/**
 * Program counter navigation of saved runs (design §6.5). `pc` is a path `[i0, b0, i1, b1, …, iN]`: `i` is a step
 * index in a list, `b` the branch of the step entered at that level (if: 0 = then, 1 = else; loops: 0 = body).
 * `loops` holds one entry per loop on the path, innermost last. Both are plain numbers, so a run saves as JSON and
 * resumes exactly.
 */

type LoopStep = Extract<ScriptAction, { k: "forEach" | "forRange" | "repeat" }>;

const isLoop = (step: ScriptAction): step is LoopStep =>
  step.k === "forEach" || step.k === "forRange" || step.k === "repeat";

const childList = (step: ScriptAction | undefined, branch: number): readonly ScriptAction[] => {
  if (!step) return [];
  if (step.k === "if") return branch === 0 ? step.then : step.else;
  return isLoop(step) ? step.body : [];
};

/** The action list the innermost `pc` index points into. */
export const listAt = (root: readonly ScriptAction[], pc: readonly number[]) => {
  let list = root;
  for (let level = 0; level + 1 < pc.length; level += 2) list = childList(list[pc[level]!], pc[level + 1]!);
  return list;
};

/** The step that owns the innermost list (the if or loop the run is inside); undefined at the root. */
const containerOf = (root: readonly ScriptAction[], pc: readonly number[]) => {
  if (pc.length < 3) return undefined;
  return listAt(root, pc.slice(0, -2))[pc[pc.length - 3]!];
};

export const advance = (run: ScriptRun) => {
  run.pc[run.pc.length - 1]! += 1;
};

/** The step just before the innermost index (the step a wait resumes after). */
export const previousStep = (root: readonly ScriptAction[], run: ScriptRun) =>
  listAt(root, run.pc)[run.pc[run.pc.length - 1]! - 1];

const enterBlock = (run: ScriptRun, branch: number) => {
  run.pc.push(branch, 0);
};

const leaveBlock = (run: ScriptRun) => {
  run.pc.length -= 2;
  advance(run);
};

export const enterBranch = (run: ScriptRun, branch: 0 | 1) => enterBlock(run, branch);

const firstLiveIndex = (core: ScriptEngineCore, items: readonly ActorHandleValue[], from: number) => {
  let index = from;
  while (index < items.length && !core.port.isHandleLive(items[index]!)) index += 1;
  return index;
};

const setNumberLocal = (run: ScriptRun, name: string, value: number) => {
  run.locals[name] = { type: "number", value };
};

const forEachMembers = (core: ScriptEngineCore, run: ScriptRun, step: Extract<LoopStep, { k: "forEach" }>) => {
  const limit = Math.min(step.max, SCRIPT_LIMITS.forEachMax);
  const over = step.over;
  if ("k" in over) {
    const stored = core.state.values[over.id];
    const handles = stored?.type === "actor" || stored?.type === "actorGroup" ? stored.value : [];
    return [...handles].sort(compareHandles).slice(0, limit);
  }
  return resolveActors(core, run, over as ActorSelector).slice(0, limit);
};

const integerOf = (value: unknown) => typeof value === "number" ? Math.trunc(value) : 0;

/** Starts a loop: snapshots its range or members (design §6.5); false when it has no iteration. */
export const enterLoop = (core: ScriptEngineCore, run: ScriptRun, step: LoopStep) => {
  if (step.k === "forEach") {
    const items = forEachMembers(core, run, step);
    const cursor = firstLiveIndex(core, items, 0);
    if (cursor >= items.length) return false;
    run.loops.push({ cursor, items });
    run.locals[step.as] = items[cursor]!;
  } else if (step.k === "forRange") {
    const from = integerOf(evaluateExpr(core, run, step.from));
    const to = Math.min(integerOf(evaluateExpr(core, run, step.to)), from + SCRIPT_LIMITS.forEachMax - 1);
    if (from > to) return false;
    run.loops.push({ cursor: from, to });
    setNumberLocal(run, step.as, from);
  } else {
    const times = Math.min(integerOf(evaluateExpr(core, run, step.times)), SCRIPT_LIMITS.forEachMax);
    if (times <= 0) return false;
    run.loops.push({ cursor: 0, to: times - 1 });
  }
  enterBlock(run, 0);
  return true;
};

/** Next iteration of the innermost loop; false when it is finished. */
const nextIteration = (core: ScriptEngineCore, run: ScriptRun, step: LoopStep) => {
  const loop = run.loops[run.loops.length - 1]!;
  if (step.k === "forEach") {
    const items = loop.items ?? [];
    loop.cursor = firstLiveIndex(core, items, loop.cursor + 1);
    if (loop.cursor >= items.length) return false;
    run.locals[step.as] = items[loop.cursor]!;
    return true;
  }
  loop.cursor += 1;
  if (loop.cursor > (loop.to ?? -1)) return false;
  if (step.k === "forRange") setNumberLocal(run, step.as, loop.cursor);
  return true;
};

/**
 * Leaves the innermost block when its list is finished: an `if` continues after itself, a loop starts its next
 * iteration or ends. Returns false at the root (the run is complete).
 */
export const finishBlock = (core: ScriptEngineCore, run: ScriptRun, root: readonly ScriptAction[]) => {
  const container = containerOf(root, run.pc);
  if (!container) return false;
  if (!isLoop(container)) {
    leaveBlock(run);
    return true;
  }
  if (nextIteration(core, run, container)) {
    run.pc[run.pc.length - 1] = 0;
    return true;
  }
  run.loops.pop();
  if (container.k !== "repeat") delete run.locals[container.as];
  leaveBlock(run);
  return true;
};
