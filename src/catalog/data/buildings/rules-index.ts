import armory from "./armory/rules.json" with { type: "json" };
import bakery from "./bakery/rules.json" with { type: "json" };
import barracks from "./barracks/rules.json" with { type: "json" };
import basaltQuarry from "./basaltQuarry/rules.json" with { type: "json" };
import bigResidence from "./bigResidence/rules.json" with { type: "json" };
import brewery from "./brewery/rules.json" with { type: "json" };
import catapult from "./catapult/rules.json" with { type: "json" };
import cedarForester from "./cedarForester/rules.json" with { type: "json" };
import cedarWoodcutter from "./cedarWoodcutter/rules.json" with { type: "json" };
import charburner from "./charburner/rules.json" with { type: "json" };
import coalMine from "./coalMine/rules.json" with { type: "json" };
import commandersLodge from "./commandersLodge/rules.json" with { type: "json" };
import farm from "./farm/rules.json" with { type: "json" };
import fishery from "./fishery/rules.json" with { type: "json" };
import flaxFarm from "./flaxFarm/rules.json" with { type: "json" };
import forester from "./forester/rules.json" with { type: "json" };
import fortress from "./fortress/rules.json" with { type: "json" };
import goldMine from "./goldMine/rules.json" with { type: "json" };
import graniteMine from "./graniteMine/rules.json" with { type: "json" };
import graniteQuarry from "./graniteQuarry/rules.json" with { type: "json" };
import guardhouse from "./guardhouse/rules.json" with { type: "json" };
import harbour from "./harbour/rules.json" with { type: "json" };
import hardwoodForester from "./hardwoodForester/rules.json" with { type: "json" };
import hardwoodWoodcutter from "./hardwoodWoodcutter/rules.json" with { type: "json" };
import headquarters from "./headquarters/rules.json" with { type: "json" };
import hunter from "./hunter/rules.json" with { type: "json" };
import ironMine from "./ironMine/rules.json" with { type: "json" };
import ironSmelter from "./ironSmelter/rules.json" with { type: "json" };
import leatherworks from "./leatherworks/rules.json" with { type: "json" };
import limestoneQuarry from "./limestoneQuarry/rules.json" with { type: "json" };
import lookoutTower from "./lookoutTower/rules.json" with { type: "json" };
import mahoganyForester from "./mahoganyForester/rules.json" with { type: "json" };
import mahoganyWoodcutter from "./mahoganyWoodcutter/rules.json" with { type: "json" };
import marbleQuarry from "./marbleQuarry/rules.json" with { type: "json" };
import mediumResidence from "./mediumResidence/rules.json" with { type: "json" };
import metalworks from "./metalworks/rules.json" with { type: "json" };
import militaryAcademy from "./militaryAcademy/rules.json" with { type: "json" };
import mill from "./mill/rules.json" with { type: "json" };
import mint from "./mint/rules.json" with { type: "json" };
import monument from "./monument/rules.json" with { type: "json" };
import pigFarm from "./pigFarm/rules.json" with { type: "json" };
import quarry from "./quarry/rules.json" with { type: "json" };
import sawmill from "./sawmill/rules.json" with { type: "json" };
import shipyard from "./shipyard/rules.json" with { type: "json" };
import skinner from "./skinner/rules.json" with { type: "json" };
import slaughterhouse from "./slaughterhouse/rules.json" with { type: "json" };
import smallResidence from "./smallResidence/rules.json" with { type: "json" };
import storehouse from "./storehouse/rules.json" with { type: "json" };
import tannery from "./tannery/rules.json" with { type: "json" };
import vineyard from "./vineyard/rules.json" with { type: "json" };
import walnutForester from "./walnutForester/rules.json" with { type: "json" };
import walnutWoodcutter from "./walnutWoodcutter/rules.json" with { type: "json" };
import watchtower from "./watchtower/rules.json" with { type: "json" };
import weaver from "./weaver/rules.json" with { type: "json" };
import well from "./well/rules.json" with { type: "json" };
import winery from "./winery/rules.json" with { type: "json" };
import woodcutter from "./woodcutter/rules.json" with { type: "json" };

/**
 * The rules sidecar of every active building keyed by building key (`buildings/<key>/rules.json`), read
 * synchronously by `catalog/building-data/rules.ts` (README, "Building sidecars"). Never part of the core catalog.
 */
export const BUILDING_RULE_FILES: Readonly<Record<string, unknown>> = {
  armory: armory,
  bakery: bakery,
  barracks: barracks,
  basaltQuarry: basaltQuarry,
  bigResidence: bigResidence,
  brewery: brewery,
  catapult: catapult,
  cedarForester: cedarForester,
  cedarWoodcutter: cedarWoodcutter,
  charburner: charburner,
  coalMine: coalMine,
  commandersLodge: commandersLodge,
  farm: farm,
  fishery: fishery,
  flaxFarm: flaxFarm,
  forester: forester,
  fortress: fortress,
  goldMine: goldMine,
  graniteMine: graniteMine,
  graniteQuarry: graniteQuarry,
  guardhouse: guardhouse,
  harbour: harbour,
  hardwoodForester: hardwoodForester,
  hardwoodWoodcutter: hardwoodWoodcutter,
  headquarters: headquarters,
  hunter: hunter,
  ironMine: ironMine,
  ironSmelter: ironSmelter,
  leatherworks: leatherworks,
  limestoneQuarry: limestoneQuarry,
  lookoutTower: lookoutTower,
  mahoganyForester: mahoganyForester,
  mahoganyWoodcutter: mahoganyWoodcutter,
  marbleQuarry: marbleQuarry,
  mediumResidence: mediumResidence,
  metalworks: metalworks,
  militaryAcademy: militaryAcademy,
  mill: mill,
  mint: mint,
  monument: monument,
  pigFarm: pigFarm,
  quarry: quarry,
  sawmill: sawmill,
  shipyard: shipyard,
  skinner: skinner,
  slaughterhouse: slaughterhouse,
  smallResidence: smallResidence,
  storehouse: storehouse,
  tannery: tannery,
  vineyard: vineyard,
  walnutForester: walnutForester,
  walnutWoodcutter: walnutWoodcutter,
  watchtower: watchtower,
  weaver: weaver,
  well: well,
  winery: winery,
  woodcutter: woodcutter
};
