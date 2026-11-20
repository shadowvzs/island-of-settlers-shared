import armory from "./armory/construction.json" with { type: "json" };
import bakery from "./bakery/construction.json" with { type: "json" };
import barracks from "./barracks/construction.json" with { type: "json" };
import basaltQuarry from "./basaltQuarry/construction.json" with { type: "json" };
import bigResidence from "./bigResidence/construction.json" with { type: "json" };
import brewery from "./brewery/construction.json" with { type: "json" };
import catapult from "./catapult/construction.json" with { type: "json" };
import cedarForester from "./cedarForester/construction.json" with { type: "json" };
import cedarWoodcutter from "./cedarWoodcutter/construction.json" with { type: "json" };
import charburner from "./charburner/construction.json" with { type: "json" };
import coalMine from "./coalMine/construction.json" with { type: "json" };
import commandersLodge from "./commandersLodge/construction.json" with { type: "json" };
import farm from "./farm/construction.json" with { type: "json" };
import fishery from "./fishery/construction.json" with { type: "json" };
import flaxFarm from "./flaxFarm/construction.json" with { type: "json" };
import forester from "./forester/construction.json" with { type: "json" };
import fortress from "./fortress/construction.json" with { type: "json" };
import goldMine from "./goldMine/construction.json" with { type: "json" };
import graniteMine from "./graniteMine/construction.json" with { type: "json" };
import graniteQuarry from "./graniteQuarry/construction.json" with { type: "json" };
import guardhouse from "./guardhouse/construction.json" with { type: "json" };
import harbour from "./harbour/construction.json" with { type: "json" };
import hardwoodForester from "./hardwoodForester/construction.json" with { type: "json" };
import hardwoodWoodcutter from "./hardwoodWoodcutter/construction.json" with { type: "json" };
import headquarters from "./headquarters/construction.json" with { type: "json" };
import hunter from "./hunter/construction.json" with { type: "json" };
import ironMine from "./ironMine/construction.json" with { type: "json" };
import ironSmelter from "./ironSmelter/construction.json" with { type: "json" };
import leatherworks from "./leatherworks/construction.json" with { type: "json" };
import limestoneQuarry from "./limestoneQuarry/construction.json" with { type: "json" };
import lookoutTower from "./lookoutTower/construction.json" with { type: "json" };
import mahoganyForester from "./mahoganyForester/construction.json" with { type: "json" };
import mahoganyWoodcutter from "./mahoganyWoodcutter/construction.json" with { type: "json" };
import marbleQuarry from "./marbleQuarry/construction.json" with { type: "json" };
import mediumResidence from "./mediumResidence/construction.json" with { type: "json" };
import metalworks from "./metalworks/construction.json" with { type: "json" };
import militaryAcademy from "./militaryAcademy/construction.json" with { type: "json" };
import mill from "./mill/construction.json" with { type: "json" };
import mint from "./mint/construction.json" with { type: "json" };
import monument from "./monument/construction.json" with { type: "json" };
import pigFarm from "./pigFarm/construction.json" with { type: "json" };
import quarry from "./quarry/construction.json" with { type: "json" };
import sawmill from "./sawmill/construction.json" with { type: "json" };
import shipyard from "./shipyard/construction.json" with { type: "json" };
import skinner from "./skinner/construction.json" with { type: "json" };
import slaughterhouse from "./slaughterhouse/construction.json" with { type: "json" };
import smallResidence from "./smallResidence/construction.json" with { type: "json" };
import storehouse from "./storehouse/construction.json" with { type: "json" };
import tannery from "./tannery/construction.json" with { type: "json" };
import vineyard from "./vineyard/construction.json" with { type: "json" };
import walnutForester from "./walnutForester/construction.json" with { type: "json" };
import walnutWoodcutter from "./walnutWoodcutter/construction.json" with { type: "json" };
import watchtower from "./watchtower/construction.json" with { type: "json" };
import weaver from "./weaver/construction.json" with { type: "json" };
import well from "./well/construction.json" with { type: "json" };
import winery from "./winery/construction.json" with { type: "json" };
import woodcutter from "./woodcutter/construction.json" with { type: "json" };

/**
 * The construction sidecar of every active building keyed by building key (`buildings/<key>/construction.json`),
 * read synchronously by `catalog/building-data/construction.ts` (README, "Building sidecars"). Never part of the core
 * catalog.
 */
export const BUILDING_CONSTRUCTION_FILES: Readonly<Record<string, unknown>> = {
  armory,
  bakery,
  barracks,
  basaltQuarry,
  bigResidence,
  brewery,
  catapult,
  cedarForester,
  cedarWoodcutter,
  charburner,
  coalMine,
  commandersLodge,
  farm,
  fishery,
  flaxFarm,
  forester,
  fortress,
  goldMine,
  graniteMine,
  graniteQuarry,
  guardhouse,
  harbour,
  hardwoodForester,
  hardwoodWoodcutter,
  headquarters,
  hunter,
  ironMine,
  ironSmelter,
  leatherworks,
  limestoneQuarry,
  lookoutTower,
  mahoganyForester,
  mahoganyWoodcutter,
  marbleQuarry,
  mediumResidence,
  metalworks,
  militaryAcademy,
  mill,
  mint,
  monument,
  pigFarm,
  quarry,
  sawmill,
  shipyard,
  skinner,
  slaughterhouse,
  smallResidence,
  storehouse,
  tannery,
  vineyard,
  walnutForester,
  walnutWoodcutter,
  watchtower,
  weaver,
  well,
  winery,
  woodcutter
};
