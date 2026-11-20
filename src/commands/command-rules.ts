import { commandArgsProblem } from "./command-args.ts";
import {
  COMMAND_RATE_CLASSES, COMMAND_SIZE_CLASSES, type CommandRateClass
} from "./command-limits.ts";
import { COMMAND_MANIFEST, type CommandName, type CommandSpec } from "./command-manifest.ts";

/** Every recorded command in manifest (recording) order. */
export const COMMAND_NAMES = Object.keys(COMMAND_MANIFEST) as readonly CommandName[];

export const isCommandName = (name: unknown): name is CommandName =>
  typeof name === "string" && Object.hasOwn(COMMAND_MANIFEST, name);

export const commandSpec = (name: CommandName): CommandSpec => COMMAND_MANIFEST[name];

const namesWhere = (test: (spec: CommandSpec) => boolean): ReadonlySet<string> =>
  new Set(COMMAND_NAMES.filter(name => test(COMMAND_MANIFEST[name])));

/**
 * Development and test commands. Owner decision 2026-10-15: an online save may contain them only when the
 * upload's signed role claim is `admin`; the production verifier refuses them. Owner 2026-11-11: this includes
 * `levelUpCommander` and the road-decoration commands (their online path is the server custody API).
 */
export const DEVELOPMENT_COMMANDS = namesWhere(spec => spec.access === "development");

/** Commands that move value in or out of the island: their intervals are always verified. */
export const LEDGER_COMMANDS = namesWhere(spec => spec.ledger);

/** Commands after which the bug-replay scene journal observes the changed world. */
export const WORLD_MUTATING_COMMANDS = namesWhere(spec => spec.mutatesWorld);

export const isDevelopmentCommand = (name: unknown): name is string =>
  typeof name === "string" && DEVELOPMENT_COMMANDS.has(name);

export const isLedgerCommand = (name: unknown): name is string =>
  typeof name === "string" && LEDGER_COMMANDS.has(name);

/** Unknown names count in the standard class, so a stale or foreign name cannot bypass the rate bound. */
export const commandRateClass = (name: unknown): CommandRateClass =>
  isCommandName(name) ? COMMAND_MANIFEST[name].rateClass : "standard";

export const commandSizeLimits = (name: CommandName) => COMMAND_SIZE_CLASSES[COMMAND_MANIFEST[name].sizeClass];

/** Most commands of one rate class in any window of its length (`ticks` sorted ascending). */
export const busiestCommandWindow = (ticks: readonly number[], rateClass: CommandRateClass) => {
  const { windowTicks } = COMMAND_RATE_CLASSES[rateClass];
  let busiest = 0;
  for (let end = 0, start = 0; end < ticks.length; end++) {
    while (ticks[end]! - ticks[start]! >= windowTicks) start++;
    busiest = Math.max(busiest, end - start + 1);
  }
  return busiest;
};

/** A logged command as read from untrusted data (either field may be missing or of any type). */
export interface RecordedCommand {
  args?: unknown;
  name?: unknown;
}

/**
 * The verifier's acceptance of one recorded command: why it cannot replay, or null. `allowDevelopment` false
 * is the production verifier (development commands refused).
 */
export const recordedCommandProblem = (
  { args, name }: RecordedCommand, allowDevelopment: boolean
): string | null => {
  if (!isCommandName(name) || !Array.isArray(args)) return "Unsupported command";
  const argsProblem = commandArgsProblem(COMMAND_MANIFEST[name].args, args);
  if (argsProblem) return argsProblem;
  if (!allowDevelopment && COMMAND_MANIFEST[name].access === "development") return `Rejected command ${name}`;
  return null;
};

/** Storage shape check of a known command's arguments (unknown names are left to the verifier). */
export const knownCommandArgsValid = ({ args, name }: RecordedCommand) =>
  !isCommandName(name) || commandArgsProblem(COMMAND_MANIFEST[name].args, args) === null;
