import assert from "node:assert/strict";
import { test } from "node:test";

import { validateMapScript } from "../src/script/validate.ts";
import {
  contentDisplayName, formatSourceMessage, type QuestTextContext, resolveQuestText, type TextCatalogPort
} from "../src/script/text/index.ts";
import type { QuestText } from "../src/script/types/index.ts";
import { emptyScript, ref } from "./script-fixtures.ts";

/** QU2: the quest text resolver (inline language → catalog id → inline English) and the catalog name bridge. */

const HUNGARIAN: Readonly<Record<string, string>> = {
  "domain.building.woodcutter": "Favágó",
  "domain.ware.stone": "Kő",
  "domain.wareCount.sword": "Kard",
  "test.build": "Építs: {building}",
  "test.plain": "Katalógus szöveg",
  "test.produce": "Termelj {count} {ware} árut"
};

/** A stand-in for the Lingui catalog of one locale: only the ids it lists exist. */
const catalogOf = (messages: Readonly<Record<string, string>>): TextCatalogPort => ({
  has: key => key in messages,
  translate: (key, english, values) => formatSourceMessage(messages[key] ?? english, values ?? {})
});

const english: QuestTextContext = { locale: "en" };
const hungarian: QuestTextContext = { catalog: catalogOf(HUNGARIAN), locale: "hu" };
const content = (id: string, form: "name" | "plural" | "counted") =>
  ({ content: ref("content", id), form, kind: "content" as const });

test("the source fallback renders simple plurals, `#` and named values, and keeps unknown placeholders", () => {
  const source = "{count, plural, one {# log} other {# logs}} for {building} {missing}";
  assert.equal(formatSourceMessage(source, { building: "Sawmill", count: 1 }), "1 log for Sawmill {missing}");
  assert.equal(formatSourceMessage(source, { building: "Sawmill", count: 3 }), "3 logs for Sawmill {missing}");
});

test("resolution order: inline text of the language, then the catalog id, then inline English", () => {
  const text: QuestText = { en: "English", hu: "Helyi magyar", translationKey: "test.plain" };
  assert.equal(resolveQuestText(text, hungarian), "Helyi magyar");
  assert.equal(resolveQuestText({ en: "English", translationKey: "test.plain" }, hungarian), "Katalógus szöveg");
  assert.equal(resolveQuestText({ en: "English", hu: "  ", translationKey: "test.plain" }, hungarian),
    "Katalógus szöveg");
  assert.equal(resolveQuestText({ en: "English", translationKey: "test.unknown" }, hungarian), "English");
  assert.equal(resolveQuestText({ en: "English" }, hungarian), "English");
  assert.equal(resolveQuestText(text, { locale: "de" }), "English");
});

test("the reserved fields are never read as a language", () => {
  const text: QuestText = { en: "English {count}", translationKey: "test.plain", values: {
    count: { kind: "number", value: 2 } } };
  assert.equal(resolveQuestText(text, { locale: "values" }), "English 2");
  assert.equal(resolveQuestText(text, { locale: "translationKey" }), "English 2");
});

test("typed values fill every source: inline, catalog and English", () => {
  const values = { count: { kind: "number" as const, value: 3 }, ware: content("ware:sword", "plural") };
  const text: QuestText = { en: "Produce {count} {ware}", translationKey: "test.produce", values };
  assert.equal(resolveQuestText(text, english), "Produce 3 Swords");
  assert.equal(resolveQuestText(text, hungarian), "Termelj 3 Kard árut");
  assert.equal(resolveQuestText({ ...text, hu: "{count} db {ware}" }, hungarian), "3 db Kard");
  assert.equal(resolveQuestText({ ...text, translationKey: "test.unknown" }, hungarian), "Produce 3 Kard");
});

test("an expression value uses the engine's evaluator, else its placeholder stays", () => {
  const text: QuestText = { en: "Planted {planted} trees", values: {
    planted: { expr: { k: "lit", type: "number", value: 5 }, format: "number", kind: "expr" } } };
  assert.equal(resolveQuestText(text, english), "Planted {planted} trees");
  assert.equal(resolveQuestText(text, { ...english, evaluate: () => "5" }), "Planted 5 trees");
});

test("ware names follow the amount; mass nouns keep one form", () => {
  assert.equal(contentDisplayName("ware:sword", { count: 1, form: "plural" }, english), "Sword");
  assert.equal(contentDisplayName("ware:sword", { count: 4, form: "plural" }, english), "Swords");
  assert.equal(contentDisplayName("ware:sword", { count: 4, form: "name" }, english), "Sword");
  assert.equal(contentDisplayName("ware:stone", { count: 4, form: "plural" }, english), "Stone");
  assert.equal(contentDisplayName("ware:sword", { count: 1200, form: "counted" }, english), "1,200 Swords");
  assert.equal(contentDisplayName("ware:stone", { count: 7, form: "counted" }, hungarian), "7 Kő");
});

test("building names take the English plural only in English", () => {
  assert.equal(contentDisplayName("building:woodcutter", { count: 1, form: "plural" }, english), "Woodcutter");
  assert.equal(contentDisplayName("building:woodcutter", { count: 2, form: "plural" }, english), "Woodcutters");
  assert.equal(contentDisplayName("building:woodcutter", { count: 2, form: "plural" }, hungarian), "Favágó");
  assert.equal(contentDisplayName("building:woodcutter", { count: 2, form: "name" }, english), "Woodcutter");
  // Without a catalog the name is English whatever the viewer's locale is, so the English plural applies.
  assert.equal(contentDisplayName("building:woodcutter", { count: 2, form: "plural" }, { locale: "hu" }),
    "Woodcutters");
});

test("troop names are nation-specific and fall back to the Roman roster", () => {
  const viking = { ...english, nation: "viking" };
  assert.equal(contentDisplayName("soldier:shield", { count: 1, form: "name" }, viking), "Shield warrior");
  assert.equal(contentDisplayName("soldier:shield", { count: 3, form: "plural" }, viking), "Shield warriors");
  assert.equal(contentDisplayName("soldier:shield", { count: 1, form: "plural" }, viking), "Shield warrior");
  assert.equal(contentDisplayName("soldier:shield", { count: 3, form: "plural" }, { ...english, nation: "none" }),
    "Swordsmen");
});

test("a content alias renames before the lookup and an unknown id keeps its key", () => {
  const aliased = { ...english, contentAlias: () => "ware:sword" };
  assert.equal(contentDisplayName("ware:stone", { count: 2, form: "plural" }, aliased), "Swords");
  assert.equal(contentDisplayName("ware:unobtainium", { count: 2, form: "plural" }, english), "Unobtainium");
});

test("the `counted` name form is a valid stored text value", () => {
  const title: QuestText = { en: "Deliver {wares}", values: {
    count: { kind: "number", value: 12 }, wares: content("ware:sword", "counted") } };
  const script = emptyScript();
  script.quests.quests.push({ cost: [], deadline: null, failure: null, id: "q-deliver",
    objective: { kind: "scripted" }, onActivate: [], onFailure: [], onSuccess: [],
    repeat: { kind: "once", retryAfterFail: false }, title, visibility: "visible" });
  const result = validateMapScript(script, { mapKind: "home" });
  assert.deepEqual(result.errors, []);
  assert.equal(resolveQuestText(title, english), "Deliver 12 Swords");
});
