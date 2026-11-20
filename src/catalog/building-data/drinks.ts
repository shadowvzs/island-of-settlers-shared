import { entriesOfKind } from "../loader.ts";
import { settlerJob } from "../units.ts";
import { buildingRules } from "./rules.ts";

/**
 * Each nation's drink chain in building slots 5 (raw producer) and 6 (drink maker), read from their rules sidecars
 * (nation `production` overrides over the Roman base). The drinks are trade and quest wares.
 */
export interface NationDrinkChainData {
  drink: string;
  /** Building 5's worker (its tool is the catalog `settler:*` tool). */
  grower: string;
  maker: string;
  /** The outdoor plantation building 5's worker tends. */
  plantation: string;
  raw: string;
}

const DRINK_RAW_TYPE_ID = 5;
const DRINK_MAKER_TYPE_ID = 6;

/** The production block a nation's variant of a building type follows (its override over the Roman base). */
const nationProduction = (typeId: number, nation: string) => {
  const rules = buildingRules(typeId)!;
  return { ...rules.production!, ...rules.nations?.[nation]?.production };
};

const drinkChain = (nation: string): NationDrinkChainData => {
  const raw = nationProduction(DRINK_RAW_TYPE_ID, nation);
  const maker = nationProduction(DRINK_MAKER_TYPE_ID, nation);
  return { drink: maker.outputs[0]!, grower: settlerJob(raw.job), maker: settlerJob(maker.job),
    plantation: raw.plantation!, raw: raw.outputs[0]! };
};

/** Every nation's chain, keyed by nation key (catalog `nation:*` entries). */
export const NATION_DRINK_CHAINS: Readonly<Record<string, NationDrinkChainData>> = Object.freeze(Object.fromEntries(
  entriesOfKind("nation").map(({ key }) => [key, drinkChain(key)])));

/** The drink chain nations in their historical ware-list order. */
const DRINK_CHAIN_NATIONS: readonly string[] =
  ["japanese", "nubian", "roman", "viking", "chinese", "persian", "maya", "indigenous"];

export const DRINK_WARES: readonly string[] = DRINK_CHAIN_NATIONS.map(nation => NATION_DRINK_CHAINS[nation]!.drink);
export const RAW_DRINK_WARES: readonly string[] = DRINK_CHAIN_NATIONS.map(nation => NATION_DRINK_CHAINS[nation]!.raw);

/** Another nation's raw drink ware or drink: left out of this nation's ware lists. */
export const isForeignDrinkWare = (ware: string, nation = "roman") => {
  const chain = NATION_DRINK_CHAINS[nation] ?? NATION_DRINK_CHAINS.roman!;
  const drinkChainWare = RAW_DRINK_WARES.includes(ware) || DRINK_WARES.includes(ware);
  return drinkChainWare && ware !== chain.raw && ware !== chain.drink;
};

/**
 * Quest pools hold the Roman drink chain; every nation reads it as its own raw ware and drink, so the same day
 * still rolls the same quests on every island.
 */
export const nationQuestWare = (ware: string, nation = "roman") => {
  const chain = NATION_DRINK_CHAINS[nation]!;
  if (RAW_DRINK_WARES.includes(ware)) return chain.raw;
  if (DRINK_WARES.includes(ware)) return chain.drink;
  return ware;
};
