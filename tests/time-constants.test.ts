import assert from "node:assert/strict";
import test from "node:test";

import {
  DAY_MS, secondsToTicks, TICK_HZ, TICK_MS, TICK_SECONDS, TICKS_PER_DAY, TICKS_PER_MINUTE, ticksToSeconds
} from "../src/time/constants.ts";

test("one 20 Hz tick is 50 ms and the same double as the historical 0.05 literal", () => {
  assert.equal(TICK_HZ, 20);
  assert.equal(TICK_MS, 50);
  assert.ok(Object.is(TICK_SECONDS, 0.05));
  assert.ok(Object.is(TICK_SECONDS, 1 / TICK_HZ));
});

test("derived spans keep the values the replay bounds were written with", () => {
  assert.equal(TICKS_PER_MINUTE, 1200);
  assert.equal(TICKS_PER_DAY, 24 * 60 * 60 * 20);
  assert.equal(DAY_MS, 24 * 60 * 60 * 1000);
});

test("tick/second conversions round to whole non-negative ticks", () => {
  assert.equal(secondsToTicks(1), 20);
  assert.equal(secondsToTicks(0.074), 1);
  assert.equal(secondsToTicks(-3), 0);
  assert.equal(ticksToSeconds(3), 0.15);
  assert.equal(ticksToSeconds(TICKS_PER_DAY), DAY_MS / 1000);
});
