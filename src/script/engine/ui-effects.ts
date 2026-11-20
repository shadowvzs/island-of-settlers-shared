import { secondsToTicks } from "../../time/constants.ts";
import {
  AUDIO_DEFAULT_FADE_SECONDS, AUDIO_OPTION_RANGES, type AudioOptionName, type AudioRef
} from "../audio.ts";
import { HIGHLIGHT_UNTIL, SCRIPT_LIMITS } from "../constants.ts";
import type { QuestText } from "../types/quest-text.ts";
import type { PlayerFilter } from "../types/refs.ts";
import type { ScriptRun } from "../types/run-state.ts";
import type { ActionArg, ScriptAction } from "../types/triggers.ts";
import type { UiTarget } from "../types/ui.ts";
import type { ActorHandleValue, Expr } from "../types/values.ts";
import type { ScriptEngineCore } from "./core.ts";
import { createEvalScope, evaluateExpr } from "./expressions.ts";
import { advance, previousStep } from "./run-flow.ts";

/**
 * Presentation effects of the map script (trigger design §5.2.9, §6.10, §6.12; lane TRG9). UI actions and mails
 * never touch the run state beyond the waiting `highlightUi` (a saved `uiAck` wait): the engine appends them to
 * an outbox that is neither saved nor hashed. The client drains it after its ticks; the verifier, headless replay
 * and offline catch-up never read it, so their effects are simply dropped. The only way back into the simulation
 * is the recorded `scriptUiAck` command.
 */

export type HighlightUntil = (typeof HIGHLIGHT_UNTIL)[number];

/** A UI target with its references resolved: the building actor becomes a live handle (or null when gone). */
export type ResolvedUiTarget =
  | Exclude<UiTarget, { kind: "building" } | { kind: "quests" }>
  | { handle: ActorHandleValue | null; kind: "building" }
  | { kind: "quests"; questId: string | null };

export interface ScriptUiHighlight {
  anchor: string;
  /** `ui:<runId>:<stepId>:<scriptTick>`: deterministic, unique per created highlight. */
  effectId: string;
  /** Only for `until: "seconds"`. */
  seconds: number | null;
  text: QuestText | null;
  until: HighlightUntil;
  /** The run waits for the click (`scriptUiAck`); such highlights are re-derived from saved runs on reload. */
  waiting: boolean;
}

export interface ScriptMailEffect {
  attachments: { goods: { amount: number; ware: string }[] } | null;
  body: QuestText;
  /** `gameNow` UTC ms at the sending tick. */
  date: number;
  /** `mail:<scriptUid>:<trigger|quest>:<runId>.<stepId>` (idempotent per run and step). */
  id: string;
  title: QuestText;
}

/**
 * Audio effects (owner 2026-11-12): like every outbox effect they are presentation only (never saved or hashed,
 * dropped in catch-up and by the verifier). The client plays them at once and applies the player's audio settings.
 */
export type ScriptAudioEffect =
  | { kind: "playSound"; sound: AudioRef; volume: number }
  | { fadeInSeconds: number; fadeOutSeconds: number; kind: "playMusic"; loop: boolean; track: AudioRef;
    volume: number }
  | { fadeOutSeconds: number; kind: "stopMusic" };

export type ScriptUiEffect =
  | ScriptAudioEffect
  | { kind: "openUi"; target: ResolvedUiTarget }
  | { kind: "closeUi"; target: ResolvedUiTarget }
  | { highlight: ScriptUiHighlight; kind: "highlightUi" }
  | { kind: "clearHighlights" }
  | { actor: ActorHandleValue | null; kind: "focusCamera"; region: string | null }
  | { kind: "sendMail"; mail: ScriptMailEffect };

/** Outbox bound: an engine nobody drains (verifier, server bundle) keeps at most this many effects. */
export const UI_EFFECT_OUTBOX_LIMIT = 64;

export const UI_EFFECT_OPS: ReadonlySet<string> =
  new Set(["openUi", "closeUi", "highlightUi", "clearHighlights", "focusCamera", "sendMail", "playSound", "playMusic",
    "stopMusic"]);

type DoStep = Extract<ScriptAction, { k: "do" }>;
type UiStepResult = "next" | "wait" | "end";

const HUMAN_FACTION = 0;

const isExpr = (arg: ActionArg | undefined): arg is Expr =>
  typeof arg === "object" && arg !== null && !Array.isArray(arg) && "k" in arg;

const evaluateArg = (core: ScriptEngineCore, run: ScriptRun, arg: ActionArg | undefined) =>
  isExpr(arg) ? evaluateExpr(core, run, arg) : null;

const stringArg = (core: ScriptEngineCore, run: ScriptRun, arg: ActionArg | undefined) => {
  const value = evaluateArg(core, run, arg);
  return typeof value === "string" ? value : null;
};

const textArg = (core: ScriptEngineCore, run: ScriptRun, arg: ActionArg | undefined) => {
  const value = evaluateArg(core, run, arg);
  return typeof value === "object" && value !== null && !Array.isArray(value) && "en" in value
    ? value as QuestText : null;
};

const untilOf = (value: string | null): HighlightUntil =>
  (HIGHLIGHT_UNTIL as readonly string[]).includes(value ?? "") ? value as HighlightUntil : "clicked";

/** The single human player sees the effect (single player: faction 0 is the only viewer). */
const audienceIncludesViewer = (core: ScriptEngineCore, arg: ActionArg | undefined) => {
  const filter = arg as PlayerFilter | null | undefined;
  if (!filter || typeof filter !== "object" || !("kind" in filter)) return true;
  switch (filter.kind) {
    case "any": return true;
    case "slot": return core.port.playerIsHuman(filter.faction);
    case "alliesOf":
      if (filter.faction === HUMAN_FACTION) return filter.includeSelf;
      return core.port.playersAllied(filter.faction, HUMAN_FACTION);
    case "enemiesOf": return !core.port.playersAllied(filter.faction, HUMAN_FACTION);
    default: return false;
  }
};

const resolveTarget = (
  core: ScriptEngineCore, run: ScriptRun, arg: ActionArg | undefined
): ResolvedUiTarget | null => {
  const target = arg as UiTarget | null | undefined;
  if (!target || typeof target !== "object" || !("kind" in target)) return null;
  if (target.kind === "quests") return { kind: "quests", questId: target.quest?.id ?? null };
  if (target.kind !== "building") return target;
  const handles = createEvalScope(core, run).resolveActors(target.actor);
  return { handle: handles[0] ?? null, kind: "building" };
};

/** Appends an effect while live; catch-up and full outboxes drop it (oldest first when full). */
export const pushUiEffect = (core: ScriptEngineCore, effect: ScriptUiEffect) => {
  if (core.mode !== "live") return;
  const outbox = core.uiOutbox;
  if (outbox.length >= UI_EFFECT_OUTBOX_LIMIT) outbox.shift();
  outbox.push(effect);
};

const highlightOf = (
  core: ScriptEngineCore, run: ScriptRun, step: DoStep, waiting: boolean
): ScriptUiHighlight => {
  const until = untilOf(stringArg(core, run, step.args.until));
  const seconds = evaluateArg(core, run, step.args.seconds);
  return {
    anchor: stringArg(core, run, step.args.anchor) ?? "",
    effectId: `ui:${run.id}:${step.id}:${core.state.scriptTick}`,
    seconds: until === "seconds" && typeof seconds === "number" ? seconds : null,
    text: textArg(core, run, step.args.text),
    until,
    waiting
  };
};

const openUiAckWaits = (core: ScriptEngineCore) =>
  core.state.runs.reduce((count, run) => count + (run.waiting?.kind === "uiAck" ? 1 : 0), 0);

const setOutcomeValue = (run: ScriptRun, outcome: string) => {
  run.context.outcome = { type: "string", value: outcome };
};

/** `highlightUi`: with `until: "clicked"` and a wait spec the run waits for `scriptUiAck` (≤ `uiAckWaits`). */
const runHighlight = (core: ScriptEngineCore, run: ScriptRun, step: DoStep): UiStepResult => {
  const wantsWait = Boolean(step.wait) && untilOf(stringArg(core, run, step.args.until)) === "clicked";
  if (wantsWait && openUiAckWaits(core) >= SCRIPT_LIMITS.uiAckWaits) {
    core.log("actionFailed", `highlightUi ${step.id}: refused (uiAckWaits)`);
    setOutcomeValue(run, "refused");
    return step.wait!.onFail === "stop" ? "end" : "next";
  }
  const highlight = highlightOf(core, run, step, wantsWait);
  pushUiEffect(core, { highlight, kind: "highlightUi" });
  if (!wantsWait) {
    if (step.wait) setOutcomeValue(run, "done");
    return "next";
  }
  advance(run);
  run.waiting = {
    effectId: highlight.effectId, kind: "uiAck",
    timeoutScriptTick: core.state.scriptTick + Math.max(1, secondsToTicks(step.wait!.timeoutSeconds))
  };
  return "wait";
};

const ownerKey = (run: ScriptRun) => {
  if (run.owner.kind === "trigger") return run.owner.triggerId;
  if (run.owner.kind === "quest") return run.owner.questId;
  return run.owner.sequenceId;
};

const mailOf = (core: ScriptEngineCore, run: ScriptRun, step: DoStep): ScriptMailEffect | null => {
  const title = textArg(core, run, step.args.title);
  const body = textArg(core, run, step.args.body);
  if (!title || !body) return null;
  const goods = step.args.attachmentsInfo as { amount: number; ware: string }[] | null | undefined;
  return {
    attachments: Array.isArray(goods) && goods.length > 0 ? { goods: goods.map(line => ({ ...line })) } : null,
    body, date: core.port.gameNow(),
    id: `mail:${core.script.scriptUid}:${ownerKey(run)}:${run.id}.${step.id}`, title
  };
};

const focusEffect = (core: ScriptEngineCore, run: ScriptRun, step: DoStep): ScriptUiEffect => {
  const selector = step.args.actor;
  const actor = selector && typeof selector === "object" && "kind" in selector && !isExpr(selector)
    ? createEvalScope(core, run).resolveActors(selector as never)[0] ?? null : null;
  const region = step.args.region as { id?: string } | null | undefined;
  return { actor, kind: "focusCamera", region: region?.id ?? null };
};

const isAudioRef = (arg: unknown): arg is AudioRef => {
  const ref = arg as Partial<Record<string, unknown>> | null | undefined;
  if (!ref || typeof ref !== "object") return false;
  return (ref.kind === "catalog" && typeof ref.id === "string") ||
    (ref.kind === "upload" && typeof ref.assetId === "string");
};

/** A numeric audio option clamped to its range; `fallback` when unset or not a number. */
const audioOption = (core: ScriptEngineCore, run: ScriptRun, step: DoStep, name: AudioOptionName, fallback: number) => {
  const value = evaluateArg(core, run, step.args[name]);
  const { max, min } = AUDIO_OPTION_RANGES[name];
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
};

const audioEffect = (core: ScriptEngineCore, run: ScriptRun, step: DoStep): ScriptAudioEffect | null => {
  const fadeOutSeconds = audioOption(core, run, step, "fadeOutSeconds", AUDIO_DEFAULT_FADE_SECONDS);
  if (step.op === "stopMusic") return { fadeOutSeconds, kind: "stopMusic" };
  const volume = audioOption(core, run, step, "volume", 1);
  if (step.op === "playSound")
    return isAudioRef(step.args.cue) ? { kind: "playSound", sound: { ...step.args.cue }, volume } : null;
  if (!isAudioRef(step.args.track)) return null;
  return {
    fadeInSeconds: audioOption(core, run, step, "fadeInSeconds", AUDIO_DEFAULT_FADE_SECONDS), fadeOutSeconds,
    kind: "playMusic", loop: stringArg(core, run, step.args.mode) !== "once", track: { ...step.args.track }, volume
  };
};

const simpleEffect = (core: ScriptEngineCore, run: ScriptRun, step: DoStep): ScriptUiEffect | null => {
  switch (step.op) {
    case "openUi":
    case "closeUi": {
      const target = resolveTarget(core, run, step.args.target);
      return target ? { kind: step.op, target } : null;
    }
    case "clearHighlights": return { kind: "clearHighlights" };
    case "playMusic":
    case "playSound":
    case "stopMusic": return audioEffect(core, run, step);
    case "focusCamera": return focusEffect(core, run, step);
    case "sendMail": {
      const mail = mailOf(core, run, step);
      return mail ? { kind: "sendMail", mail } : null;
    }
    default: return null;
  }
};

/** Runs a presentation op; never touches the world and never asks the world port. */
export const runUiAction = (core: ScriptEngineCore, run: ScriptRun, step: DoStep): UiStepResult => {
  if (!audienceIncludesViewer(core, step.args.audience)) return "next";
  if (step.op === "highlightUi") return runHighlight(core, run, step);
  const effect = simpleEffect(core, run, step);
  if (effect) pushUiEffect(core, effect);
  else core.log("actionFailed", `${step.op} ${step.id}: invalid arguments`);
  return "next";
};

/**
 * Highlights whose run waits on `uiAck`, re-derived from the saved run state (design §6.10, rev m10): after a
 * reload the wait survives and the client shows the same highlight again. Runs in saved order (deterministic).
 */
export const waitingUiHighlights = (
  core: ScriptEngineCore, rootList: (run: ScriptRun) => readonly ScriptAction[] | null
): ScriptUiHighlight[] => {
  const highlights: ScriptUiHighlight[] = [];
  for (const run of core.state.runs) {
    if (run.waiting?.kind !== "uiAck") continue;
    const step = previousStep(rootList(run) ?? [], run);
    if (step?.k !== "do" || step.op !== "highlightUi") continue;
    highlights.push({ ...highlightOf(core, run, step, true), effectId: run.waiting.effectId });
  }
  return highlights;
};
