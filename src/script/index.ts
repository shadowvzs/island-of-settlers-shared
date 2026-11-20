/** The map script (trigger design): types, catalogues, scopes, references and the Ready check. Pure, worker-safe. */
export * from "./archipelago/index.ts";
export * from "./audio.ts";
export * from "./catalog/index.ts";
export * from "./constants.ts";
export * from "./engine/index.ts";
export {
  createScriptIssueSink, formatScriptIssue, SCRIPT_ISSUE_MESSAGES, type ScriptIssue, type ScriptIssueCode,
  type ScriptIssueSeverity, type ScriptValidationResult
} from "./issues.ts";
export { checkIslandScriptState, checkPlayerScriptState } from "./island-state.ts";
export { isScriptRef, scriptReferences, type ScriptReference, scriptUsersOf, walkScriptRefs } from "./references.ts";
export {
  isActionAllowed, isEventAllowed, isObjectiveAllowed, isUiTargetAllowed, SCRIPT_SCOPES, type ScriptScope
} from "./scopes.ts";
export type * from "./types/index.ts";
export {
  CONTENT_CATALOG_VIEW, type ScriptCatalogView, type ScriptValidationContext, validateMapScript
} from "./validate.ts";
export {
  decodeHeaderScript, type DecodedHeaderScript, encodeHeaderScript, type HeaderScriptFields, readMapFileScript
} from "./codec.ts";
export { scriptReadsEnvironment } from "./environment.ts";
export { canonicalHash, canonicalJson, freezeMapScript, isScriptHash, mapScriptHash } from "./hash.ts";
export {
  type HeaderScriptRef, type MapScriptSnapshot, restoreScriptSnapshot, type RestoredScriptSnapshot,
  startScriptSnapshot, storeScriptSnapshot, type StoredScriptSnapshot
} from "./snapshot.ts";
export {
  checkPlacedObjects, type PlacedObjectFacts, type PlacedObjectLookup, scriptUsersOfObject
} from "./placed-objects.ts";
