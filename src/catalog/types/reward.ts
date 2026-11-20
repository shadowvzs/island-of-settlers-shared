/**
 * One reward line as the RewardPicker edits it (client `RewardEntry`): goods by bare ware key, decorations by
 * inventory item id, soldiers by troop key with an optional 0-based rank. Validated by `validateRewardEntries`.
 */
export type RewardEntry =
  | { amount: number; kind: "coins" }
  | { amount: number; kind: "gems" }
  | { amount: number; item: string; kind: "decoration" }
  | { amount: number; kind: "settlers" }
  | { amount: number; kind: "soldier"; rank?: number; soldierType: string }
  | { amount: number; kind: "ware"; ware: string }
  | { amount: number; kind: "xp" }
  | { buildingType: number; kind: "buildingUnlock" };

export type RewardEntryKind = RewardEntry["kind"];
