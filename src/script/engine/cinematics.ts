import type { CinematicSequence, CinematicStep } from "../../campaign/cinematics/types.ts";
import { secondsToTicks } from "../../time/constants.ts";
import { scriptReadsEnvironment } from "../environment.ts";
import type { ActiveCinematic, ScriptCinematicState } from "../types/run-state.ts";
import type { ActionOutcome } from "../types/triggers.ts";
import type { ActorHandleValue } from "../types/values.ts";
import {
  cinematicActionSpec, cinematicActorRefs, cinematicActorSelector, cinematicLocals, isCinematicWorldStep
} from "./cinematic-steps.ts";
import { CINEMATIC_DEPENDENCY } from "./conditions.ts";
import type { EvalFrame, ScriptEngineCore } from "./core.ts";
import { createEvalScope } from "./expressions.ts";
import { compareHandles } from "./values.ts";

/**
 * The cinematic sequence queue of the simulation (CIN4, cinematics plan §3.4 and §3.5): one sequence at a time,
 * FIFO, victory/defeat preempting. The state is saved run state, so the hold ("Pause the world"), the applied world
 * steps and the queue survive a reload and replay identically. World steps are recorded commands
 * (`applyCinematicStep`, `endCinematic`); ending a sequence applies every world step not applied yet, in order, so
 * a skipped and a watched sequence leave the same world.
 */

/** Not a run: world steps of a sequence are applied by commands, outside any trigger run. */
const NO_RUN_ID = -1;
const MS_PER_SECOND = 1000;

const cinematicOf = (core: ScriptEngineCore): ScriptCinematicState =>
  core.state.cinematic ??= { active: null, pending: [], seen: [] };

const mapOutcomeDecided = (core: ScriptEngineCore) => core.port.mapOutcomeDecided?.() ?? false;

/** Runs waiting on the sequence (`playSequence` with a wait, quest `onSuccess` after its completion sequence). */
const wakeWaiting = (core: ScriptEngineCore, sequenceId: string, outcome: ActionOutcome) => {
  for (const run of core.state.runs) {
    if (run.waiting?.kind !== "sequence" || run.waiting.sequenceId !== sequenceId) continue;
    run.context.outcome = { type: "string", value: outcome };
    run.waiting = null;
  }
};

const emitSequence = (core: ScriptEngineCore, kind: "sequenceFinished" | "sequenceSkipped" | "sequenceStarted",
  sequenceId: string) => {
  core.emit({ kind, values: { sequence: sequenceId } });
};

/** World steps of a sequence in step order (weather and hour only on a world-environment script). */
export const sequenceWorldSteps = (core: ScriptEngineCore, sequence: CinematicSequence) => {
  const environment = scriptReadsEnvironment(core.script);
  return sequence.steps.filter(step => isCinematicWorldStep(step, environment));
};

const frameOf = (active: ActiveCinematic): EvalFrame => ({ context: {}, id: null, locals: cinematicLocals(active) });

const storeSpawned = (active: ActiveCinematic, step: CinematicStep, spawned: readonly ActorHandleValue[]) => {
  if (step.kind !== "spawn" || !step.actorRef) return;
  active.actors[step.actorRef] = [...spawned].sort(compareHandles).map(handle => ({ ...handle }));
};

const deadlineOf = (core: ScriptEngineCore, step: CinematicStep, wait: boolean) => {
  if (!wait || step.kind !== "walk") return null;
  return core.state.scriptTick + Math.max(1, secondsToTicks(step.timeoutMs / MS_PER_SECOND));
};

/** Applies one world step through the world port (guaranteed mode is on while a sequence plays, §6.6). */
const applyWorldStep = (core: ScriptEngineCore, active: ActiveCinematic, step: CinematicStep, skipped = false) => {
  active.applied.push(step.id);
  const spec = cinematicActionSpec(active, step, skipped);
  if (!spec) {
    core.log("actionFailed", `cinematic ${step.kind} ${step.id}: refused (no simulation mechanism yet)`);
    return;
  }
  const result = core.port.performAction({
    args: spec.args, deadlineScriptTick: deadlineOf(core, step, spec.wait), op: spec.op, overridable: false,
    runId: NO_RUN_ID, scope: createEvalScope(core, frameOf(active)), stepId: step.id, wait: spec.wait
  });
  if (result.kind === "failed") core.log("actionFailed", `cinematic ${step.kind} ${step.id}: ${result.outcome}`);
  if (result.kind !== "failed" && result.spawned) storeSpawned(active, step, result.spawned);
  if (step.kind !== "walk") return;
  if (result.kind === "pending") active.walks.push({ actionId: result.actionId, stepId: step.id });
  else active.arrived.push(step.id);
};

const startNextSequence = (core: ScriptEngineCore) => {
  const cinematic = cinematicOf(core);
  while (!cinematic.active && cinematic.pending.length > 0) {
    const next = cinematic.pending.shift()!;
    const sequence = core.lookup.sequenceById.get(next.sequenceId);
    if (!sequence || (!next.outcome && mapOutcomeDecided(core))) {
      wakeWaiting(core, next.sequenceId, "interrupted");
      continue;
    }
    cinematic.active = {
      actors: {}, applied: [], arrived: [], hold: sequence.pauseWorld, outcome: next.outcome,
      sequenceId: sequence.id, startTick: core.port.gameTick(), walks: []
    };
    core.markDependency(CINEMATIC_DEPENDENCY);
    emitSequence(core, "sequenceStarted", sequence.id);
  }
};

/** Ends the active sequence: the remaining world steps apply in order (the skip guarantee), then the next starts. */
const finishActive = (core: ScriptEngineCore, skipped: boolean) => {
  const cinematic = cinematicOf(core);
  const active = cinematic.active!;
  const sequence = core.lookup.sequenceById.get(active.sequenceId);
  const steps = sequence ? sequenceWorldSteps(core, sequence) : [];
  for (const step of steps.slice(active.applied.length)) applyWorldStep(core, active, step, skipped);
  cinematic.active = null;
  if (!cinematic.seen.includes(active.sequenceId)) cinematic.seen.push(active.sequenceId);
  core.port.cinematicEnded?.({ hold: active.hold });
  core.markDependency(CINEMATIC_DEPENDENCY);
  wakeWaiting(core, active.sequenceId, "done");
  emitSequence(core, "sequenceFinished", active.sequenceId);
  if (skipped) emitSequence(core, "sequenceSkipped", active.sequenceId);
};

/** An outcome sequence drops the pending story sequences and skips the active one (its world steps apply). */
const preemptStory = (core: ScriptEngineCore) => {
  const cinematic = cinematicOf(core);
  const dropped = cinematic.pending.filter(entry => !entry.outcome);
  cinematic.pending = cinematic.pending.filter(entry => entry.outcome);
  for (const entry of dropped) wakeWaiting(core, entry.sequenceId, "interrupted");
  if (cinematic.active && !cinematic.active.outcome) finishActive(core, true);
};

const outcomeDue = (cinematic: ScriptCinematicState) =>
  cinematic.active?.outcome === true || cinematic.pending.some(entry => entry.outcome);

/**
 * Queues a sequence (quest hooks, `playSequence`). A sequence queued once the map's outcome is decided is an
 * outcome sequence and preempts; a story sequence arriving while an outcome is due is dropped. False when refused.
 */
export const queueSequence = (core: ScriptEngineCore, sequenceId: string) => {
  if (!core.lookup.sequenceById.has(sequenceId)) {
    core.log("unknownReference", `sequence ${sequenceId}`);
    return false;
  }
  const outcome = mapOutcomeDecided(core);
  const cinematic = cinematicOf(core);
  if (!outcome && outcomeDue(cinematic)) {
    core.log("runCancelled", `sequence ${sequenceId}: an outcome sequence is due`);
    return false;
  }
  if (outcome) preemptStory(core);
  cinematic.pending.push({ outcome, sequenceId });
  startNextSequence(core);
  return true;
};

/** The sequence is active or waiting in the queue. */
export const isSequenceDue = (core: ScriptEngineCore, sequenceId: string) => {
  const cinematic = core.state.cinematic;
  if (!cinematic) return false;
  return cinematic.active?.sequenceId === sequenceId ||
    cinematic.pending.some(entry => entry.sequenceId === sequenceId);
};

/**
 * The recorded `applyCinematicStep` command: accepted only for the active sequence's next world step (step order,
 * each once). False when refused (stale, out of order, not a world step).
 */
export const applyCinematicStep = (core: ScriptEngineCore, sequenceId: string, stepId: string) => {
  const active = core.state.cinematic?.active;
  if (!active || active.sequenceId !== sequenceId) return false;
  const sequence = core.lookup.sequenceById.get(sequenceId);
  if (!sequence) return false;
  const steps = sequenceWorldSteps(core, sequence);
  const step = steps[active.applied.length];
  if (step?.id !== stepId) return false;
  applyWorldStep(core, active, step);
  return true;
};

/** The recorded `endCinematic` command (watched to the end, skipped, or a reload): false unless it is active. */
export const endCinematic = (core: ScriptEngineCore, sequenceId: string, skipped: boolean) => {
  if (core.state.cinematic?.active?.sequenceId !== sequenceId) return false;
  finishActive(core, skipped);
  startNextSequence(core);
  return true;
};

/** A waited walk order finished: the walk step counts as arrived. True when the action belonged to a sequence. */
export const completeCinematicWalk = (core: ScriptEngineCore, actionId: number) => {
  const active = core.state.cinematic?.active;
  const index = active?.walks.findIndex(walk => walk.actionId === actionId) ?? -1;
  if (index < 0) return false;
  const [walk] = active!.walks.splice(index, 1);
  active!.arrived.push(walk!.stepId);
  return true;
};

/** Live units the active sequence names (authored actors and its spawned units): invulnerable, AI-skipped. */
export const cinematicMembers = (core: ScriptEngineCore): ActorHandleValue[] => {
  const active = core.state.cinematic?.active;
  const sequence = active && core.lookup.sequenceById.get(active.sequenceId);
  if (!active || !sequence) return [];
  const scope = createEvalScope(core, frameOf(active));
  return cinematicActorRefs(sequence.steps).flatMap(name =>
    scope.resolveActors(cinematicActorSelector(active, name)));
};
