import { isPlainObject } from "./validation/guards.ts";

/**
 * Every serialized format with its name, current version and accepted versions; client and API import this
 * instead of writing `"island-settlers-game"` or `version !== 4`. Raising a version: change `current`, decide
 * `accepted`, register a migration step when old documents must still load (none today: no save compatibility
 * is promised before the backend ships).
 */
export interface FormatSpec {
  /** Versions a reader accepts. */
  readonly accepted: readonly number[];
  /** Version writers produce. */
  readonly current: number;
  /** True when documents carry `format: id`; otherwise `id` only names the format here. */
  readonly formatField: boolean;
  readonly id: string;
}

const spec = <const Id extends string, const Current extends number>(
  id: Id, current: Current, accepted: readonly number[] = [current], formatField = true
) => ({ accepted, current, formatField, id }) as const;

export const FORMATS = {
  /** Archived island relief proof inside a game save's runtime state. */
  archivedReliefProof: spec("island-settlers-archived-relief-proof", 1, [1], false),
  /** Binary `.island` map file: the id is the 4-byte magic; 1 and 2 are gzip files that still load. */
  binaryMap: spec("IOSM", 3, [1, 2, 3], false),
  /** Recorded bug report: a baseline game save plus its commands. */
  bugReplay: spec("island-settlers-bug-replay", 1),
  campaignRun: spec("island-settlers-campaign-run", 1),
  /** Colony visit hand-over; requests carry no version field yet (version 1 implied), readers match the id. */
  colonyVisit: spec("island-settlers-colony-visit", 1),
  /** One command log interval; version 1 intervals (no direct inputs) are still written and accepted. */
  commandLog: spec("island-settlers-command-log", 2, [1, 2]),
  gameSave: spec("island-settlers-game", 4),
  /** Exported map file with its scripts (trigger design §17, TRG lanes); reserved, not written yet. */
  mapExport: spec("island-settlers-map-export", 1),
  /** Map script inside the map file header (trigger design §4.1, TRG0 types; TRG1 writes it); no format field. */
  mapScript: spec("island-settlers-map-script", 1, [1], false),
  /** The `map` delta of a stored save against its server map base; version 1 deltas still restore. */
  saveMapDelta: spec("island-settlers-save-map-delta", 2, [1, 2], false),
  /** `saveEncoding` of a compact stored save (save-map-delta.ts). */
  saveMapEncoding: spec("island-settlers-save-encoding", 2, [2], false),
  /** Scene replay journal (development capture). */
  sceneReplay: spec("island-settlers-scene-replay", 2, [2], false),
  /** Script run state inside a save (trigger design, TRG lanes); reserved, not written yet. */
  scriptRunState: spec("island-settlers-script-run-state", 1, [1], false),
  /**
   * Island simulation save. 5 (A13 phase 2 rules version): the fog of war is simulation state written in the
   * tick; a version 4 save still loads and its saved exploration rebuilds the fog. 6 (A13 phase 3 rules
   * version): the AI acts only on what its faction knows; the combat save gains `knowledge` (hit alerts, last
   * known enemies). Versions 4 and 5 still load and start knowing nothing (the next tick sees again). 7 (BD1
   * rules version): every building except the player's HQ and landing harbour can take walls and be destroyed
   * (doors on any building, ownership on any type), raiders follow the merged target list, and `knowledge`
   * gains `buildings` (enemy buildings each computer faction has seen). Versions 4-6 still load: they hold no
   * such walls and their factions remember no buildings yet. 8 (A14-1 rules version): the computer commander
   * splits squads into role groups with chosen positions; each squad memory may carry `groups` (troop type, role,
   * point, decisions since its order). Versions 4-7 still load with no role groups (the next decision assigns them).
   * 9 (A14-2 rules version): danger-matrix targeting and squad focus; field soldiers carry morale (`morale`,
   * `moraleState`, `calm`, `focus`, `orderedTick` in their field memory) and the combat save a `morale` block of
   * recent falls per faction. Versions 4-8 still load: every soldier starts steady at its base morale.
   * 10 (A14-3 rules version): covered retreat routes; a routing soldier's field memory may carry its rally point
   * (`rally`) and its blocked-way count (`blocked`, cornered at 2). Versions 4-9 still load: a soldier routing in
   * an older save runs on to its current leg and picks a rally point if it breaks again.
   * 11 (A14-4a): the strategic director; the combat save may carry a `director` block (forces per computer
   * faction: macro, task, members, home, staging, target, scout). Versions 4-10 still load with no forces: running
   * colony raids go on as unit-level raiders.
   * 12 (A14-4b rules version): strategic knowledge; `knowledge.buildings` becomes the known-sites ledger
   * `knowledge.sites` (type, position, first/last seen tick, garrison seen), with `sectors` (last seen tick per
   * 16-tile sector) and `scouting` (scout plans); unit records gain their first known tick. Versions 4-11 still
   * load: seen buildings migrate as known since tick 0 with an unseen garrison, no sector counts as seen yet.
   * 13 (A14-4c): the economy AI's strategic contract; a director faction may carry `intents` (≤ 4: intent, status,
   * committed strength, force) and `requests` (army requests), also without a force, and a force its `intent`
   * and post `radius`. Versions 4-12 still load: no faction has intents, the director acts on its defaults.
   * 14 (A14-5): commander levels; the combat save may carry `commanderLevels` (`[faction, level]` a map script set
   * with `setCommanderLevel`). Versions 4-13 still load: no faction has a script level.
   * 15 (BD2 rules version): ruins and the clearing job; a fallen building of an owner with an economy leaves a
   * ruin (`ruins`: plot, salvage, clearer, work seconds, backoff in game ticks) that a settler clears, a clearer
   * carries `ruinClearing`, and a destroyed storage loses part of its pool. Versions 4-14 still load: no ruin.
   * 16 (EAI2c): faction AI script overrides; the script run save may carry `factionAi` (per faction the mode,
   * style, level and pause a map script set with `setFactionAi` / `factionAiPause`). Versions 4-15 still load: no
   * faction has an override.
   * 17 (EAI2a): the enemy economy AI; a save of a map whose computer factions have an AI (`MapScenario.factionAi`
   * maintain/develop, or a faction a script switched) carries `factionAi` (per faction: mode, style, level, paused,
   * the due tick of each decision layer); it replaces the script run's `factionAi` override of format 16, which a
   * load migrates. Versions 4-16 still load: each AI faction starts from the map's entry with fresh clocks.
   * 18 (EAI2b): a faction AI entry may carry `economy` (a script woke the map's `none` faction: it runs an economy)
   * and `maintain` (plots waiting to be rebuilt). Versions 4-17 still load: no woken economy, nothing to rebuild.
   * 19 (EAI2d rules version): wall repair; a computer economy's settler may carry `wallRepair` (the building and the
   * HP its paid load restores) with the load in `demolitionCargo`, and a faction's `maintain` may carry `repairs`
   * (walls whose repair backs off); `maintain.rebuilds` may be absent. Versions 4-18 still load: nobody repairs.
   * 20 (EAI3a): a faction AI entry may carry `develop` (the committed build goal and refused goals' backoffs).
   * Versions 4-19 still load: a develop faction holds no goal until its next strategic decision.
   * 21 (AI-RELOAD-DRIFT): `movementResume` carries the route repair budget (grant window phase, clock, queue,
   * reservations), the walkers' obstacle detour waits, pending road checks and proactive sidestep budgets, and a
   * `carrierDetours` entry may carry the carrier's current straight `leg` start, so a reload steps like the
   * uninterrupted island. Versions 4-20 still load: those memories start empty at the load tick, as before.
   * 22 (EAI3c): a faction AI entry's `develop` may carry `discovered` (the faction's discovered cells, packed bits),
   * `deposits` (mine zones its geologists surveyed), `fortify` (its posture), `cursor` (the economy manager's rolling
   * building cursor) and `surveyCursor`; a computer economy's geologist may be out surveying. Versions 4-21 still
   * load: a develop faction starts with no discovery beyond what its vision restamps and no surveyed deposit.
   * 23 (EAI4c): a faction AI entry may carry `goal` (a script's `setFactionGoal`: the goal, its area, its attack
   * target and the tick it ends at), and a director intent `launched` (its attack has set out once). Versions 4-22
   * still load: no faction has a script goal.
   * 24 (EAI4b): a faction AI entry may carry `strategy` (its own strategic intents' memory: offensive target,
   * failures in a row, retry tick, whether its intents stand). Versions 4-23 still load: nothing remembered.
   * 25 (targetMilitary): a soldier's combat state may carry `chase` (the enemy unit it is locked onto and, while
   * out of sight, where it vanished). Versions 4-24 still load: nobody chases.
   * 26 (MAP BUILDING AVAILABILITY): the save may carry `homeBuildingRules` (the player's home-island building
   * rules: tier, bans, level caps, sandbox unlock). Versions 4-25 still load: the map's rules apply.
   * 27 (Shift queue): the military save may carry `orderQueues` (each soldier group's current and waiting orders)
   * and a soldier's combat state `queue` (the queue it marches with). Versions 4-26 still load: no queue runs.
   */
  settlement: spec("island-settlers-settlement", 27,
    [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27])
} as const satisfies Readonly<Record<string, FormatSpec>>;

export type FormatName = keyof typeof FORMATS;

/** Why a document's version is refused. */
export type FormatVersionIssue = "invalidVersion" | "newerVersion" | "unsupportedVersion";

export const formatVersionIssue = (format: FormatSpec, version: unknown): FormatVersionIssue | null => {
  if (typeof version !== "number" || !Number.isInteger(version)) return "invalidVersion";
  if (format.accepted.includes(version)) return null;
  return version > format.current ? "newerVersion" : "unsupportedVersion";
};

/** An object tagged with the format's id (when it carries one) and an accepted version. */
export const isFormat = (value: unknown, format: FormatSpec): value is Record<string, unknown> =>
  isPlainObject(value) && (!format.formatField || value.format === format.id) &&
  formatVersionIssue(format, value.version) === null;

/** An object tagged with the format's id (when it carries one) and exactly its current version. */
export const isCurrentFormat = (value: unknown, format: FormatSpec): value is Record<string, unknown> =>
  isPlainObject(value) && (!format.formatField || value.format === format.id) && value.version === format.current;

/** Upgrades a document of version `from` to `from + 1`. */
export type FormatMigration = (document: Record<string, unknown>) => Record<string, unknown>;

/**
 * The migrations hook: applies `steps[version]` until the document reaches `format.current`. Returns null when
 * a step is missing or the version is not an older integer version.
 */
export const migrateFormat = (
  format: FormatSpec, document: Record<string, unknown>, steps: Readonly<Record<number, FormatMigration>>
): Record<string, unknown> | null => {
  let current = document;
  while (current.version !== format.current) {
    const version = current.version;
    if (!Number.isSafeInteger(version) || (version as number) > format.current) return null;
    const step = steps[version as number];
    if (!step) return null;
    current = step(current);
    if (current.version !== (version as number) + 1) return null;
  }
  return current;
};
