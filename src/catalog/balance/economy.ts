import type { RoadTier } from "../types/balance.ts";
import { BALANCE } from "./data.ts";

type Goods = Readonly<Record<string, number>>;

/** Goods every new home island starts with in its headquarters. */
export const STARTER_STOCK: Goods = BALANCE.economy.starterStock;

/** The starter goods of a nation: imported sailcloth lets the tent-building nation grow before local textiles. */
export const starterStockForNation = (nation?: string): Record<string, number> => ({
  ...STARTER_STOCK, ...(nation === undefined ? {} : BALANCE.economy.nationStarterStock[nation])
});

/** Walking speed multiplier per road tier. */
export const ROAD_SPEED: Readonly<Record<RoadTier, number>> = BALANCE.economy.roadSpeed;
