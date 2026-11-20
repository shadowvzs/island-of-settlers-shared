import type { IslandKey } from "./island-key.ts";
import { isRoadDecorationItemId, type RoadDecorationItemId } from "./road-decoration-items.ts";
import { isObject, isUuid } from "./validation.ts";

/** Custody orders name the shared island key; their own pattern below is stricter (no leading zero). */
export type RoadDecorationIslandKey = IslandKey;
interface Point { x: number; z: number }
export interface RoadDecorationPlaceOrder {
  item: RoadDecorationItemId;
  position: Point;
  yaw: number;
}
export type RoadDecorationAction = { kind: "place"; order: RoadDecorationPlaceOrder } |
  { kind: "rotate"; uid: number } | { kind: "move"; uid: number; position: Point; yaw: number } |
  { kind: "pick-up"; uid: number } | { kind: "claim-returns"; ids: readonly number[] };
export interface RoadDecorationCustodyRequest {
  idempotencyKey: string;
  slotId: string;
  revision: number;
  islandKey: RoadDecorationIslandKey;
  action: RoadDecorationAction;
}
export interface RoadDecorationCustodyReceipt {
  slotId: string;
  islandKey: RoadDecorationIslandKey;
  revision: number;
  /** Null if a newer committed slot revision must be reloaded, never roll it back. */
  settlement: unknown;
  result: { uid?: number; returned: number };
  wallet: { gems: number; items: Readonly<Record<string, number | undefined>> };
}
export type RoadDecorationGameResult = { ok: false; reason: string } | {
  ok: true;
  game: unknown;
  placed?: { uid: number; item: RoadDecorationItemId };
  updated?: { uid: number; item: RoadDecorationItemId };
  returned: readonly { id: number; source: number; item: RoadDecorationItemId; reason: string }[];
};
const finitePoint = (value: unknown): value is Point => isObject(value) &&
  Object.keys(value).every(key => key === "x" || key === "z") &&
  typeof value.x === "number" && typeof value.z === "number" &&
  Number.isFinite(value.x) && Number.isFinite(value.z) && value.x >= 0 && value.z >= 0 && value.x <= 16384 && value.z <= 16384;
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

export const isRoadDecorationAction = (value: unknown): value is RoadDecorationAction => {
  if (!isObject(value)) return false;
  if (value.kind === "pick-up" || value.kind === "rotate")
    return Object.keys(value).every(key => ["kind", "uid"].includes(key)) && positive(value.uid);
  if (value.kind === "move") return Object.keys(value).every(key => ["kind", "uid", "position", "yaw"].includes(key)) &&
    positive(value.uid) && finitePoint(value.position) && typeof value.yaw === "number" &&
    Number.isFinite(value.yaw) && Math.abs(value.yaw) <= Math.PI * 2;
  if (value.kind === "claim-returns") return Object.keys(value).every(key => ["kind", "ids"].includes(key)) &&
    Array.isArray(value.ids) && value.ids.length <= 256 && value.ids.every(positive) && new Set(value.ids).size === value.ids.length;
  if (value.kind !== "place" || Object.keys(value).some(key => !["kind", "order"].includes(key)) || !isObject(value.order)) return false;
  const order = value.order;
  return Object.keys(order).every(key => ["item", "position", "yaw"].includes(key)) &&
    isRoadDecorationItemId(order.item) && finitePoint(order.position) && typeof order.yaw === "number" &&
    Number.isFinite(order.yaw) && Math.abs(order.yaw) <= Math.PI * 2;
};
export const isRoadDecorationCustodyRequest = (value: unknown): value is RoadDecorationCustodyRequest =>
  isObject(value) && Object.keys(value).every(key => ["idempotencyKey", "slotId", "revision", "islandKey", "action"].includes(key)) &&
  typeof value.idempotencyKey === "string" && value.idempotencyKey.length > 0 && value.idempotencyKey.length <= 128 &&
  isUuid(value.slotId) && positive(value.revision) && value.revision < 2147483647 &&
  typeof value.islandKey === "string" && /^(home|(?:colony|adventure)-[1-9]\d{0,9})$/.test(value.islandKey) &&
  isRoadDecorationAction(value.action);
