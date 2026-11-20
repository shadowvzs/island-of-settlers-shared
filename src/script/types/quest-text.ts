import type { CellFormat } from "./multiboards.ts";
import type { ScriptRef } from "./refs.ts";
import type { Expr } from "./values.ts";

/**
 * How a catalog name is written: `name` is the singular name; `plural` follows the amount ("Sword"/"Swords");
 * `counted` puts the amount in front ("12 Swords"). The amount is the text's own numeric value named `count`.
 */
export type ContentNameForm = "name" | "plural" | "counted";

/** A typed value of a text template placeholder (design §12; QU §3.1 `QuestTextValue`). */
export type QuestTextValue =
  | { kind: "number"; value: number }
  /** A catalog name: never typed into scripts, resolved through the catalog's `translationKey`. */
  | { content: ScriptRef<"content">; form: ContentNameForm; kind: "content" }
  /** A live value, formatted like a multiboard cell ("Planted {planted}/{target} trees"). */
  | { expr: Expr; format: CellFormat; kind: "expr" };

export type QuestTextValues = Readonly<Record<string, QuestTextValue>>;

/**
 * Player-visible script text (C1 `TranslatableText` extended): one string per language code with English required,
 * plus an optional Lingui id for shipped books (`translationKey`, the content catalog convention) and typed
 * placeholder values. The two reserved fields are never language codes.
 */
export interface QuestText {
  readonly [language: string]: string | QuestTextValues | undefined;
  readonly en: string;
  readonly translationKey?: string;
  readonly values?: QuestTextValues;
}
