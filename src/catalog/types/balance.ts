/**
 * Balance data (`data/balance.json`, catalog README "Balance"): owner-tunable economy numbers and tables that the
 * client, the verifier bundle and the API read. Plain JSON; the formulas live in `catalog/balance/*.ts`.
 */

/** A resource tier: 0 is the home island's softwood/stone, 1..4 the colony materials. */
export type ResourceTier = 0 | 1 | 2 | 3 | 4;
/** Colony and adventure difficulty. */
export type ExpeditionDifficulty = "easy" | "medium" | "hard";
/** Road surfaces by speed: dirt and the stone of each resource tier. */
export type RoadTier = "dirt" | "stone" | "marble" | "limestone" | "basalt" | "granite";

/** One construction material tier: its wood, logs, planks and stone wares and the level that unlocks them. */
export interface MaterialTierBalance {
  logs: string;
  minimumLevel: number;
  planks: string;
  stone: string;
  tier: ResourceTier;
  wood: string;
}

export interface LevelBalance {
  /** Experience per level step up to level 60 (index = level - 1). */
  baseSteps: readonly number[];
  gemRewardLevel: number;
  lastLevel: number;
  lateGrowthFrom: number;
  lateStepGrowth: number;
}

export interface QuestBalance {
  bigLevel: number;
  dailyCount: number;
  /** Wares a disaster-relief donation never asks for (besides `excludedWares`). */
  excludedDonations: readonly string[];
  /** Wares no daily quest asks for. */
  excludedWares: readonly string[];
  experienceShare: number;
  mediumLevel: number;
  minimumExperience: number;
  rewardCoinsBase: number;
  rewardCoinsPerLevel: number;
  rewardMaterialBase: number;
  rewardMaterialLevels: number;
  /** Quest wares of the stone and mining chains: they pay stone, every other quest pays planks. */
  stoneMaterialWares: readonly string[];
  toolBatch: number;
  /** The finite supply task of each tutorial chapter (index = chapter - 1). */
  tutorialReserveWares: readonly string[];
  wareBatch: Readonly<Record<string, number>>;
}

/** Field camps and their sizes; ranks cycle through `ranks` inside every camp. */
export interface AdventureDifficultyRule {
  camps: readonly number[];
  ranks: readonly number[];
}

export interface AdventureBalance {
  coinsPerPoint: number;
  colonyConquestExperienceShare: number;
  difficulties: Readonly<Record<ExpeditionDifficulty, AdventureDifficultyRule>>;
  limit: number;
  offers: number;
  pointsPerLevel: readonly (readonly [level: number, points: number])[];
  rankWeights: readonly number[];
  waresPerPoint: Readonly<Record<string, number>>;
}

export type TalentBranch = "economy" | "logistics" | "military";

/** Every number a talent can change; fractions are shares (0.02 = 2%), counts are whole units. */
export interface TalentModifiers {
  /** Production buildings' work speed (added to the workshop upgrade's +10%). */
  productionSpeed: number;
  /** Work speed of the hunter and the fishery (added to `productionSpeed`). */
  hunterFisherSpeed: number;
  /** Production speed added on a colony island only (Economy capstone). */
  colonyProductionSpeed: number;
  storageCapacity: number;
  treeGrowthSpeed: number;
  constructionSpeed: number;
  fieldGrowthSpeed: number;
  /** Daily quest experience and goods. */
  questRewards: number;
  /** Share taken off trade, supply and colony ship voyages. */
  shippingTimeReduction: number;
  dockPorterSpeed: number;
  populationLimit: number;
  settlerGrowthSpeed: number;
  handcartCapacity: number;
  /** Share taken off the colony resource ship interval. */
  colonyShipIntervalReduction: number;
  /** Extra settlers landing with a new colony. */
  colonyStartSettlers: number;
  /** Extra active trade office offers. */
  tradeOfferSlots: number;
  recruitTrainingSpeed: number;
  doorStrength: number;
  adventureExperience: number;
  adventureLoot: number;
  towerArcherDamage: number;
  siegeDamage: number;
  /** Share taken off voyages to and from adventures. */
  adventureSailingReduction: number;
  soldierHealth: number;
  soldierDamage: number;
  /** Walking speed of carriers (also pulling a hand cart). */
  carrierSpeed: number;
}
export type TalentModifier = keyof TalentModifiers;

export interface TalentEffect {
  modifier: TalentModifier;
  perRank: number;
}
/** Who or what a talent changes, beyond buildings (the tooltip's "Affects" line). */
export type TalentGroup = "adventures" | "adventureShips" | "builders" | "carriers" | "colonies" | "colonyShips"
  | "dailyQuests" | "dockPorters" | "handcarts" | "productionBuildings" | "ships" | "soldiers" | "towerArchers"
  | "tradeOffice" | "trees";
/** A building type id, or a group of units or systems. */
export type TalentSubject = number | TalentGroup;

export interface TalentDefinition {
  id: string;
  branch: TalentBranch;
  /** 1 (top) .. 4 (bottom); tier 4 holds the branch capstone. */
  tier: number;
  /** Player level needed for the first rank; tier 1 has none (level 1). */
  requiredLevel: number;
  capstone?: true;
  effects: readonly TalentEffect[];
  /** What the talent changes, in tooltip order. */
  affects: readonly TalentSubject[];
}

export interface TalentBalance {
  branches: readonly TalentBranch[];
  capstoneBranchPoints: number;
  colonySettlerCap: number;
  list: readonly TalentDefinition[];
  maxRank: number;
  pointsPerLevel: number;
  resetGems: number;
  tierGatePoints: number;
}

export interface MinMax {
  max: number;
  min: number;
}

export interface TradeBalance {
  fairnessThresholds: Readonly<{ fair: number; generous: number; never: number }>;
  historyLimit: number;
  marketDaySeconds: number;
  maxActiveOffers: number;
  maxLotAmount: number;
  merchantAskBand: Readonly<MinMax>;
  merchantLotValue: Readonly<MinMax>;
  merchantOfferCount: number;
  npcBidFactor: number;
  npcBuyerDelaySeconds: Readonly<{ fair: Readonly<MinMax>; generous: Readonly<MinMax>; greedyMax: number }>;
  offerLifetimeHours: number;
  protectedFloors: Readonly<Record<string, number>>;
  shipsPerHarbour: number;
  shipVoyageSeconds: number;
  /** Integer value units per ware (100 = 1 gem); the key order feeds the seeded merchant market. */
  wareValues: Readonly<Record<string, number>>;
}

export interface MarketBalance {
  maxOpenOffers: number;
  offerTtlSeconds: readonly number[];
  /** Wares the player Market screen offers, in its stable order (the order signs idempotent claims). */
  wares: readonly string[];
}

export interface EconomyBalance {
  /** Extra starter goods of a nation (Indigenous imported sailcloth). */
  nationStarterStock: Readonly<Record<string, Readonly<Record<string, number>>>>;
  roadSpeed: Readonly<Record<RoadTier, number>>;
  starterStock: Readonly<Record<string, number>>;
}

export interface BalanceData {
  adventures: AdventureBalance;
  colonies: Readonly<{ lifetimeDays: number }>;
  economy: EconomyBalance;
  levels: LevelBalance;
  market: MarketBalance;
  materials: Readonly<{ tiers: readonly MaterialTierBalance[] }>;
  monument: Readonly<{ defenderRank: number; experienceBonusPercent: number; startDefenders: number }>;
  quests: QuestBalance;
  talents: TalentBalance;
  trade: TradeBalance;
}
