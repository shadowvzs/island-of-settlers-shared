import { COLONY_END_REASONS } from "../constants.ts";
import type { QuestTextExprValue } from "../text/context.ts";
import type { QuestBook, QuestText, ScriptAction, ScriptQuest } from "../types/index.ts";
import { defaultColonyBook } from "./colony-book.ts";
import type { ArchipelagoExecutorPort, ArchipelagoRunResult, ColonyEndReason } from "./types.ts";

/**
 * The client archipelago executor (trigger design §8.2 item 3, owner round 6): runs a colony quest's `onFailure`
 * list outside the simulation, for colonies that end in the archipelago (expiry, harbour loss, disbanding). It
 * supports exactly `colonyEnd` and `notify`; everything else is reported and skipped. The server never runs it:
 * expiry there is a silent drop without a mail.
 */

type DoStep = Extract<ScriptAction, { k: "do" }>;

const literal = (arg: unknown): unknown => {
  const node = arg as { k?: string; value?: unknown } | null | undefined;
  return node?.k === "lit" ? node.value : undefined;
};

const endReason = (step: DoStep): ColonyEndReason | null => {
  const reason = literal(step.args.reason);
  return COLONY_END_REASONS.includes(reason as ColonyEndReason) ? reason as ColonyEndReason : null;
};

const noticeText = (step: DoStep): QuestText | null => {
  const node = step.args.text as { k?: string; text?: QuestText } | undefined;
  return node?.k === "text" && node.text ? node.text : null;
};

const runStep = (step: ScriptAction, port: ArchipelagoExecutorPort, result: ArchipelagoRunResult) => {
  if (step.disabled) return;
  if (step.k !== "do") { result.unsupported.push(step.id); return; }
  const reason = step.op === "colonyEnd" ? endReason(step) : null;
  const text = step.op === "notify" ? noticeText(step) : null;
  if (reason) {
    if (port.colonyEnd(reason)) result.ended = reason;
    return;
  }
  if (!text) { result.unsupported.push(step.id); return; }
  port.notify({ important: literal(step.args.important) !== false, text });
  result.notices += 1;
};

/** The quest of the colony's own book, else of the shipped default colony book. */
export const archipelagoQuest = (book: QuestBook | null | undefined, questId: string): ScriptQuest | undefined =>
  book?.quests.find(quest => quest.id === questId) ??
  defaultColonyBook().quests.find(quest => quest.id === questId);

/**
 * Fails `questId` in the archipelago: runs its `onFailure` list in order through the port. A colony the server
 * already dropped makes `colonyEnd` a skipped step, so only the notice is shown.
 */
export const runArchipelagoFailure = (
  book: QuestBook | null | undefined, questId: string, port: ArchipelagoExecutorPort
): ArchipelagoRunResult => {
  const result: ArchipelagoRunResult = { ended: null, notices: 0, unsupported: [] };
  for (const step of archipelagoQuest(book, questId)?.onFailure ?? []) runStep(step, port, result);
  return result;
};

/** The notices a quest's failure would show, without ending anything (login detection, previews). */
export const archipelagoFailureNotices = (book: QuestBook | null | undefined, questId: string) => {
  const notices: Parameters<ArchipelagoExecutorPort["notify"]>[0][] = [];
  runArchipelagoFailure(book, questId, { colonyEnd: () => false, notify: notice => notices.push(notice) });
  return notices;
};

/** Evaluates the placeholders of an archipelago notice: only `islandName` exists outside the simulation. */
export const archipelagoTextValues = (facts: { islandName: string }) =>
  (value: QuestTextExprValue): string | undefined =>
    value.expr.k === "fn" && value.expr.fn === "islandName" ? facts.islandName : undefined;
