import assert from "node:assert/strict";
import test from "node:test";

import { BuildingType } from "../src/building-types.ts";

test("shared building ids preserve the numeric save and API contract", () => {
  assert.equal(BuildingType.Headquarters, 0);
  assert.equal(BuildingType.Quarry, 19);
  assert.equal(BuildingType.Storehouse, 29);
  assert.equal(BuildingType.Harbour, 39);
  assert.equal(BuildingType.MarbleQuarry, 43);
  assert.equal(BuildingType.Monument, 7);
  assert.ok(Object.isFrozen(BuildingType));
  assert.equal(new Set(Object.values(BuildingType)).size, Object.values(BuildingType).length);
});
