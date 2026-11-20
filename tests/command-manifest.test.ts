import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMAND_LOG_LIMITS, COMMAND_RATE_CLASSES, COMMAND_SIZE_CLASSES, MAX_COMMAND_ARGS_BYTES
} from "../src/commands/command-limits.ts";
import { COMMAND_MANIFEST } from "../src/commands/command-manifest.ts";
import {
  busiestCommandWindow, COMMAND_NAMES, commandRateClass, DEVELOPMENT_COMMANDS, isCommandName, knownCommandArgsValid,
  LEDGER_COMMANDS, recordedCommandProblem, WORLD_MUTATING_COMMANDS
} from "../src/commands/command-rules.ts";
import { TICKS_PER_DAY, TICKS_PER_MINUTE } from "../src/time/constants.ts";

/** The lists the manifest replaced (master 8e75eb3c4), copied verbatim: acceptance must stay identical. */
const RECORDED_BEFORE = [
  "placeBuilding", "demolishBuilding", "connectRoads", "previewRoadVerge", "plantRoadVerge", "cancelRoadVerge",
  "roadVergeSites", "buildBridge", "cancelBridgeConstruction", "removeBridge", "requestBridgeUpgrade",
  "cancelBridgeUpgrade", "removeRoad", "upgradeRoad", "transferWare", "dispatchSurveyJob", "setProductionOrder",
  "setProductionMode", "requestWorkshopUpgrade", "cancelWorkshopUpgrade", "setProductionPaused",
  "setStorageAcceptance", "setStorageExport", "setStorageCollect", "setSawmillMode", "setFisherMode",
  "setCatapultAmmo", "setShipyardMode", "setMilitaryTarget", "setMilitaryComposition", "setMilitaryCoins",
  "setMilitaryTrainingFocus", "commandMilitary", "deployCommander", "beginCommanderControl", "endCommanderControl",
  "assignCommanderEscort", "detachCommanderEscort", "setCommanderFollow", "placeRoadDecoration",
  "pickUpRoadDecoration", "rotateRoadDecoration", "moveRoadDecoration", "claimRoadDecorationReturns",
  "collectShoreShell", "callOutMilitary", "plantMilitaryRally", "cancelMilitaryRally",
  "startMilitaryTrainingEncounter", "startMilitaryTestSkirmish", "setPlayerNation", "debugSetPlayerNation",
  "setTalentRanks", "debugRaiseBuildingStep", "debugFillOutputs", "debugUpgradeRoads", "debugPlantRoadVerges",
  "debugRaiseBuildingLevel", "grantCoins", "grantHandcarts", "grantDebugTroop", "spawnDebugSoldier",
  "spawnDebugShip", "select", "selectMilitary", "spawnDebugEnemy", "deliverHome", "receiveHomeGoods",
  "takeStoredGoods", "requestReliefCollection", "pruneReliefCollections", "receiveTroops",
  "receiveColonyEvacuation", "releaseColony", "requestTroopPickup", "sendVisitorShip", "tradeBuy",
  "tradePlaceOffer", "tradeCancelOffer", "tradeSetProtectedFloor", "tradeSetNpcTraders", "fetchFromColony",
  "startColony", "startAdventure", "startDebugExpedition", "garrisonMilitary", "siegeMilitary",
  "orderTavernRecruits", "setFarmArea", "setStoneArea", "queueSeaTransport", "queueSeaPassengers",
  "queueSeaExpedition", "queueSeaExploration", "cancelSeaTransport", "sinkShip", "startColonyExpedition",
  "startAdventureExpedition", "cancelColonyExpedition", "returnMilitaryHome", "equipMilitary",
  "recruitStoredMilitary", "recoverCommanderWithItem", "recruitCommander", "returnCommander", "levelUpCommander",
  "spawnMilitaryOpponent", "commandMilitaryOpponent", "registerMilitaryGarrison", "registerMilitaryDoor",
  "enableEventCourtyard", "placeMilitaryScenarioBuilding", "removeMilitaryScenarioBuilding", "debugRaiseBuilding",
  "setMilitaryAiMode"];
/** Commands added after UNIFY-B1, at the end of the recording order. */
const ADDED_AFTER = [
  "claimQuest", "scriptUiAck", "confirmHomeClaim", "departCampaign", "receiveSettlers", "applyCinematicStep",
  "endCinematic", "adoptGameRules", "embarkMilitary", "sailShip", "landShipTroops", "siegeMilitaryOpponent",
  "destroyBuilding", "damageBuilding", "aiPlace", "targetMilitary", "setHomeBuildingRules",
  "queueMilitaryOrder"
];
const DEVELOPMENT_BEFORE = [
  "aiPlace", "claimRoadDecorationReturns", "commandMilitaryOpponent", "damageBuilding", "debugFillOutputs", "debugPlantRoadVerges",
  "debugRaiseBuilding", "debugRaiseBuildingLevel", "debugRaiseBuildingStep", "debugSetPlayerNation",
  "debugUpgradeRoads", "destroyBuilding", "enableEventCourtyard", "grantCoins", "grantDebugTroop", "grantHandcarts", "levelUpCommander",
  "moveRoadDecoration", "pickUpRoadDecoration", "placeMilitaryScenarioBuilding", "placeRoadDecoration",
  "recoverCommanderWithItem", "registerMilitaryDoor", "registerMilitaryGarrison", "removeMilitaryScenarioBuilding",
  "rotateRoadDecoration", "setMilitaryAiMode", "siegeMilitaryOpponent", "spawnDebugEnemy", "spawnDebugShip", "spawnDebugSoldier",
  "spawnMilitaryOpponent", "startDebugExpedition", "startMilitaryTestSkirmish", "tradeSetNpcTraders"
];
const LEDGER_BEFORE = [
  "tradeBuy", "tradePlaceOffer", "tradeCancelOffer", "sendVisitorShip", "startColony", "fetchFromColony",
  "requestReliefCollection", "deliverHome", "receiveHomeGoods", "takeStoredGoods", "receiveTroops",
  "receiveColonyEvacuation"
];
const WORLD_MUTATING_BEFORE = [
  "placeBuilding", "demolishBuilding", "connectRoads", "buildBridge", "cancelBridgeConstruction", "removeBridge",
  "requestBridgeUpgrade", "cancelBridgeUpgrade", "upgradeRoad", "removeRoad", "plantRoadVerge", "cancelRoadVerge",
  "debugRaiseBuilding", "debugRaiseBuildingStep", "startDebugExpedition", "setPlayerNation", "debugSetPlayerNation",
  "placeMilitaryScenarioBuilding", "debugPlantRoadVerges", "aiPlace"
];

const sorted = (names: Iterable<string>) => [...names].sort();

test("the manifest holds exactly the previously recorded commands in their recording order", () => {
  assert.deepEqual(COMMAND_NAMES, [...RECORDED_BEFORE, ...ADDED_AFTER]);
  assert.deepEqual(sorted(DEVELOPMENT_COMMANDS), sorted(DEVELOPMENT_BEFORE));
  assert.deepEqual(sorted(LEDGER_COMMANDS),
    sorted([...LEDGER_BEFORE, "adoptGameRules", "claimQuest", "confirmHomeClaim", "departCampaign",
      "receiveSettlers"]));
  assert.deepEqual(sorted(WORLD_MUTATING_COMMANDS), sorted(WORLD_MUTATING_BEFORE));
  const randomChoices = COMMAND_NAMES.flatMap(name => {
    const choice = COMMAND_MANIFEST[name].randomChoice;
    return choice ? [[name, choice.arg, choice.kind]] : [];
  });
  assert.deepEqual(randomChoices, [["grantDebugTroop", 0, "troop"], ["spawnDebugSoldier", 1, "troop"],
    ["spawnDebugEnemy", 1, "enemy"]]);
});

test("the manifest is plain serializable data", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(COMMAND_MANIFEST)), COMMAND_MANIFEST);
  for (const name of COMMAND_NAMES) assert.equal(isCommandName(name), true);
  for (const name of ["", "toString", "__proto__", "constructor", "saveState", 3, null])
    assert.equal(isCommandName(name), false);
});

test("verifier acceptance matches the previous checks", () => {
  const problem = (name: unknown, args: unknown, allowDevelopment = true) =>
    recordedCommandProblem({ args, name }, allowDevelopment);
  for (const name of RECORDED_BEFORE) {
    const shaped = ["debugUpgradeRoads", "moveRoadDecoration", "rotateRoadDecoration"].includes(name);
    if (!shaped) assert.equal(problem(name, [1, "x", { a: 1 }, null]), null, name);
    assert.equal(problem(name, "not-an-array"), "Unsupported command", name);
    const refused = DEVELOPMENT_BEFORE.includes(name);
    if (!shaped) assert.equal(problem(name, [], false), refused ? `Rejected command ${name}` : null, name);
  }
  assert.equal(problem("notACommand", []), "Unsupported command");
  assert.equal(problem("debugUpgradeRoads", []), null);
  assert.equal(problem("debugUpgradeRoads", [1]), "Road debug upgrade accepts no arguments");
  assert.equal(problem("debugUpgradeRoads", [], false), "Rejected command debugUpgradeRoads");
  assert.equal(problem("rotateRoadDecoration", [1]), null);
  assert.equal(problem("rotateRoadDecoration", [0]), "Invalid road decoration transform");
  assert.equal(problem("rotateRoadDecoration", [1, 2]), "Invalid road decoration transform");
  assert.equal(problem("moveRoadDecoration", [1, { x: 5, z: 6 }, 1]), null);
  assert.equal(problem("moveRoadDecoration", [1, { x: 5, z: 6 }]), "Invalid road decoration transform");
  assert.equal(problem("moveRoadDecoration", [1, { x: 5, z: 6 }, 99]), "Invalid road decoration transform");
  assert.equal(problem("moveRoadDecoration", [1, { x: 5, z: 6 }, 1], false), "Rejected command moveRoadDecoration");
});

test("the recorded quest claim accepts exactly one well-formed claim", () => {
  const claim = { bookId: "home-default", cost: { fish: 3 }, goods: { coins: 20 }, occurrence: "0",
    questId: "farm.wheat", skip: false };
  const problem = (args: unknown) => recordedCommandProblem({ args, name: "claimQuest" }, false);
  assert.equal(problem([claim]), null);
  assert.equal(problem([]), "Invalid quest claim");
  assert.equal(problem([claim, claim]), "Invalid quest claim");
  assert.equal(problem([{ ...claim, cost: { fish: -1 } }]), "Invalid quest claim");
  assert.equal(problem([{ ...claim, extra: true }]), "Invalid quest claim");
  assert.equal(problem([{ ...claim, questId: "" }]), "Invalid quest claim");
  assert.equal(knownCommandArgsValid({ args: [claim], name: "claimQuest" }), true);
});

test("scriptUiAck accepts exactly one highlight effect id", () => {
  const problem = (args: unknown) => recordedCommandProblem({ args, name: "scriptUiAck" }, false);
  assert.equal(problem(["ui:12:s4:340"]), null);
  assert.equal(problem(["ui:3:step.a-1:0"]), null);
  for (const args of [[], ["ui:12:s4"], ["mail:1:s4:3"], ["ui:12:s4:3", 1], [12], ["ui:x:s4:3"]])
    assert.equal(problem(args), "Invalid script UI acknowledgement", JSON.stringify(args));
  assert.equal(COMMAND_MANIFEST.scriptUiAck.access, "player");
  assert.equal(COMMAND_MANIFEST.scriptUiAck.ledger, false);
});

test("confirmHomeClaim accepts exactly one confirmation of a pending declared reward", () => {
  const problem = (args: unknown) => recordedCommandProblem({ args, name: "confirmHomeClaim" }, false);
  assert.equal(problem([{ goods: { coins: 9 }, occurrence: "0", rewardId: "reward-1" }]), null);
  for (const args of [[], [{ goods: {}, occurrence: "", rewardId: "r" }], [{ goods: { coins: -1 }, occurrence: "0",
    rewardId: "r" }], [{ goods: {}, occurrence: "0", rewardId: "r", extra: 1 }],
  [{ goods: {}, occurrence: "0", rewardId: "r" }, { goods: {}, occurrence: "1", rewardId: "r" }]])
    assert.equal(problem(args), "Invalid home reward confirmation", JSON.stringify(args));
  assert.equal(COMMAND_MANIFEST.confirmHomeClaim.access, "player");
  assert.equal(COMMAND_MANIFEST.confirmHomeClaim.ledger, true);
});

test("the storage check refuses wrong argument shapes of known commands only", () => {
  assert.equal(knownCommandArgsValid({ args: [], name: "debugUpgradeRoads" }), true);
  assert.equal(knownCommandArgsValid({ args: [1], name: "debugUpgradeRoads" }), false);
  assert.equal(knownCommandArgsValid({ args: "x", name: "debugUpgradeRoads" }), false);
  assert.equal(knownCommandArgsValid({ args: "x", name: "aFutureCommand" }), true);
  assert.equal(knownCommandArgsValid({ args: [1, 2], name: "placeBuilding" }), true);
});

test("one source of log limits, size classes and rate classes", () => {
  assert.deepEqual(COMMAND_LOG_LIMITS, { commandsPerInterval: 512, intervalTicks: TICKS_PER_DAY,
    intervalsPerUpload: 64, logBytes: 4 * 1024 * 1024 });
  assert.deepEqual(COMMAND_SIZE_CLASSES, { standard: { argsBytes: 64 * 1024, resultBytes: 16 * 1024 } });
  assert.equal(MAX_COMMAND_ARGS_BYTES, 64 * 1024);
  assert.deepEqual(COMMAND_RATE_CLASSES, { standard: { maxCommands: 600, windowTicks: TICKS_PER_MINUTE } });
  assert.equal(commandRateClass("placeBuilding"), "standard");
  assert.equal(commandRateClass("unknown"), "standard");
  assert.equal(busiestCommandWindow([0, 1, 1199, 1200, 1201, 5000], "standard"), 3);
});
