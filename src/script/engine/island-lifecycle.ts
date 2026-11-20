import type { IslandQuestDigest, IslandScriptState, ScriptIslandLifecycle } from "../types/islands.ts";
import type { MapKind } from "../types/refs.ts";
import type { MapScript } from "../types/script.ts";
import { ScriptEngine } from "./engine.ts";
import type { ScriptWorldPort } from "./ports.ts";
import { deadlineUtc } from "./quest-state.ts";
import { isClaimable } from "./repeat-windows.ts";
import { migrateScriptRunState } from "./run-state.ts";

/**
 * Island switching (design §6.14): one engine for the island on screen. `leave` finishes pending work at a tick
 * boundary, saves the run state and the island's quest digest and drops every in-memory index; `enter` loads the
 * map script, restores, migrates (home revision push) or creates the run state, runs catch-up for the time away
 * (script clock frozen, no events) and ends with the single date-bound deadline check.
 */

/** What the session knows about the island being entered. */
export interface ScriptIslandSession {
  islandKey: string;
  mapKind: MapKind;
  port: ScriptWorldPort;
  script: MapScript;
  scriptHash: string;
  /** `deriveSeed(world.seed, "script")`. */
  seed: number;
}

export interface ScriptIslandLifecycleOptions {
  /** Offline catch-up for the time away; the engine is in catch-up mode while it runs. */
  catchUp: (engine: ScriptEngine, saved: IslandScriptState | null) => void;
  /**
   * Whether a saved snapshot moves to the map's current revision. Default (conservative): only home islands, and
   * only when the map revision is newer (an admin push, design §6.13); other maps keep their snapshot until restart.
   */
  migrates?: (session: ScriptIslandSession, saved: IslandScriptState) => boolean;
  /** The engine of the island on screen; null after leave or on a map without a script. */
  onEngine?: (engine: ScriptEngine | null) => void;
  /** The island's map script and world port; null when the map has no script. */
  openIsland: (islandKey: string) => ScriptIslandSession | null;
}

export interface ScriptIslandController extends ScriptIslandLifecycle {
  readonly engine: ScriptEngine | null;
}

const defaultMigrates = (session: ScriptIslandSession, saved: IslandScriptState) =>
  session.mapKind === "home" && session.script.revision > saved.runState.snapshot.revision;

/** The visible quests of an island as the quest window lists them from elsewhere (design §6.14). */
export const buildIslandQuestDigest = (
  engine: ScriptEngine, islandKey: string, mapKind: MapKind
): IslandQuestDigest => {
  const now = engine.port.gameNow();
  const book = engine.script.quests;
  const quests = book.quests.filter(quest => quest.visibility === "visible").flatMap(quest => {
    const state = engine.state.quests[quest.id];
    if (!state || state.state === "inactive" || state.state === "retired") return [];
    return [{
      claimable: isClaimable(quest.repeat, state, now), deadlineUtc: deadlineUtc(engine, quest.deadline, state),
      questId: quest.id, state: state.state, title: quest.title ?? { en: quest.id }
    }];
  });
  return { bookId: book.id, islandKey, mapKind, quests, updatedAtUtc: now };
};

const restoreEngine = (session: ScriptIslandSession, saved: IslandScriptState | null,
  migrates: NonNullable<ScriptIslandLifecycleOptions["migrates"]>) => {
  if (!saved) {
    const engine = ScriptEngine.create(session.script, { port: session.port, scriptHash: session.scriptHash,
      seed: session.seed });
    engine.start("mapStarted");
    return engine;
  }
  if (!migrates(session, saved)) return ScriptEngine.load(structuredClone(saved.runState), session.port);
  const { state } = migrateScriptRunState(structuredClone(saved.runState), session.script, session.scriptHash);
  const engine = ScriptEngine.load(state, session.port);
  engine.start("scriptUpdated");
  return engine;
};

export const createScriptIslandLifecycle = (options: ScriptIslandLifecycleOptions): ScriptIslandController => {
  let current: { engine: ScriptEngine; session: ScriptIslandSession } | null = null;
  const migrates = options.migrates ?? defaultMigrates;
  const enter = (islandKey: string, saved: IslandScriptState | null) => {
    if (current) throw new Error(`Script island ${current.session.islandKey} is still active; leave it first`);
    const session = options.openIsland(islandKey);
    if (!session) {
      options.onEngine?.(null);
      return;
    }
    const engine = restoreEngine(session, saved, migrates);
    engine.setMode("catchUp");
    options.catchUp(engine, saved);
    engine.endCatchUp();
    current = { engine, session };
    options.onEngine?.(engine);
  };
  const leave = () => {
    if (!current) throw new Error("No script island is active");
    const { engine, session } = current;
    engine.drainPending();
    const state: IslandScriptState = {
      islandKey: session.islandKey, leftAtTick: session.port.gameTick(), leftAtUtc: session.port.gameNow(),
      mapKind: session.mapKind, runState: engine.saveState(), version: 1
    };
    const digest = buildIslandQuestDigest(engine, session.islandKey, session.mapKind);
    current = null;
    options.onEngine?.(null);
    return { digest, state };
  };
  return {
    enter,
    get engine() {
      return current?.engine ?? null;
    },
    leave
  };
};
