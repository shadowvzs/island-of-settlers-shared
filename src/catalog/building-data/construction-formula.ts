import type { ConstructionInputs } from "../types/building-data.ts";

/**
 * The unified construction rule (owner 2026-11-11, catalog README "Construction cost rule"): every building pays
 * the same two materials, planks and stone, scaled by its occupied footprint, its height and its model detail,
 * all measured from the High, base-level Roman model at build time (tools/catalog/building-construction.ts).
 * Fitted in CAT7 so the total over all buildings stays the legacy total (233 vs 236 wares).
 */
export const CONSTRUCTION_FORMULA = Object.freeze({
  /** Occupied grid cells per ware. */
  cellsPerWare: 12,
  /** Tiles of model height per ware. */
  heightPerWare: 3,
  /** Smallest total: one plank and one stone. */
  minimumTotal: 2,
  /** Share of the total paid in stone (the legacy receipts paid about 3 planks : 2 stone). */
  stoneShare: 0.4,
  /** High static triangles per ware. */
  trianglesPerWare: 5000
});

/** Points of size, height and detail before rounding to whole wares. */
export const constructionPoints = ({ cells, height, triangles }: ConstructionInputs) =>
  cells[0] * cells[1] / CONSTRUCTION_FORMULA.cellsPerWare + height / CONSTRUCTION_FORMULA.heightPerWare
    + triangles / CONSTRUCTION_FORMULA.trianglesPerWare;

/** The planks and stone a building costs under the unified rule (build time only; the sim reads stored costs). */
export const unifiedConstructionCost = (inputs: ConstructionInputs) => {
  const total = Math.max(CONSTRUCTION_FORMULA.minimumTotal, Math.round(constructionPoints(inputs)));
  const stone = Math.max(1, Math.round(total * CONSTRUCTION_FORMULA.stoneShare));
  return { planks: total - stone, stone };
};
