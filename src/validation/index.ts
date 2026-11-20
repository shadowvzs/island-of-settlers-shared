/** The shared hand-written validation kit (UNIFY-B3): guards, safe trees, issues and structural checks. */
export {
  FORBIDDEN_KEYS, hasPlainPrototype, isFiniteNumber, isForbiddenKey, isNonEmptyString, isPlainObject, isPositiveCount,
  isSafeCount, isSafeIntegerFrom, isStringList, isTick
} from "./guards.ts";
export {
  createIssueCollector, fieldPath, indexPath, type IssueCollector, type IssueSink, type ValidationIssue
} from "./issues.ts";
export {
  arrayOf, boolean, type Check, type CheckFields, checkValue, conforms, discriminatedUnion, enumOf, guard, integer,
  literal, nullable, number, type NumberRule, objectOf, optional, recordOf, type RecordRule, type SchemaIssueCode,
  string, type StringRule, union
} from "./schema.ts";
export {
  isSafeTree, MAX_SAVE_DEPTH, SAVE_UPLOAD_DEPTH, treeIssue, type TreeIssueCode, type TreeLimits
} from "./tree.ts";
