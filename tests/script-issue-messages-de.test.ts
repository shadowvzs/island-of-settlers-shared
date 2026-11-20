import assert from "node:assert/strict";
import { test } from "node:test";

import { CAMPAIGN_ISSUE_MESSAGES } from "../src/campaign/campaign-issues.ts";
import { SCRIPT_ISSUE_MESSAGES } from "../src/script/issue-messages.ts";
import pendingTranslations from "./fixtures/pending-issue-translations.json" with { type: "json" };

/** German texts of the player/map-author-facing issue tables (DS-DE-ISSUES). */

const placeholders = (template: string) =>
  [...template.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

/**
 * English-only codes that wait for the owner's translation batch: the one shared list of
 * `fixtures/pending-issue-translations.json` (BR0, BR2, AUDIO-CATALOG). A translated code must leave it, so it can
 * only shrink.
 */
const GERMAN_PENDING: ReadonlySet<string> = new Set([...pendingTranslations.campaign, ...pendingTranslations.script]);

const assertGermanComplete = (
  table: Readonly<Record<string, { de?: string; en: string }>>, tableName: string
) => {
  for (const [code, text] of Object.entries(table)) {
    const german = text.de?.trim();
    if (GERMAN_PENDING.has(code)) {
      assert.equal(german, undefined, `${tableName}.${code} is translated: remove it from GERMAN_PENDING`);
      continue;
    }
    assert.ok(german, `${tableName}.${code} has no German text`);
    assert.deepEqual(placeholders(german), placeholders(text.en), `${tableName}.${code} German placeholders`);
  }
};

test("every script issue message has German text with the English placeholders", () => {
  assertGermanComplete(SCRIPT_ISSUE_MESSAGES, "SCRIPT_ISSUE_MESSAGES");
});

test("every campaign issue message has German text with the English placeholders", () => {
  assertGermanComplete(CAMPAIGN_ISSUE_MESSAGES, "CAMPAIGN_ISSUE_MESSAGES");
});
