import {
  type Check, type CheckFields, guard, isStringList, objectOf, optional as optionalCheck
} from "../../validation/index.ts";
import type { Fields, IssueSink } from "./issues.ts";

/** One payload field: a value test and the message reported when it fails. */
export interface FieldRule {
  message: string;
  optional?: true;
  test: (value: unknown) => boolean;
}

export type FieldRules = Readonly<Record<string, FieldRule>>;

export const isOneOf = (options: readonly unknown[]) => (value: unknown) => options.includes(value);
export const isListOf = (options: readonly string[]) => (value: unknown) =>
  isStringList(value) && value.length > 0 && value.every(item => options.includes(item));

export const rule = (test: FieldRule["test"], message: string): FieldRule => ({ message, test });
export const optional = (test: FieldRule["test"], message: string): FieldRule => ({ message, optional: true, test });

const fieldCheck = ({ message, optional: isOptional, test }: FieldRule): Check =>
  isOptional ? optionalCheck(guard(test, message)) : guard(test, message);

/** The kit object check of each rule set, built once. */
const objectChecks = new WeakMap<FieldRules, Check>();

const objectCheck = (rules: FieldRules) => {
  const cached = objectChecks.get(rules);
  if (cached) return cached;
  const fields: CheckFields = Object.fromEntries(
    Object.entries(rules).map(([field, entry]) => [field, fieldCheck(entry)]));
  const check = objectOf(fields);
  objectChecks.set(rules, check);
  return check;
};

/**
 * Checks a payload object against its field rules (the kit's strict object check): no unknown field may appear
 * and every rule's field must pass (optional ones only when present). Returns the payload when it is an object.
 */
export const checkFields = (
  payload: unknown, path: string, sink: IssueSink, rules: FieldRules, shape: string
): Fields | null => {
  let isObject = true;
  objectCheck(rules)(payload, path, {
    add: (_code, issuePath, message) => {
      if (issuePath !== path) {
        sink.add("payload", issuePath, message);
        return;
      }
      isObject = false;
      sink.add("payload", path, `A payload is ${shape}`);
    }
  });
  return isObject ? payload as Fields : null;
};
