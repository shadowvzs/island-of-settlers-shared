import { isPlainObject, isPositiveCount, isSafeCount } from "../../validation/index.ts";
import { REWARD_ENTRY_FIELDS, REWARD_MAX_AMOUNT, REWARD_MAX_SOLDIER_RANK } from "../constants.ts";
import { entriesOfKind, entryByKey } from "../loader.ts";
import type { ContentKind } from "../types/refs.ts";
import type { RewardEntryKind } from "../types/reward.ts";
import type { CatalogIssue, Fields } from "./issues.ts";

/** Game knowledge a reward check may receive; omitted fields fall back to the catalog where it holds the kind. */
export interface RewardCheckOptions {
  /** Known building types for `buildingUnlock`; omitted: any non-negative integer (building core is CAT7a). */
  buildingTypes?: ReadonlySet<number>;
  maxAmount?: number;
  maxSoldierRank?: number;
  /** Troop keys; omitted: the catalog's `soldier` entries (CAT5). */
  soldierTypes?: readonly string[];
}

type Push = (path: string, message: string) => void;

const DECORATION_ITEM_PATTERN = /^roadDecoration:([^:]+):([^:]+)$/;

const isKnownWare = (key: unknown) => {
  const entry = typeof key === "string" ? entryByKey("ware", key) : undefined;
  return entry !== undefined && entry.retired !== true;
};

/** `roadDecoration:<key>:<finish>` of an existing decoration and one of its finishes. */
const isKnownDecorationItem = (item: unknown) => {
  const match = typeof item === "string" ? DECORATION_ITEM_PATTERN.exec(item) : null;
  if (!match) return false;
  const entry = entryByKey("decoration", match[1]!);
  return entry !== undefined && entry.retired !== true && entry.variants.finish.includes(match[2] as never);
};

const checkAmount = (entry: Fields, path: string, push: Push, maxAmount: number) => {
  if (!isPositiveCount(entry.amount) || (entry.amount as number) > maxAmount)
    push(`${path}.amount`, `The amount must be a whole number in 1..${maxAmount}`);
};

const checkSoldier = (entry: Fields, path: string, push: Push, options: RewardCheckOptions) => {
  const soldierTypes = options.soldierTypes ?? entriesOfKind<ContentKind>("soldier").map(soldier => soldier.key);
  if (!soldierTypes.includes(entry.soldierType as string))
    push(`${path}.soldierType`, `Unknown soldier type ${String(entry.soldierType)}`);
  const maxRank = options.maxSoldierRank ?? REWARD_MAX_SOLDIER_RANK;
  if (entry.rank !== undefined && (!isSafeCount(entry.rank) || (entry.rank as number) > maxRank))
    push(`${path}.rank`, `The rank must be 0..${maxRank}`);
};

const checkBuildingUnlock = (entry: Fields, path: string, push: Push, options: RewardCheckOptions) => {
  const known = options.buildingTypes;
  if (!isSafeCount(entry.buildingType) || (known && !known.has(entry.buildingType as number)))
    push(`${path}.buildingType`, `Unknown building type ${String(entry.buildingType)}`);
};

const checkPayload = (kind: RewardEntryKind, entry: Fields, path: string, push: Push, options: RewardCheckOptions) => {
  if (kind === "ware" && !isKnownWare(entry.ware)) push(`${path}.ware`, `Unknown ware ${String(entry.ware)}`);
  if (kind === "decoration" && !isKnownDecorationItem(entry.item))
    push(`${path}.item`, `Unknown decoration item ${String(entry.item)}`);
  if (kind === "soldier") checkSoldier(entry, path, push, options);
  if (kind === "buildingUnlock") checkBuildingUnlock(entry, path, push, options);
  else checkAmount(entry, path, push, options.maxAmount ?? REWARD_MAX_AMOUNT);
};

const checkEntry = (entry: unknown, path: string, push: Push, options: RewardCheckOptions) => {
  const kind = isPlainObject(entry) ? entry.kind as RewardEntryKind : undefined;
  const fields = kind === undefined ? undefined : REWARD_ENTRY_FIELDS[kind];
  if (!isPlainObject(entry) || !fields) {
    push(path, "A reward entry is { kind, … } of a known kind");
    return;
  }
  for (const field of Object.keys(entry))
    if (field !== "kind" && !fields.includes(field)) push(`${path}.${field}`, "Unknown field");
  checkPayload(kind!, entry, path, push, options);
};

/**
 * Catalog validation of reward lines (RewardPicker entries): known kinds and fields, positive whole amounts,
 * real wares, decoration items of real finishes, troop keys with a rank in range, known building unlocks. Used by
 * the script validator for declared home rewards and by the server when it recomputes a claim.
 */
export const validateRewardEntries = (
  entries: unknown, options: RewardCheckOptions = {}, path = "rewards"
): CatalogIssue[] => {
  const issues: CatalogIssue[] = [];
  const push: Push = (issuePath, message) => { issues.push({ code: "reward", message, path: issuePath }); };
  if (!Array.isArray(entries)) push(path, "Rewards are an array of entries");
  else entries.forEach((entry, index) => checkEntry(entry, `${path}[${index}]`, push, options));
  return issues;
};
