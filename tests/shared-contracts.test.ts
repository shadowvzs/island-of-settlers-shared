import assert from "node:assert/strict";
import test from "node:test";

import {
  ARCHIVED_ISLAND_KEY_PATTERN, isArchivedIslandKey, isIslandKey, ISLAND_KEY_PATTERN
} from "../src/island-key.ts";
import { isNation, NATIONS } from "../src/nations.ts";
import { OFFLINE_CATCH_UP_CAP_SECONDS } from "../src/offline-catch-up.ts";
import { DAY_MS } from "../src/time/constants.ts";
import { isAccountNation } from "../src/validation.ts";

test("one nation list in the nation choice order backs the account validator", () => {
  assert.deepEqual(NATIONS, ["roman", "viking", "japanese", "nubian", "indigenous", "chinese", "persian", "maya"]);
  for (const nation of NATIONS) assert.ok(isNation(nation) && isAccountNation(nation));
  for (const value of ["", "Roman", "aztec", 1, null, undefined]) assert.equal(isAccountNation(value), false);
});

test("island keys accept home, colonies and adventures with at most 15 index digits", () => {
  for (const key of ["home", "colony-0", "colony-123456789012345", "adventure-7"]) assert.ok(isIslandKey(key), key);
  for (const key of ["", "Home", "colony-", "colony-1234567890123456", "colony-1a", "adventure--1", 3])
    assert.equal(isIslandKey(key), false, String(key));
  assert.ok(ISLAND_KEY_PATTERN.test("adventure-12"));
});

test("archived relief keys are home or colony only", () => {
  assert.ok(isArchivedIslandKey("home") && isArchivedIslandKey("colony-4"));
  assert.equal(isArchivedIslandKey("adventure-4"), false);
  assert.equal(ARCHIVED_ISLAND_KEY_PATTERN.test("colony-1234567890123456"), false);
});

test("the offline catch-up cap is one game day for client and server", () => {
  assert.equal(OFFLINE_CATCH_UP_CAP_SECONDS, DAY_MS / 1000);
});

test("the package index exports the validation kit and the format registry", async () => {
  const shared = await import("../src/index.ts");
  assert.equal(shared.FORMATS.commandLog.id, "island-settlers-command-log");
  assert.equal(shared.isPlainObject({}), true);
  assert.equal(shared.isTick(-1), false);
  assert.equal(shared.isObject, shared.isPlainObject);
});
