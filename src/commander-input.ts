import { COMMAND_LOG_LIMITS } from "./commands/command-limits.ts";
import { TICKS_PER_DAY } from "./time/constants.ts";
import { isPlainObject } from "./validation/guards.ts";

/** Fixed-tick direct-control protocol. Pure CPU data shared by client recording and server bounds. */
export const COMMANDER_INPUT_METHOD = "submitCommanderInput";
export const COMMANDER_INPUT_TICKS = 12_000;
export const COMMANDER_INPUT_BUTTON = Object.freeze({ attack: 1, block: 2, dismount: 4, callHorse: 8 });

/** Quantized world-relative movement and aim, never a claimed position, hit, HP or cooldown. */
export interface CommanderInput {
  generation: number;
  forward: number;
  right: number;
  heading: number;
  pitch: number;
  buttons: number;
}
export type PackedCommanderInput = [generation: number, forward: number, right: number,
  heading: number, pitch: number, buttons: number];
/** Continuations apply once per tick at ordinal0. Ordinary commands retain their same-tick order. */
export interface CommanderInputRun {
  tick: number;
  ordinal: number;
  ticks: number;
  input: PackedCommanderInput;
}

/** One tick holds at most every command of the interval, then the direct input after them. */
const MAX_ORDINAL = COMMAND_LOG_LIMITS.commandsPerInterval;
const integer = (value: unknown, min: number, max: number): value is number =>
  Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;

export const isPackedCommanderInput = (value: unknown): value is PackedCommanderInput =>
  Array.isArray(value) && value.length === 6 && integer(value[0], 1, 0x7fffffff) &&
  integer(value[1], -127, 127) && integer(value[2], -127, 127) && integer(value[3], 0, 65535) &&
  integer(value[4], -16384, 16384) && integer(value[5], 0, 15);

export const packCommanderInput = (input: CommanderInput): PackedCommanderInput =>
  [input.generation, input.forward, input.right, input.heading, input.pitch, input.buttons];
export const unpackCommanderInput = (input: PackedCommanderInput): CommanderInput => ({
  generation: input[0], forward: input[1], right: input[2], heading: input[3], pitch: input[4], buttons: input[5]
});
export const isCommanderInput = (value: unknown): value is CommanderInput =>
  isPlainObject(value) && Object.keys(value).length === 6 && isPackedCommanderInput([
    value.generation, value.forward, value.right, value.heading, value.pitch, value.buttons
  ]);

/** Checks compressed and expanded work before replay; never expands client-supplied run lengths. */
export const commanderInputTrackProblem = (track: unknown, baseTick: number, endTick: number,
  commands: readonly { tick: number; ordinal?: number }[] = []): string | null => {
  if (!Array.isArray(track) || track.length > COMMANDER_INPUT_TICKS + 1 ||
    !integer(baseTick, 0, Number.MAX_SAFE_INTEGER) || !integer(endTick, baseTick, Number.MAX_SAFE_INTEGER) ||
    endTick - baseTick > TICKS_PER_DAY) return "Invalid direct-input interval bounds";
  let previousEnd = baseTick - 1, expanded = 0;
  const runs: CommanderInputRun[] = [];
  for (const run of track) {
    if (!isPlainObject(run) || Object.keys(run).some(key => !["tick", "ordinal", "ticks", "input"].includes(key)) ||
      !integer(run.tick, baseTick, endTick) || !integer(run.ordinal, 0, MAX_ORDINAL) ||
      !integer(run.ticks, 1, COMMANDER_INPUT_TICKS + 1) || !isPackedCommanderInput(run.input))
      return "Invalid direct-input sample";
    const lastTick = run.tick + run.ticks - 1;
    if (run.tick <= previousEnd || lastTick > endTick) return "Overlapping or future direct input";
    if ((run.input[5] & 12) && run.ticks !== 1) return "Repeated direct-input action edge";
    previousEnd = lastTick;
    expanded += run.ticks;
    if (expanded > COMMANDER_INPUT_TICKS + 1) return "Expanded direct-input limit exceeded";
    runs.push(run as unknown as CommanderInputRun);
  }
  // Runs and commands are sorted. One sweep checks ordinal collisions, including implicit continuations.
  let runIndex = 0, previousTick = baseTick, previousOrdinal = -1;
  for (const command of commands) {
    if (!isPlainObject(command) || !integer(command.tick, previousTick, endTick) || !integer(command.ordinal, 0, MAX_ORDINAL))
      return "Invalid command ordinal in direct-input interval";
    if (command.tick === previousTick && command.ordinal <= previousOrdinal)
      return "Duplicate or reversed command ordinal";
    previousOrdinal = command.ordinal;
    previousTick = command.tick;
    while (runs[runIndex] && runs[runIndex]!.tick + runs[runIndex]!.ticks <= command.tick) runIndex++;
    const run = runs[runIndex];
    if (!run || command.tick < run.tick) continue;
    const ordinal = command.tick === run.tick ? run.ordinal : 0;
    if (ordinal === command.ordinal) return "Command and direct input share an ordinal";
  }
  return null;
};

/** Append one already-applied tick, coalescing identical renewals without changing their effective ticks. */
export const appendCommanderInput = (runs: CommanderInputRun[], tick: number, ordinal: number,
  input: PackedCommanderInput) => {
  const last = runs.at(-1);
  if (last && tick <= last.tick + last.ticks - 1) return false;
  if (last && ordinal === 0 && !(input[5] & 12) && tick === last.tick + last.ticks &&
    last.input.every((value, index) => value === input[index])) {
    last.ticks++;
    return true;
  }
  runs.push({ tick, ordinal, ticks: 1, input: [...input] });
  return true;
};
