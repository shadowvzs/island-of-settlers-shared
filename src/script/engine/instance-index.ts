import type { ScriptRunState } from "../types/run-state.ts";
import type { ActorHandleValue, ScriptValue } from "../types/values.ts";
import { instanceKeyOfActor, instanceKeyOfVariable } from "./subscriptions.ts";
import { handleKey } from "./values.ts";

/**
 * Reverse index handle → authored actors and actor variables holding it (design §6.7). Instance subscriptions and
 * "drop a gone member from every variable" are one lookup. Derived: rebuilt on load, updated on variable writes.
 */
export class InstanceIndex {
  private readonly keysByHandle = new Map<string, string[]>();

  keysOf(handle: ActorHandleValue): readonly string[] {
    return this.keysByHandle.get(handleKey(handle)) ?? [];
  }

  rebuild(state: ScriptRunState) {
    this.keysByHandle.clear();
    for (const actorId of Object.keys(state.actors).sort()) {
      for (const member of state.actors[actorId]!.members) this.add(member.handle, instanceKeyOfActor(actorId));
    }
    for (const variableId of Object.keys(state.values).sort()) {
      this.addVariable(variableId, state.values[variableId]!);
    }
  }

  /** Replaces the handles one variable contributes. */
  replaceVariable(variableId: string, previous: ScriptValue | undefined, next: ScriptValue) {
    const key = instanceKeyOfVariable(variableId);
    for (const handle of actorHandlesOf(previous)) this.remove(handle, key);
    this.addVariable(variableId, next);
  }

  private addVariable(variableId: string, value: ScriptValue) {
    for (const handle of actorHandlesOf(value)) this.add(handle, instanceKeyOfVariable(variableId));
  }

  private add(handle: ActorHandleValue, key: string) {
    const mapKey = handleKey(handle);
    const keys = this.keysByHandle.get(mapKey);
    if (!keys) this.keysByHandle.set(mapKey, [key]);
    else if (!keys.includes(key)) keys.push(key);
  }

  private remove(handle: ActorHandleValue, key: string) {
    const mapKey = handleKey(handle);
    const keys = this.keysByHandle.get(mapKey)?.filter(item => item !== key);
    if (!keys || keys.length === 0) this.keysByHandle.delete(mapKey);
    else this.keysByHandle.set(mapKey, keys);
  }
}

const actorHandlesOf = (value: ScriptValue | undefined): readonly ActorHandleValue[] => {
  if (value?.type !== "actor" && value?.type !== "actorGroup") return [];
  return value.value;
};
