import { isPlainObject } from "../validation/index.ts";
import { ACTION_CATALOG, EVENT_CATALOG, FUNCTION_CATALOG, PREDICATE_CATALOG } from "./catalog/index.ts";
import type { MapScript } from "./types/script.ts";

/**
 * The `MapHeader.scriptReadsEnvironment` flag (trigger design §6.11, ENV0): true when any action, condition,
 * expression, event or built-in objective of the script reads or writes the hour or the weather. The map writer
 * derives it without a validation context (the Ready check reports the same flag through `validateMapScript`).
 */

type Lookup = Readonly<Record<string, object>>;

/** Tagged nodes whose catalogue entry may touch the environment: tag value → [name field, catalogue]. */
const TAGGED_NODES: Readonly<Record<string, readonly [string, Lookup]>> = {
  do: ["op", ACTION_CATALOG],
  fn: ["fn", FUNCTION_CATALOG],
  is: ["pred", PREDICATE_CATALOG]
};

const touchesEnvironment = (catalogue: Lookup, name: unknown) =>
  typeof name === "string" && Object.hasOwn(catalogue, name) &&
  (catalogue[name] as { environment?: boolean }).environment === true;

const isEnvironmentNode = (node: Record<string, unknown>) => {
  const tagged = typeof node.k === "string" ? TAGGED_NODES[node.k] : undefined;
  if (tagged && touchesEnvironment(tagged[1], node[tagged[0]])) return true;
  return node.kind === "clockTime";
};

const readsEnvironment = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(readsEnvironment);
  if (!isPlainObject(value)) return false;
  if (isEnvironmentNode(value)) return true;
  return Object.values(value).some(readsEnvironment);
};

const eventsReadEnvironment = (script: MapScript) => script.triggers.some(trigger =>
  trigger.events.some(event => touchesEnvironment(EVENT_CATALOG, event.kind)));

export const scriptReadsEnvironment = (script: MapScript): boolean =>
  eventsReadEnvironment(script) || readsEnvironment(script.triggers) || readsEnvironment(script.quests) ||
  readsEnvironment(script.variables);
