import { hasPlainPrototype, isForbiddenKey } from "./guards.ts";

/**
 * The one save nesting limit agreed by client and server: levels below the game save document root
 * (`{ format: "island-settlers-game", … }`). Real saves nest about 13 levels deep (bug replay fixture,
 * 2026-11-11), so 40 keeps a wide margin while bounding recursion. A sub-document checks
 * `MAX_SAVE_DEPTH` minus its own depth inside the game save; the server's upload wrapper
 * (`{ schemaVersion, metadata, data }`) adds one level (`SAVE_UPLOAD_DEPTH`).
 */
export const MAX_SAVE_DEPTH = 40;
export const SAVE_UPLOAD_DEPTH = MAX_SAVE_DEPTH + 1;

/** Why a value tree is refused. */
export type TreeIssueCode = "depth" | "forbiddenKey" | "nodes" | "notData" | "sharedReference";

export interface TreeLimits {
  /** Deepest allowed level; the root is level 0. */
  maxDepth: number;
  /** Most values (every primitive, array and object counts once). */
  maxNodes?: number;
  /** Only plain objects (`hasPlainPrototype`): JSON input. In-memory trees may hold other objects. */
  plainObjectsOnly?: boolean;
  /** Refuse an object or array reached twice (cycles included). */
  uniqueReferences?: boolean;
}

interface TreeWalk extends TreeLimits {
  nodes: number;
  seen: WeakSet<object> | null;
}

const primitiveIssue = (value: unknown): TreeIssueCode | null => {
  if (typeof value === "number") return Number.isFinite(value) ? null : "notData";
  if (value === null || value === undefined || typeof value === "string" || typeof value === "boolean") return null;
  return typeof value === "object" ? null : "notData";
};

const objectIssue = (value: object, walk: TreeWalk): TreeIssueCode | null => {
  if (walk.seen?.has(value)) return "sharedReference";
  walk.seen?.add(value);
  if (Array.isArray(value)) return null;
  return walk.plainObjectsOnly && !hasPlainPrototype(value) ? "notData" : null;
};

const visit = (value: unknown, depth: number, walk: TreeWalk): TreeIssueCode | null => {
  if (++walk.nodes > (walk.maxNodes ?? Infinity)) return "nodes";
  if (depth > walk.maxDepth) return "depth";
  const primitive = primitiveIssue(value);
  if (primitive || value === null || typeof value !== "object") return primitive;
  const own = objectIssue(value, walk);
  if (own) return own;
  if (Array.isArray(value)) {
    for (const child of value) {
      const issue = visit(child, depth + 1, walk);
      if (issue) return issue;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (isForbiddenKey(key)) return "forbiddenKey";
    const issue = visit(record[key], depth + 1, walk);
    if (issue) return issue;
  }
  return null;
};

/**
 * The first reason a value tree is not safe data, or null: finite numbers, strings, booleans, null, undefined
 * (dropped by JSON), arrays and objects without prototype keys, within the depth/node limits.
 */
export const treeIssue = (value: unknown, limits: TreeLimits): TreeIssueCode | null =>
  visit(value, 0, { ...limits, nodes: 0, seen: limits.uniqueReferences ? new WeakSet() : null });

export const isSafeTree = (value: unknown, maxDepth: number) => treeIssue(value, { maxDepth }) === null;
