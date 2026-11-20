import balance from "../data/balance.json" with { type: "json" };
import { deepFreeze } from "../helpers.ts";
import type { BalanceData } from "../types/balance.ts";

/**
 * The balance tables (`data/balance.json`), frozen once. Simulation and economy data: loaded synchronously with the
 * consumer's chunk through `@shared/catalog/balance`, never with the core catalog; validated by `validateBalance`.
 */
export const BALANCE = deepFreeze(balance) as unknown as BalanceData;
