import { secondsToTicks, ticksToSeconds } from "../../time/constants.ts";
import type { TimerDefinition } from "../types/multiboards.ts";
import type { ScriptRunState } from "../types/run-state.ts";
import type { MapScript, ScriptVariable } from "../types/script.ts";
import type { ScriptEngineCore } from "./core.ts";

/**
 * Script timers (design §4.11): timer variables count script ticks, so they freeze offline (script clock, §7.1).
 * State per timer: `endScriptTick` while running, `paused` (remaining ticks) while paused, both null when stopped.
 * Catch-up never advances the script clock, so a running timer keeps its remaining time while the player is away.
 */

type TimerState = ScriptRunState["timers"][string];

export const TIMER_OPS: ReadonlySet<string> = new Set(["timerPause", "timerResume", "timerStart", "timerStop"]);

/** Dependency key of one timer: a start, pause, resume, stop or expiry refreshes its readers on the same tick. */
export const timerDependency = (id: string) => `timer:${id}`;

/** A stopped or expired timer is neither running nor paused. */
export const isTimerActive = (timer: TimerState | undefined) =>
  timer !== undefined && (timer.endScriptTick !== null || timer.paused !== null);

/** Remaining script seconds of a running or paused timer; 0 when stopped, expired or unknown. */
export const timerRemainingSeconds = (state: ScriptRunState, id: string | null) => {
  const timer = id === null ? undefined : state.timers[id];
  if (!timer) return 0;
  if (timer.paused !== null) return ticksToSeconds(timer.paused);
  if (timer.endScriptTick === null) return 0;
  return ticksToSeconds(Math.max(0, timer.endScriptTick - state.scriptTick));
};

export const timerDefinition = (variable: ScriptVariable | undefined): TimerDefinition | null => {
  if (variable?.initial.type !== "timer") return null;
  return variable.initial.value;
};

/** Timer variables in script order (the deterministic expiry order). */
export const timerVariables = (script: MapScript) => script.variables.filter(variable => variable.type === "timer");

/** Initial timer state: auto-start timers run from script tick `startTick`. */
export const initialTimers = (script: MapScript, startTick: number): ScriptRunState["timers"] => {
  const timers: ScriptRunState["timers"] = {};
  for (const variable of timerVariables(script)) {
    const definition = timerDefinition(variable);
    const endScriptTick = definition?.autoStart ? startTick + secondsToTicks(definition.seconds) : null;
    timers[variable.id] = { endScriptTick, paused: null };
  }
  return timers;
};

const STOPPED: TimerState = Object.freeze({ endScriptTick: null, paused: null });

/** The timer state after an action; null when the action does not apply (pause of a stopped timer …). */
const nextTimerState = (
  op: string, timer: TimerState, scriptTick: number, durationTicks: number
): TimerState | null => {
  if (op === "timerStart") return { endScriptTick: scriptTick + durationTicks, paused: null };
  if (op === "timerStop") return isTimerActive(timer) ? STOPPED : null;
  if (op === "timerPause" && timer.endScriptTick !== null)
    return { endScriptTick: null, paused: Math.max(0, timer.endScriptTick - scriptTick) };
  if (op === "timerResume" && timer.paused !== null) return { endScriptTick: scriptTick + timer.paused, paused: null };
  return null;
};

/** Applies a timer action; `seconds` overrides the definition's duration on start. */
export const applyTimerAction = (core: ScriptEngineCore, op: string, timerId: string, seconds: number | null) => {
  const definition = timerDefinition(core.lookup.variableById.get(timerId));
  const timer = core.state.timers[timerId];
  if (!definition || !timer) {
    core.log("unknownReference", `timer ${timerId}`);
    return;
  }
  const durationTicks = secondsToTicks(seconds ?? definition.seconds);
  const next = nextTimerState(op, timer, core.state.scriptTick, durationTicks);
  if (!next) return;
  core.state.timers[timerId] = { ...next };
  core.markDependency(timerDependency(timerId));
};

/** Emits `timerExpired` for every timer due at the current script tick; periodic timers re-arm on the grid. */
export const expireTimers = (core: ScriptEngineCore, timers: readonly ScriptVariable[]) => {
  const { scriptTick } = core.state;
  for (const variable of timers) {
    const timer = core.state.timers[variable.id];
    if (timer?.endScriptTick === null || timer === undefined || timer.endScriptTick > scriptTick) continue;
    const definition = timerDefinition(variable);
    const period = definition?.periodic ? Math.max(1, secondsToTicks(definition.seconds)) : 0;
    core.state.timers[variable.id] = { endScriptTick: period > 0 ? timer.endScriptTick + period : null, paused: null };
    core.markDependency(timerDependency(variable.id));
    core.emit({
      kind: "timerExpired",
      responses: { timer: { type: "string", value: variable.id } },
      values: { timer: variable.id }
    });
  }
};
