import type { ActorSelector } from "./actors.ts";
import type { MultiboardDefinition, TimerDefinition } from "./multiboards.ts";
import type { QuestText } from "./quest-text.ts";
import type { PlayerFilter, ScriptRef } from "./refs.ts";

/** Values and pure expressions (trigger design §4.4, §4.5). */
export type ScalarType = "boolean" | "number" | "string";
export type ValueType =
  | ScalarType | "number[]" | "string[]"
  | "actor" | "actorGroup" | "region" | "multiboard" | "timer"
  | "player" | "actorType" | "ware" | "quest" | "text";

export type ActorResponseKey =
  | "triggeringActor" | "targetActor" | "killingActor" | "enteringActor" | "carriedWare" | "containerActor"
  | "lastSpawned";

export type EventResponseKey =
  | ActorResponseKey | "triggeringPlayer" | "region" | "ware" | "amount" | "building" | "quest" | "timer"
  | "outcome" | "stage" | "variable" | "oldValue" | "newValue";

/** Multiboard cell context keys (not event responses). */
export type CellContextKey = "rowIndex" | "rowItem" | "rowLabel" | "rowPlayer";

export type MathOperator = "+" | "-" | "*" | "/" | "min" | "max" | "mod";
/** `round` is half away from zero, `trunc` toward zero (design m11). */
export type RoundMode = "floor" | "ceil" | "round" | "trunc";

/** Read-only world functions (catalogue §5.3); each declares its argument and result types. */
export type ScriptFunctionKind =
  | "count" | "countInRegion" | "health" | "healthPercent" | "owner" | "isAlive" | "isHidden" | "typeOf"
  | "stock" | "buildingCount" | "soldierCount" | "questState" | "questClaims" | "elapsedSeconds" | "hour"
  | "random" | "length" | "contains" | "indexOf" | "timerRemaining" | "playerName" | "distance" | "islandName"
  | "cargoCount" | "capacityLeft" | "factionBuildingCount" | "factionSoldierCount" | "factionPosture";

export type FunctionArg = Expr | ActorSelector | PlayerFilter;

/** Pure, side-effect free typed expression; numbers are float64 with exact IEEE operations only. */
export type Expr =
  | { k: "lit"; type: ScalarType; value: boolean | number | string }
  | { items: Expr[]; k: "list"; type: "number[]" | "string[]" }
  | { index?: Expr; k: "var"; variable: ScriptRef<"variable"> }
  | ScriptRef
  | { k: "resp"; key: EventResponseKey }
  | { k: "cell"; key: CellContextKey }
  | { k: "local"; name: string }
  | { a: Expr; b: Expr; k: "math"; op: MathOperator }
  | { k: "round"; mode: RoundMode; of: Expr }
  | { args: Record<string, FunctionArg>; fn: ScriptFunctionKind; k: "fn" }
  | { k: "text"; text: QuestText };

export type ExprKind = Expr["k"];

/** Spaces of run-time handles; reused slots carry a generation (design M2). */
export type ActorHandleSpace = "actor" | "building" | "ship" | "prop" | "animal" | "shell" | "presentation";

/** Resolves to "gone" when the slot's generation differs or the object is absent. */
export interface ActorHandleValue {
  generation: number;
  id: number;
  space: ActorHandleSpace;
}

export type ScriptValue =
  | { type: "boolean"; value: boolean }
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "number[]"; value: number[] }
  | { type: "string[]"; value: string[] }
  | { type: "text"; value: QuestText }
  | { type: "region"; value: ScriptRef<"region"> | null }
  /** Run-time handles; `actor` holds at most one, `actorGroup` at most `maxLength`; authored initial value: []. */
  | { type: "actor" | "actorGroup"; value: ActorHandleValue[] }
  | { type: "multiboard"; value: MultiboardDefinition }
  | { type: "timer"; value: TimerDefinition };
