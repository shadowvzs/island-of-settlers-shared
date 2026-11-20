import type { CommandArgsShape } from "./command-args.ts";
import type { CommandRateClass, CommandSizeClass } from "./command-limits.ts";

/**
 * The one list of recorded settlement commands (unification survey §1, UNIFY-B1). Every entry is a
 * `SettlementSimulation` method that the client records (bug replay, command log), replays (bug replay,
 * verifier, archived relief) and the API stores. Client recorder/replay lists, the development-command
 * refusal, the API ledger set and the per-command limits all derive from it. Entries are plain JSON data;
 * the order is the historical recording order. How to add a command: `README.md` beside this file.
 */
export interface CommandSpec {
  /**
   * `player`: accepted in every upload and by the production verifier. `development`: Development tools and
   * tests; an upload containing one needs the signed `admin` role and the production verifier refuses it.
   */
  readonly access: "development" | "player";
  /** Argument shape (command-args.ts); `any` only requires an array. */
  readonly args: CommandArgsShape;
  /** Moves value into or out of the island (ledger event): the server always verifies its interval. */
  readonly ledger: boolean;
  /** Changes terrain, props or plots: the bug-replay scene journal observes the world after it. */
  readonly mutatesWorld: boolean;
  /** A debug roll the recorder fills into argument `arg` before recording, so a replay repeats it. */
  readonly randomChoice?: { readonly arg: number; readonly kind: "enemy" | "troop" };
  readonly rateClass: CommandRateClass;
  readonly sizeClass: CommandSizeClass;
}

type CommandFlags = Partial<Omit<CommandSpec, "access">>;

const DEFAULT_SPEC: Omit<CommandSpec, "access"> = {
  args: "any", ledger: false, mutatesWorld: false, rateClass: "standard", sizeClass: "standard"
};

const player = (flags: CommandFlags = {}): CommandSpec => ({ ...DEFAULT_SPEC, access: "player", ...flags });

const development = (flags: CommandFlags = {}): CommandSpec =>
  ({ ...DEFAULT_SPEC, access: "development", ...flags });

export const COMMAND_MANIFEST = {
  placeBuilding: player({ mutatesWorld: true }),
  demolishBuilding: player({ mutatesWorld: true }),
  connectRoads: player({ mutatesWorld: true }),
  previewRoadVerge: player(),
  plantRoadVerge: player({ mutatesWorld: true }),
  cancelRoadVerge: player({ mutatesWorld: true }),
  roadVergeSites: player(),
  buildBridge: player({ mutatesWorld: true }),
  cancelBridgeConstruction: player({ mutatesWorld: true }),
  removeBridge: player({ mutatesWorld: true }),
  requestBridgeUpgrade: player({ mutatesWorld: true }),
  cancelBridgeUpgrade: player({ mutatesWorld: true }),
  removeRoad: player({ mutatesWorld: true }),
  upgradeRoad: player({ mutatesWorld: true }),
  transferWare: player(),
  dispatchSurveyJob: player(),
  setProductionOrder: player(),
  setProductionMode: player(),
  requestWorkshopUpgrade: player(),
  cancelWorkshopUpgrade: player(),
  setProductionPaused: player(),
  setStorageAcceptance: player(),
  setStorageExport: player(),
  setStorageCollect: player(),
  setSawmillMode: player(),
  setFisherMode: player(),
  setCatapultAmmo: player(),
  setShipyardMode: player(),
  setMilitaryTarget: player(),
  setMilitaryComposition: player(),
  setMilitaryCoins: player(),
  setMilitaryTrainingFocus: player(),
  commandMilitary: player(),
  deployCommander: player(),
  beginCommanderControl: player(),
  endCommanderControl: player(),
  assignCommanderEscort: player(),
  detachCommanderEscort: player(),
  setCommanderFollow: player(),
  placeRoadDecoration: development(),
  pickUpRoadDecoration: development(),
  rotateRoadDecoration: development({ args: "roadDecorationRotate" }),
  moveRoadDecoration: development({ args: "roadDecorationMove" }),
  claimRoadDecorationReturns: development(),
  collectShoreShell: player(),
  callOutMilitary: player(),
  plantMilitaryRally: player(),
  cancelMilitaryRally: player(),
  startMilitaryTrainingEncounter: player(),
  startMilitaryTestSkirmish: development(),
  setPlayerNation: player({ mutatesWorld: true }),
  debugSetPlayerNation: development({ mutatesWorld: true }),
  setTalentRanks: player(),
  debugRaiseBuildingStep: development({ mutatesWorld: true }),
  debugFillOutputs: development(),
  debugUpgradeRoads: development({ args: "roadDebugUpgrade" }),
  debugPlantRoadVerges: development({ mutatesWorld: true }),
  debugRaiseBuildingLevel: development(),
  grantCoins: development(),
  grantHandcarts: development(),
  grantDebugTroop: development({ randomChoice: { arg: 0, kind: "troop" } }),
  spawnDebugSoldier: development({ randomChoice: { arg: 1, kind: "troop" } }),
  spawnDebugShip: development(),
  select: player(),
  selectMilitary: player(),
  spawnDebugEnemy: development({ randomChoice: { arg: 1, kind: "enemy" } }),
  deliverHome: player({ ledger: true }),
  receiveHomeGoods: player({ ledger: true }),
  takeStoredGoods: player({ ledger: true }),
  requestReliefCollection: player({ ledger: true }),
  pruneReliefCollections: player(),
  receiveTroops: player({ ledger: true }),
  receiveColonyEvacuation: player({ ledger: true }),
  releaseColony: player(),
  requestTroopPickup: player(),
  sendVisitorShip: player({ ledger: true }),
  tradeBuy: player({ ledger: true }),
  tradePlaceOffer: player({ ledger: true }),
  tradeCancelOffer: player({ ledger: true }),
  tradeSetProtectedFloor: player(),
  tradeSetNpcTraders: development(),
  fetchFromColony: player({ ledger: true }),
  startColony: player({ ledger: true }),
  startAdventure: player(),
  startDebugExpedition: development({ mutatesWorld: true }),
  garrisonMilitary: player(),
  siegeMilitary: player(),
  orderTavernRecruits: player(),
  setFarmArea: player(),
  setStoneArea: player(),
  queueSeaTransport: player(),
  queueSeaPassengers: player(),
  queueSeaExpedition: player(),
  queueSeaExploration: player(),
  cancelSeaTransport: player(),
  sinkShip: player(),
  startColonyExpedition: player(),
  startAdventureExpedition: player(),
  cancelColonyExpedition: player(),
  returnMilitaryHome: player(),
  /** Legacy no-op boundary: equipment is fixed at recruitment, recorded so stale logs stay deterministic. */
  equipMilitary: player(),
  recruitStoredMilitary: player(),
  recoverCommanderWithItem: development(),
  recruitCommander: player(),
  returnCommander: player(),
  levelUpCommander: development(),
  spawnMilitaryOpponent: development(),
  commandMilitaryOpponent: development(),
  registerMilitaryGarrison: development(),
  registerMilitaryDoor: development(),
  enableEventCourtyard: development(),
  placeMilitaryScenarioBuilding: development({ mutatesWorld: true }),
  removeMilitaryScenarioBuilding: development(),
  debugRaiseBuilding: development({ mutatesWorld: true }),
  setMilitaryAiMode: development(),
  /** TRG6: one recorded claim per quest claim (cost taken, reward goods stored); see quest-claim-command.ts. */
  claimQuest: player({ args: "questClaim", ledger: true }),
  /** Map script: the player clicked the highlighted UI element a run waits on (TRG9; replayed, not provable). */
  scriptUiAck: player({ args: "scriptUiAck" }),
  /** TRG7: the server ledger confirmed a declared home reward; the pending claim leaves the queue, goods go home. */
  confirmHomeClaim: player({ args: "homeClaimConfirm", ledger: true }),
  /** C8: the campaign cargo (goods, soldiers, settlers) leaves the home island for a campaign map. */
  departCampaign: player({ ledger: true }),
  /** C9b: returning campaign settlers enter the home island (within the people limit), like receiveTroops. */
  receiveSettlers: player({ ledger: true }),
  /** CIN4: a cinematic sequence's next world step (spawn, walk, face; hour/weather on world-environment maps). */
  applyCinematicStep: player({ args: "cinematicStep" }),
  /** CIN4: the playing sequence ended (watched, skipped, or a reload): remaining world steps apply in order. */
  endCinematic: player({ args: "cinematicEnd" }),
  /**
   * GS2: the island adopts the session's game rules (one complete `SimRules` document, rev G15) at its first live
   * tick. The server verifier replays it with its own copy of that revision and refuses an unknown one.
   */
  adoptGameRules: player({ args: "gameRulesAdopt", ledger: true }),
  /** MIL-SHIPS-SIM: the chosen soldiers board an own ship (a colony calls its troop ship, like the recall). */
  embarkMilitary: player(),
  /** MIL-SHIPS-SIM: a ship carrying or boarding soldiers sails to a harbour or a coast of this map. */
  sailShip: player(),
  /** MIL-SHIPS-SIM: the ship sails there if needed and lands its soldiers (harbour pier or coast gangway). */
  landShipTroops: player(),
  /** BD1: computer soldiers besiege a building, as a raid's automatic choice does (tests, map tools). */
  siegeMilitaryOpponent: development(),
  /** BD2: a building's walls fall at once, leaving its ruin (tests, map tools). */
  destroyBuilding: development(),
  /** EAI2d: a building's walls lose hit points at once, as if beaten (tests, map tools). */
  damageBuilding: development(),
  /** EAI1d: a building of a computer faction that runs an economy (a site, or finished with a start kit). */
  aiPlace: development({ args: "aiPlace", mutatesWorld: true }),
  /** The selected soldiers lock onto one visible enemy unit and chase it (owner 2026-11-17). */
  targetMilitary: player(),
  /** MAP BUILDING AVAILABILITY: the player changes the home island's building rules (sandbox unlock, no penalty). */
  setHomeBuildingRules: player({ args: "homeBuildingRules" }),
  /** Shift + right click: a ground point or an enemy unit joins the selected soldiers' order queue (2026-11-17). */
  queueMilitaryOrder: player()
} satisfies Readonly<Record<string, CommandSpec>>;

export type CommandName = keyof typeof COMMAND_MANIFEST;
