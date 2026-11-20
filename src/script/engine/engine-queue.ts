import type { ScriptEmission } from "../types/emission.ts";
import type { ScriptRunState } from "../types/run-state.ts";
import type { ScriptLookup } from "./core.ts";
import type { QueuedEvent } from "./engine.ts";
import type { SubscriptionIndex } from "./subscriptions.ts";

/** Start-of-tick queue fills of the engine (design §6.2, §6.5): cascade-deferred events and time subscriptions. */

/** Events pushed past the cascade depth last tick are delivered first, at depth 0. */
export const moveDeferredIntoQueue = (state: ScriptRunState, lookup: ScriptLookup, queue: QueuedEvent[]) => {
  if (state.deferred.length === 0) return;
  for (const entry of state.deferred) {
    const triggers = entry.triggerIds.map(id => lookup.triggerOrder.get(id))
      .filter((index): index is number => index !== undefined);
    queue.push({ depth: 0, emission: entry.emission, triggers });
  }
  state.deferred = [];
};

/** `elapsedTime` and `periodic` subscriptions due at this script tick. */
export const queueTimeEvents = (index: SubscriptionIndex, tick: number, queue: QueuedEvent[]) => {
  for (const subscription of index.time) {
    const elapsed = tick - subscription.firstTick;
    const periodic = subscription.periodTicks > 0 && elapsed > 0 && elapsed % subscription.periodTicks === 0;
    if (elapsed !== 0 && !periodic) continue;
    const emission: ScriptEmission = { kind: subscription.event.kind };
    queue.push({ depth: 0, emission, triggers: [subscription.triggerIndex] });
  }
};
