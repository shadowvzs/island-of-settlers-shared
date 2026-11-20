import type { EventResponseKey, ValueType } from "../types/values.ts";

/** What the expressions of one position may read (trigger design §4.4, §4.6). */
export interface ExprScope {
  /** Quest whose failure list runs in the archipelago executor (only colonyEnd/notify allowed). */
  archipelagoQuest?: string;
  /** Inside a multiboard cell: the cell context keys are readable. */
  cell: boolean;
  /** The variable a `variableChanged` event watches (types `oldValue`/`newValue`). */
  changedVariable?: string;
  /** Nesting depth of conditions/action lists. */
  depth: number;
  locals: ReadonlyMap<string, ValueType>;
  /** Event responses every firing of the current run provides. */
  responses: ReadonlySet<EventResponseKey>;
}

/** Where catalogue slots are checked: events read `actor.capabilities`, actions `actor.targetOf`. */
export type SlotMode = "event" | "action" | "query";

export const createScope = (responses: Iterable<EventResponseKey> = []): ExprScope =>
  ({ cell: false, depth: 0, locals: new Map(), responses: new Set(responses) });

export const deeper = (scope: ExprScope): ExprScope => ({ ...scope, depth: scope.depth + 1 });

export const withLocal = (scope: ExprScope, name: string, type: ValueType): ExprScope =>
  ({ ...scope, depth: scope.depth + 1, locals: new Map([...scope.locals, [name, type]]) });
