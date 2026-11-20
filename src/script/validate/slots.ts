import type { AudioKind } from "../../catalog/types/audio.ts";
import type { ContentKind } from "../../catalog/types/refs.ts";
import { validateRewardEntries } from "../../catalog/validate/rewards.ts";
import { CAMPAIGN_SOLDIER_TYPES } from "../../campaign/campaign-constants.ts";
import { isPlainObject } from "../../validation/index.ts";
import type { AudioRef } from "../audio.ts";
import type { SlotDef, SlotType } from "../catalog/slots.ts";
import { ARRAY_ELEMENT_TYPES, MAP_EDGE } from "../constants.ts";
import { isScriptRef } from "../references.ts";
import { isUiTargetAllowed } from "../scopes.ts";
import { checkNodeShape } from "../shape.ts";
import {
  actorLook, actorSelector, actorTypeRef, audioRef, expr, goodsLines, playerFilter, soldierLines, uiTarget
} from "../shape-nodes.ts";
import type { ActorLook, ActorSelector, ActorTypeRef } from "../types/actors.ts";
import type { ScriptGoodsLine, ScriptSoldierLine } from "../types/rewards.ts";
import type { PlayerFilter, ScriptRef } from "../types/refs.ts";
import type { UiTarget } from "../types/ui.ts";
import type { Expr, ValueType } from "../types/values.ts";
import { checkActorTypeSlot, checkSelector, type SelectorRole } from "./content.ts";
import type { ValidationRun } from "./context.ts";
import { expectType, exprType, refKindValueType } from "./expr.ts";
import type { ExprScope, SlotMode } from "./scope.ts";

/**
 * Catalogue slot values (trigger design §3.3): every event slot, action, predicate and function argument is checked
 * against its slot type with the node shape checks, then typed and resolved against the catalog.
 */

export interface SlotCheckOptions {
  mode: SlotMode;
  /** The subject slot of an event (its owner is the event player filter). */
  subject: string | null;
  /** The event capability the subject's entries must declare (the event catalogue's `capability`). */
  subjectCapability?: string | null;
}

type SlotValue = unknown;
type Values = Readonly<Record<string, SlotValue>>;

const isExpr = (value: SlotValue): value is Expr => isPlainObject(value) && typeof value.k === "string";

const REFERENCE_SLOTS: readonly SlotType["kind"][] = ["actor", "actorType", "content", "ref", "regionOrEdge"];

const checkBareString = (run: ValidationRun, type: SlotType, value: string, path: string) => {
  if (type.kind === "regionOrEdge" && value === MAP_EDGE) return;
  if (REFERENCE_SLOTS.includes(type.kind)) run.sink.add("error", "bareStringReference", path, { expected: type.kind });
  else run.sink.add("error", "slotTypeMismatch", path, { actual: "string", expected: type.kind });
};

const checkRefSlot = (run: ValidationRun, kind: ScriptRef["kind"], value: SlotValue, scope: ExprScope,
  path: string) => {
  if (isScriptRef(value)) {
    if (value.kind !== kind) run.sink.add("error", "slotTypeMismatch", path, { actual: value.kind, expected: kind });
    return;
  }
  const valueType = refKindValueType(kind);
  if (valueType && isExpr(value) && checkNodeShape(expr, value, path, run.sink))
    expectType(run, value, valueType, scope, path);
  else run.sink.add("error", "slotTypeMismatch", path, { actual: "value", expected: kind });
};

const checkContentSlot = (run: ValidationRun, kinds: readonly ContentKind[], value: SlotValue, path: string) => {
  if (!isScriptRef(value) || value.kind !== "content") {
    run.sink.add("error", "slotTypeMismatch", path, { actual: "value", expected: "content" });
    return;
  }
  const entry = run.catalog.entry(value.id);
  if (entry && !kinds.includes(entry.kind))
    run.sink.add("error", "contentKindNotAllowed", path, { id: value.id, kinds: kinds.join(", ") });
};

const checkChoice = (run: ValidationRun, values: readonly string[], value: SlotValue, path: string) => {
  const literal = isExpr(value) && value.k === "lit" ? value.value : undefined;
  if (typeof literal !== "string" || !values.includes(literal))
    run.sink.add("error", "slotTypeMismatch", path, { actual: String(literal ?? "value"), expected: values.join("|") });
};

const checkPlayerSlot = (run: ValidationRun, value: SlotValue, scope: ExprScope, path: string) => {
  if (isExpr(value)) {
    if (checkNodeShape(expr, value, path, run.sink)) expectType(run, value, "player", scope, path);
    return;
  }
  if (!checkNodeShape(playerFilter, value, path, run.sink)) return;
  if ((value as PlayerFilter).kind === "response" && !scope.responses.has("triggeringPlayer"))
    run.sink.add("error", "unknownResponse", `${path}.key`, { key: "triggeringPlayer" });
};

const checkLook = (run: ValidationRun, value: SlotValue, path: string) => {
  if (!checkNodeShape(actorLook, value, path, run.sink)) return;
  const look = value as ActorLook;
  if (look.kind === "nation" && !run.catalog.entry(`nation:${look.nation}`))
    run.sink.add("error", "unknownContent", `${path}.nation`, { id: `nation:${look.nation}` });
};

/** An uploaded asset must exist with the slot's kind (only when the caller knows the map's assets). */
const checkAudioUpload = (run: ValidationRun, kind: AudioKind, assetId: string, path: string) => {
  const assets = run.context.audioAssets;
  if (!assets) return;
  const actual = assets.get(assetId);
  if (!actual) run.sink.add("error", "unknownAudioAsset", `${path}.assetId`, { id: assetId });
  else if (actual !== kind)
    run.sink.add("error", "audioKindMismatch", `${path}.assetId`, { actual, expected: kind, id: assetId });
};

/** A catalog audio entry must exist, be active and be of the slot's kind (a sound is not music). */
const checkAudioSlot = (run: ValidationRun, kind: AudioKind, value: SlotValue, path: string) => {
  if (!checkNodeShape(audioRef, value, path, run.sink)) return;
  const ref = value as AudioRef;
  if (ref.kind === "upload") return checkAudioUpload(run, kind, ref.assetId, path);
  const entry = run.catalog.entry(ref.id);
  if (!entry) run.sink.add("error", "unknownContent", `${path}.id`, { id: ref.id });
  else if (entry.kind !== kind)
    run.sink.add("error", "audioKindMismatch", `${path}.id`, { actual: entry.kind, expected: kind, id: ref.id });
  else if (entry.retired) run.sink.add("error", "retiredAudio", `${path}.id`, { id: ref.id });
};

const checkUiTarget = (run: ValidationRun, value: SlotValue, scope: ExprScope, path: string) => {
  if (!checkNodeShape(uiTarget, value, path, run.sink)) return;
  const target = value as UiTarget;
  if (!isUiTargetAllowed(run.context.mapKind, target.kind))
    run.sink.add("error", "notOnMapKind", `${path}.kind`, { kind: target.kind, mapKind: run.context.mapKind });
  if (target.kind === "building")
    checkSelector(run, target.actor, { kind: "actor", kinds: ["building"], requires: null }, scope,
      `${path}.actor`, "other", "query");
};

const checkGoods = (run: ValidationRun, value: SlotValue, path: string) => {
  if (!checkNodeShape(goodsLines, value, path, run.sink)) return;
  (value as ScriptGoodsLine[]).forEach((line, index) => {
    const id = `ware:${line.ware}`;
    if (!run.catalog.entry(id)) run.sink.add("error", "unknownContent", `${path}[${index}].ware`, { id });
  });
};

const checkSoldiers = (run: ValidationRun, value: SlotValue, path: string) => {
  if (!checkNodeShape(soldierLines, value, path, run.sink)) return;
  (value as ScriptSoldierLine[]).forEach((line, index) =>
    checkContentSlot(run, ["soldier"], line.type, `${path}[${index}].type`));
};

const checkRewards = (run: ValidationRun, value: SlotValue, path: string) => {
  const soldierTypes = run.context.soldierTypes ?? CAMPAIGN_SOLDIER_TYPES;
  const options = { buildingTypes: run.context.buildingTypes, soldierTypes };
  for (const issue of validateRewardEntries(value, options, path))
    run.sink.add("error", "invalidReward", issue.path, { detail: issue.message });
};

/** The type a `variableValue` slot expects: the named variable's type, or its element type. */
const variableSlotType = (run: ValidationRun, type: Extract<SlotType, { kind: "variableValue" }>, values: Values) => {
  const ref = values[type.of];
  const variableType = isScriptRef(ref) ? run.index.variables.get(ref.id)?.type : undefined;
  if (!variableType) return undefined;
  const element = ARRAY_ELEMENT_TYPES[variableType];
  const indexed = values.index !== undefined && values.index !== null;
  if (element && (type.element === "always" || indexed)) return element;
  return variableType;
};

/** An expression slot; `expected` undefined = typed only by the run (a variable of unknown type). */
const checkValueSlot = (
  run: ValidationRun, expected: ValueType | undefined, value: SlotValue, scope: ExprScope, path: string
) => {
  if (!isExpr(value)) {
    run.sink.add("error", "slotTypeMismatch", path, { actual: "value", expected: expected ?? "value" });
    return;
  }
  if (!checkNodeShape(expr, value, path, run.sink)) return;
  if (expected) expectType(run, value, expected, scope, path);
  else exprType(run, value, scope, path);
};

interface SlotPosition {
  path: string;
  role: SelectorRole;
  values: Values;
}

const checkTypedSlot = (
  run: ValidationRun, type: SlotType, value: SlotValue, scope: ExprScope, position: SlotPosition, mode: SlotMode
) => {
  const { path, role, values } = position;
  switch (type.kind) {
    case "actor":
      if (checkNodeShape(actorSelector, value, path, run.sink))
        checkSelector(run, value as ActorSelector, type, scope, path, role, mode);
      return;
    case "actorType":
      if (checkNodeShape(actorTypeRef, value, path, run.sink))
        checkActorTypeSlot(run, value as ActorTypeRef, type, path, mode);
      return;
    case "player": return checkPlayerSlot(run, value, scope, path);
    case "ref": return checkRefSlot(run, type.ref, value, scope, path);
    case "content": return checkContentSlot(run, type.kinds, value, path);
    case "choice": return checkChoice(run, type.values, value, path);
    case "regionOrEdge":
      if (isExpr(value) && value.k === "lit" && value.value === MAP_EDGE) return;
      return checkRefSlot(run, "region", value, scope, path);
    case "look": return checkLook(run, value, path);
    case "audio": return checkAudioSlot(run, type.audio, value, path);
    case "uiTarget": return checkUiTarget(run, value, scope, path);
    case "rewards": return checkRewards(run, value, path);
    case "goods": return checkGoods(run, value, path);
    case "soldiers": return checkSoldiers(run, value, path);
    case "value": return checkValueSlot(run, type.type, value, scope, path);
    case "variableValue": return checkValueSlot(run, variableSlotType(run, type, values), value, scope, path);
  }
};

/** Checks named slot values against their definitions: unknown and missing slots, then each typed value. */
export const checkSlots = (
  run: ValidationRun, defs: readonly SlotDef[], values: Values, scope: ExprScope, path: string,
  options: SlotCheckOptions
) => {
  for (const name of Object.keys(values))
    if (!defs.some(def => def.name === name)) run.sink.add("error", "unknownSlot", `${path}.${name}`, { slot: name });
  for (const def of defs) {
    const value = values[def.name];
    const slotPath = `${path}.${def.name}`;
    if (value === undefined || value === null) {
      if (!def.optional) run.sink.add("error", "missingSlot", slotPath, { slot: def.name });
      continue;
    }
    if (typeof value === "string") {
      checkBareString(run, def.type, value, slotPath);
      continue;
    }
    const role: SelectorRole = def.name === options.subject ? "subject" : "other";
    const type = role === "subject" && def.type.kind === "actor" && options.subjectCapability
      ? { ...def.type, requires: options.subjectCapability } : def.type;
    checkTypedSlot(run, type, value, scope, { path: slotPath, role, values }, options.mode);
  }
};
