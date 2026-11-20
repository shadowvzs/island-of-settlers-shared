import type { QuestTextValue } from "../types/quest-text.ts";
import type { MessageValues } from "./format.ts";

/** The active message catalog (Lingui on the client). The server and the simulation have none: English only. */
export interface TextCatalogPort {
  /** Whether the catalog of the active locale holds this message id. */
  has: (key: string) => boolean;
  /** The message in the active locale, formatted by the catalog; `english` is its source text. */
  translate: (key: string, english: string, values?: MessageValues) => string;
}

export type QuestTextExprValue = Extract<QuestTextValue, { kind: "expr" }>;

/** Everything a quest text needs to become one string for one viewer. */
export interface QuestTextContext {
  catalog?: TextCatalogPort;
  /** Map-kind substitution of a content id before naming it (home books: the nation's own drink chain). */
  contentAlias?: (contentId: string) => string;
  /** Live expression values (script engine); without it an expression placeholder stays as written. */
  evaluate?: (value: QuestTextExprValue) => string | undefined;
  /** Active language code ("en", "hu", "de"). */
  locale: string;
  /** The viewer's nation: buildings and troops carry nation-specific names. */
  nation?: string;
}
