import { BALANCE } from "./data.ts";

/**
 * Trade office numbers (TRADE-01, docs/plans/trade-office-plan-2026-10-19.md). Values are integer value units:
 * 100 units = 1 gem. Wares the gem shop sells keep exactly their shop unit price (tiered materials double per
 * resource tier like the shop), so the market can never beat the shop. Other wares are priced from their inputs
 * plus the labour of their production cycle (roughly one unit per one or two work seconds). Wares missing here
 * (boats, hand carts) cannot be traded; the validator keeps this table equal to `ware.economy.trade`.
 */
const TRADE = BALANCE.trade;

/** Value units per ware; the key order is the market's ware order (it feeds the seeded merchant offers). */
export const TRADE_WARE_VALUES = TRADE.wareValues;
/** Market day: merchant offers refresh every this many game seconds (one game minute per hour). */
export const TRADE_MARKET_DAY_SECONDS = TRADE.marketDaySeconds;
/** Named-merchant offers per island and market day. */
export const TRADE_MERCHANT_OFFER_COUNT = TRADE.merchantOfferCount;
/** Value of what a merchant gives in one offer (value units, 300 = 3 gems). */
export const TRADE_MERCHANT_LOT_VALUE = TRADE.merchantLotValue;
/**
 * Merchants ask this much more value than they give (player pays value × ask). Above 1 so buying from a merchant
 * and selling again never returns more than was paid.
 */
export const TRADE_MERCHANT_ASK_BAND = TRADE.merchantAskBand;
/**
 * NPC buyers price a player's offered wares at this share of their value: the fair value of a player offer. With
 * the 1.5× never-threshold an accepted offer returns at most 0.975 of the value given, so no sell loop (or
 * merchant/shop arbitrage) can create wares.
 */
export const TRADE_NPC_BID_FACTOR = TRADE.npcBidFactor;
/** Fairness = value asked / fair value. Generous below, fair up to 1, greedy up to `never`, refused above. */
export const TRADE_FAIRNESS_THRESHOLDS = TRADE.fairnessThresholds;
/** NPC buyer delay in game seconds by fairness zone; greedy offers grow towards `greedyMax`. */
export const TRADE_NPC_BUYER_DELAY_SECONDS = TRADE.npcBuyerDelaySeconds;
/** Active own offers of the whole account, every island together (owner decision 2026-10-19). */
export const TRADE_MAX_ACTIVE_OFFERS = TRADE.maxActiveOffers;
/** An own offer nobody filled expires this long after placement (real time, game clock); its wares return. */
export const TRADE_OFFER_LIFETIME_MS = TRADE.offerLifetimeHours * 60 * 60 * 1000;
/** History entries kept per island (oldest dropped first). */
export const TRADE_HISTORY_LIMIT = TRADE.historyLimit;
/** Largest amount of one ware in a single own offer. */
export const TRADE_MAX_LOT_AMOUNT = TRADE.maxLotAmount;
/** Default protected floors: stock trading never pays below (adjustable per island). */
export const TRADE_PROTECTED_FLOORS = TRADE.protectedFloors;
/**
 * Trade ship (phase 2): game seconds it sails beyond the map edge before it comes into view, and how many trade
 * ships one harbour has under way at once (the rest of its deliveries wait for a free slot).
 */
export const TRADE_SHIP_VOYAGE_SECONDS = TRADE.shipVoyageSeconds;
export const TRADE_SHIPS_PER_HARBOUR = TRADE.shipsPerHarbour;

/** The player Market screen's wares in their stable order (the order signs idempotent claims). */
export const MARKET_WARES = BALANCE.market.wares;
/** The Market's offers expire after 1, 6 or 12 hours (the API's maximum is 12 hours). */
export const MARKET_OFFER_TTL_SECONDS = BALANCE.market.offerTtlSeconds;
/** One seller's open-order limit enforced by the API (`economy/trades`). */
export const MARKET_MAX_OPEN_OFFERS = BALANCE.market.maxOpenOffers;
