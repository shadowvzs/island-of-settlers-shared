import { TICKS_PER_DAY, TICKS_PER_MINUTE } from "../time/constants.ts";

/**
 * The one source of recorded-command log bounds (phase C §4 and §9). The client recorders (bug replay,
 * command log), the client verifier and the API upload check read these values instead of writing
 * `512` or `4 * 1024 * 1024` again.
 */
export const COMMAND_LOG_LIMITS = {
  /** Commands per command-log interval and per bug-replay recording. */
  commandsPerInterval: 512,
  /** Ticks one command-log interval may span. */
  intervalTicks: TICKS_PER_DAY,
  /** Intervals one upload (or one archived relief proof) may chain. */
  intervalsPerUpload: 64,
  /** Serialized bytes of one log, one upload's chained intervals or one bug-replay journal. */
  logBytes: 4 * 1024 * 1024
} as const;

/** Per-command serialized size bounds; a command's manifest entry names its class. */
export const COMMAND_SIZE_CLASSES = {
  standard: {
    /** JSON-copied arguments of one command. */
    argsBytes: 64 * 1024,
    /** A recorded return value larger than this is left out (the command stays replayable). */
    resultBytes: 16 * 1024
  }
} as const;

export type CommandSizeClass = keyof typeof COMMAND_SIZE_CLASSES;

/** The largest argument size of any class: the bound checked before a command's name is known. */
export const MAX_COMMAND_ARGS_BYTES =
  Math.max(...Object.values(COMMAND_SIZE_CLASSES).map(limits => limits.argsBytes));

/** Commands of one class allowed in any window of `windowTicks` consecutive ticks of one upload. */
export const COMMAND_RATE_CLASSES = {
  standard: { maxCommands: 600, windowTicks: TICKS_PER_MINUTE }
} as const;

export type CommandRateClass = keyof typeof COMMAND_RATE_CLASSES;
