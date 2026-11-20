import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import {
  createEconomyCatalog, LEVEL_STEPS, LEVEL_THRESHOLDS, MAX_PLAYER_LEVEL, provenLevelForExperience as levelForExperience,
  TRADE_WARE_VALUES
} from "../src/catalog/balance/index.ts";
import { CORE_DATA_FILES, validateBalance } from "../src/catalog/index.ts";

test("the shared level curve has 80 levels and early 100-XP steps", () => {
  assert.equal(MAX_PLAYER_LEVEL, 80);
  assert.equal(LEVEL_STEPS.length, 80);
  assert.equal(LEVEL_THRESHOLDS.length, 80);
  assert.deepEqual(LEVEL_THRESHOLDS.slice(0, 16), [
    0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500
  ]);
  assert.equal(LEVEL_THRESHOLDS[79], 494_681_000, "level 80 starts at the client balance's total");
  assert.equal(LEVEL_STEPS[60], 8_008_000, "late growth starts at level 61");
  assert.ok(LEVEL_THRESHOLDS.every((value, index, all) => index === 0 || value > all[index - 1]!));
});

test("a saved experience total maps to its level and refuses malformed totals", () => {
  assert.equal(levelForExperience(-1), 1);
  assert.equal(levelForExperience(0), 1);
  assert.equal(levelForExperience(99), 1);
  assert.equal(levelForExperience(100), 2);
  assert.equal(levelForExperience(LEVEL_THRESHOLDS[19]!), 20);
  assert.equal(levelForExperience(LEVEL_THRESHOLDS[19]! - 1), 19);
  assert.equal(levelForExperience(LEVEL_THRESHOLDS[79]!), 80);
  assert.equal(levelForExperience(Number.MAX_SAFE_INTEGER), 80);
  assert.equal(levelForExperience(Number.NaN), 1);
  assert.equal(levelForExperience(Number.POSITIVE_INFINITY), 1);
});

const rawBalance = () => JSON.parse(readFileSync(new URL("../src/catalog/data/balance.json", import.meta.url), "utf8"));

test("the balance data is valid and refuses unknown wares, fractional values and a second trade list", () => {
  assert.deepEqual(validateBalance(CORE_DATA_FILES, rawBalance()), []);
  const broken = rawBalance();
  broken.market.wares.push("unobtainium");
  broken.trade.wareValues.logs = 79.99;
  delete broken.trade.wareValues.planks;
  const messages = validateBalance(CORE_DATA_FILES, broken).map(issue => `${issue.path}: ${issue.message}`);
  assert.ok(messages.some(text => text.includes("market.wares[12]: Unknown ware unobtainium")));
  assert.ok(messages.some(text => text.includes("wareValues.logs: Whole value units")));
  assert.ok(messages.some(text => text.includes("ware:planks: economy.trade and a trade value differ")));
});

test("trade values are integers and the server economy catalog is plain data", () => {
  assert.ok(Object.values(TRADE_WARE_VALUES).every(value => Number.isSafeInteger(value)));
  const catalog = createEconomyCatalog();
  assert.deepEqual(JSON.parse(JSON.stringify(catalog)), catalog);
  assert.equal(catalog.levelRewards.length, MAX_PLAYER_LEVEL);
});
