import { hasPlainPrototype, isForbiddenKey } from "../../validation/index.ts";
import type { IssueSink } from "./issues.ts";

/**
 * Plain JSON data only: null, booleans, finite numbers, strings, arrays and plain objects. Functions,
 * getters, classes, `Map`/`Set`, `undefined`, `NaN`, `Infinity` and prototype keys (`__proto__`, …) are refused.
 */
export const checkPlainJson = (value: unknown, path: string, sink: IssueSink): void => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) sink.add("notJson", path, "Numbers must be finite");
    return;
  }
  if (typeof value !== "object") {
    sink.add("notJson", path, `A ${typeof value} is not JSON data`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => checkPlainJson(item, `${path}[${index}]`, sink));
    return;
  }
  if (!hasPlainPrototype(value)) {
    sink.add("notJson", path, "Only plain objects are JSON data");
    return;
  }
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (isForbiddenKey(key)) sink.add("notJson", `${path}.${key}`, "Prototype keys are not catalog data");
    else if (!("value" in descriptor)) sink.add("notJson", `${path}.${key}`, "Accessors are not JSON data");
    else checkPlainJson(descriptor.value, `${path}.${key}`, sink);
  }
};
