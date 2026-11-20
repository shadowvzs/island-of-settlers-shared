import type { CatalogDataFile } from "../../validate/index.ts";
import armory from "./armory.json" with { type: "json" };
import bakery from "./bakery.json" with { type: "json" };
import barracks from "./barracks.json" with { type: "json" };
import basaltQuarry from "./basaltQuarry.json" with { type: "json" };
import bigResidence from "./bigResidence.json" with { type: "json" };
import brewery from "./brewery.json" with { type: "json" };
import catapult from "./catapult.json" with { type: "json" };
import cedarForester from "./cedarForester.json" with { type: "json" };
import cedarSawmill from "./cedarSawmill.json" with { type: "json" };
import cedarWoodcutter from "./cedarWoodcutter.json" with { type: "json" };
import charburner from "./charburner.json" with { type: "json" };
import coalMine from "./coalMine.json" with { type: "json" };
import commandersLodge from "./commandersLodge.json" with { type: "json" };
import farm from "./farm.json" with { type: "json" };
import fishery from "./fishery.json" with { type: "json" };
import flaxFarm from "./flaxFarm.json" with { type: "json" };
import forester from "./forester.json" with { type: "json" };
import fortress from "./fortress.json" with { type: "json" };
import goldMine from "./goldMine.json" with { type: "json" };
import graniteMine from "./graniteMine.json" with { type: "json" };
import graniteQuarry from "./graniteQuarry.json" with { type: "json" };
import guardhouse from "./guardhouse.json" with { type: "json" };
import harbour from "./harbour.json" with { type: "json" };
import hardwoodForester from "./hardwoodForester.json" with { type: "json" };
import hardwoodSawmill from "./hardwoodSawmill.json" with { type: "json" };
import hardwoodWoodcutter from "./hardwoodWoodcutter.json" with { type: "json" };
import headquarters from "./headquarters.json" with { type: "json" };
import hunter from "./hunter.json" with { type: "json" };
import ironMine from "./ironMine.json" with { type: "json" };
import ironSmelter from "./ironSmelter.json" with { type: "json" };
import leatherworks from "./leatherworks.json" with { type: "json" };
import limestoneQuarry from "./limestoneQuarry.json" with { type: "json" };
import lookoutTower from "./lookoutTower.json" with { type: "json" };
import mahoganyForester from "./mahoganyForester.json" with { type: "json" };
import mahoganySawmill from "./mahoganySawmill.json" with { type: "json" };
import mahoganyWoodcutter from "./mahoganyWoodcutter.json" with { type: "json" };
import marbleQuarry from "./marbleQuarry.json" with { type: "json" };
import mediumResidence from "./mediumResidence.json" with { type: "json" };
import metalworks from "./metalworks.json" with { type: "json" };
import militaryAcademy from "./militaryAcademy.json" with { type: "json" };
import mill from "./mill.json" with { type: "json" };
import mint from "./mint.json" with { type: "json" };
import monument from "./monument.json" with { type: "json" };
import pigFarm from "./pigFarm.json" with { type: "json" };
import quarry from "./quarry.json" with { type: "json" };
import retired30 from "./retired30.json" with { type: "json" };
import retired38 from "./retired38.json" with { type: "json" };
import retired63 from "./retired63.json" with { type: "json" };
import sawmill from "./sawmill.json" with { type: "json" };
import shipyard from "./shipyard.json" with { type: "json" };
import skinner from "./skinner.json" with { type: "json" };
import slaughterhouse from "./slaughterhouse.json" with { type: "json" };
import smallResidence from "./smallResidence.json" with { type: "json" };
import storehouse from "./storehouse.json" with { type: "json" };
import tannery from "./tannery.json" with { type: "json" };
import vineyard from "./vineyard.json" with { type: "json" };
import walnutForester from "./walnutForester.json" with { type: "json" };
import walnutSawmill from "./walnutSawmill.json" with { type: "json" };
import walnutWoodcutter from "./walnutWoodcutter.json" with { type: "json" };
import watchtower from "./watchtower.json" with { type: "json" };
import weaver from "./weaver.json" with { type: "json" };
import well from "./well.json" with { type: "json" };
import winery from "./winery.json" with { type: "json" };
import woodcutter from "./woodcutter.json" with { type: "json" };

/**
 * One core file per building (owner: one building = one file), in building menu order: the building panel tabs
 * (`building.*` categories) list their buildings in this order. Retired stubs follow. Heavy per-building data
 * goes into lazily loaded sidecars under `buildings/<key>/`.
 */
export const BUILDING_FILES: readonly CatalogDataFile[] = [
  { entries: [woodcutter], file: "buildings/woodcutter.json", kind: "building" },
  { entries: [forester], file: "buildings/forester.json", kind: "building" },
  { entries: [quarry], file: "buildings/quarry.json", kind: "building" },
  { entries: [sawmill], file: "buildings/sawmill.json", kind: "building" },
  { entries: [flaxFarm], file: "buildings/flaxFarm.json", kind: "building" },
  { entries: [weaver], file: "buildings/weaver.json", kind: "building" },
  { entries: [hardwoodForester], file: "buildings/hardwoodForester.json", kind: "building" },
  { entries: [hardwoodWoodcutter], file: "buildings/hardwoodWoodcutter.json", kind: "building" },
  { entries: [marbleQuarry], file: "buildings/marbleQuarry.json", kind: "building" },
  { entries: [cedarForester], file: "buildings/cedarForester.json", kind: "building" },
  { entries: [cedarWoodcutter], file: "buildings/cedarWoodcutter.json", kind: "building" },
  { entries: [limestoneQuarry], file: "buildings/limestoneQuarry.json", kind: "building" },
  { entries: [walnutForester], file: "buildings/walnutForester.json", kind: "building" },
  { entries: [walnutWoodcutter], file: "buildings/walnutWoodcutter.json", kind: "building" },
  { entries: [basaltQuarry], file: "buildings/basaltQuarry.json", kind: "building" },
  { entries: [mahoganyForester], file: "buildings/mahoganyForester.json", kind: "building" },
  { entries: [mahoganyWoodcutter], file: "buildings/mahoganyWoodcutter.json", kind: "building" },
  { entries: [graniteQuarry], file: "buildings/graniteQuarry.json", kind: "building" },
  { entries: [headquarters], file: "buildings/headquarters.json", kind: "building" },
  { entries: [storehouse], file: "buildings/storehouse.json", kind: "building" },
  { entries: [smallResidence], file: "buildings/smallResidence.json", kind: "building" },
  { entries: [mediumResidence], file: "buildings/mediumResidence.json", kind: "building" },
  { entries: [bigResidence], file: "buildings/bigResidence.json", kind: "building" },
  { entries: [lookoutTower], file: "buildings/lookoutTower.json", kind: "building" },
  { entries: [shipyard], file: "buildings/shipyard.json", kind: "building" },
  { entries: [harbour], file: "buildings/harbour.json", kind: "building" },
  { entries: [monument], file: "buildings/monument.json", kind: "building" },
  { entries: [vineyard], file: "buildings/vineyard.json", kind: "building" },
  { entries: [winery], file: "buildings/winery.json", kind: "building" },
  { entries: [fishery], file: "buildings/fishery.json", kind: "building" },
  { entries: [slaughterhouse], file: "buildings/slaughterhouse.json", kind: "building" },
  { entries: [hunter], file: "buildings/hunter.json", kind: "building" },
  { entries: [brewery], file: "buildings/brewery.json", kind: "building" },
  { entries: [pigFarm], file: "buildings/pigFarm.json", kind: "building" },
  { entries: [mill], file: "buildings/mill.json", kind: "building" },
  { entries: [bakery], file: "buildings/bakery.json", kind: "building" },
  { entries: [well], file: "buildings/well.json", kind: "building" },
  { entries: [farm], file: "buildings/farm.json", kind: "building" },
  { entries: [skinner], file: "buildings/skinner.json", kind: "building" },
  { entries: [tannery], file: "buildings/tannery.json", kind: "building" },
  { entries: [leatherworks], file: "buildings/leatherworks.json", kind: "building" },
  { entries: [armory], file: "buildings/armory.json", kind: "building" },
  { entries: [metalworks], file: "buildings/metalworks.json", kind: "building" },
  { entries: [ironSmelter], file: "buildings/ironSmelter.json", kind: "building" },
  { entries: [charburner], file: "buildings/charburner.json", kind: "building" },
  { entries: [mint], file: "buildings/mint.json", kind: "building" },
  { entries: [goldMine], file: "buildings/goldMine.json", kind: "building" },
  { entries: [ironMine], file: "buildings/ironMine.json", kind: "building" },
  { entries: [coalMine], file: "buildings/coalMine.json", kind: "building" },
  { entries: [graniteMine], file: "buildings/graniteMine.json", kind: "building" },
  { entries: [barracks], file: "buildings/barracks.json", kind: "building" },
  { entries: [guardhouse], file: "buildings/guardhouse.json", kind: "building" },
  { entries: [watchtower], file: "buildings/watchtower.json", kind: "building" },
  { entries: [fortress], file: "buildings/fortress.json", kind: "building" },
  { entries: [militaryAcademy], file: "buildings/militaryAcademy.json", kind: "building" },
  { entries: [commandersLodge], file: "buildings/commandersLodge.json", kind: "building" },
  { entries: [catapult], file: "buildings/catapult.json", kind: "building" },
  { entries: [retired30], file: "buildings/retired30.json", kind: "building" },
  { entries: [retired38], file: "buildings/retired38.json", kind: "building" },
  { entries: [hardwoodSawmill], file: "buildings/hardwoodSawmill.json", kind: "building" },
  { entries: [cedarSawmill], file: "buildings/cedarSawmill.json", kind: "building" },
  { entries: [walnutSawmill], file: "buildings/walnutSawmill.json", kind: "building" },
  { entries: [mahoganySawmill], file: "buildings/mahoganySawmill.json", kind: "building" },
  { entries: [retired63], file: "buildings/retired63.json", kind: "building" }
];
