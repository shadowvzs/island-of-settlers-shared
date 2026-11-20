import assert from "node:assert/strict";
import { test } from "node:test";

import { scriptExitIds, unusedExitIssues } from "../src/campaign/campaign-exit-usage.ts";
import type { CampaignMapExit } from "../src/campaign/campaign-model.ts";
import { doStep, emptyScript, ref, str, trigger } from "./script-fixtures.ts";

/** The Check-only `campaignExitUnused` rule (BR2): declared exits against the map file's `endMap` actions. */

const exit = (id: string): CampaignMapExit => ({ id, name: { en: id } });
const endsThrough = (...exits: string[]) => emptyScript({ triggers: exits.map((id, index) => trigger(`t${index}`,
  { actions: [doStep("s1", "endMap", { exit: ref("exit", id), outcome: str("victory") })] })) });

test("the script's exit ids are its endMap exit references", () => {
  assert.deepEqual([...scriptExitIds(endsThrough("exit-2", "exit-1", "exit-2"))], ["exit-2", "exit-1"]);
  assert.deepEqual([...scriptExitIds(null)], []);
});

test("a declared exit no endMap names is a warning; used exits and the implicit victory are not", () => {
  const map = { exits: [exit("exit-1"), exit("exit-2"), exit("exit-3")] };
  assert.deepEqual(unusedExitIssues(map, endsThrough("exit-2")), [
    { code: "campaignExitUnused", params: { exit: "exit-1" }, path: "exits[0]", severity: "warning" },
    { code: "campaignExitUnused", params: { exit: "exit-3" }, path: "exits[2]", severity: "warning" }
  ]);
  assert.deepEqual(unusedExitIssues(map, endsThrough("exit-1", "exit-2", "exit-3")), []);
  assert.deepEqual(unusedExitIssues({}, endsThrough("victory")), []);
});

test("a map file without a script uses no exit", () => {
  assert.deepEqual(unusedExitIssues({ exits: [exit("exit-1")] }, undefined).map(issue => issue.params.exit),
    ["exit-1"]);
});
