import { DEFAULT_PLURAL_COUNT, QUEST_TEXT_COUNT_VALUE, QUEST_TEXT_RESERVED_FIELDS } from "../constants.ts";
import type { QuestText, QuestTextValue, QuestTextValues } from "../types/quest-text.ts";
import { contentDisplayName } from "./content-names.ts";
import type { QuestTextContext } from "./context.ts";
import { formatSourceMessage, type MessageValues } from "./format.ts";

/** The amount a text's count-dependent names follow: its own numeric `count` value. */
const textCount = (values: QuestTextValues) => {
  const count = values[QUEST_TEXT_COUNT_VALUE];
  return count?.kind === "number" ? count.value : DEFAULT_PLURAL_COUNT;
};

const resolveValue = (value: QuestTextValue, count: number, context: QuestTextContext) => {
  if (value.kind === "number") return value.value;
  if (value.kind === "content") return contentDisplayName(value.content.id, { count, form: value.form }, context);
  return context.evaluate?.(value);
};

/** Typed placeholder values as plain message values; an expression nobody can evaluate keeps its placeholder. */
const resolveValues = (values: QuestTextValues, context: QuestTextContext): MessageValues => {
  const count = textCount(values);
  const resolved: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(values)) {
    const result = resolveValue(value, count, context);
    if (result !== undefined) resolved[name] = result;
  }
  return resolved;
};

/** The stored text of one language; the reserved fields (`translationKey`, `values`) are never a language. */
const inlineText = (text: QuestText, language: string) => {
  if (QUEST_TEXT_RESERVED_FIELDS.includes(language)) return undefined;
  const inline = text[language];
  return typeof inline === "string" && inline.trim() ? inline : undefined;
};

const renderInline = (source: string, values: MessageValues | undefined) =>
  values ? formatSourceMessage(source, values) : source;

/**
 * One quest text as a string for one viewer (owner 2026-11-11):
 * 1. the inline text in the viewer's language (a map may override a shipped word);
 * 2. the message catalog by `translationKey`, when the active catalog holds that id;
 * 3. the inline English text.
 * Inline text is rendered by the source fallback (`formatSourceMessage`), catalog text by the catalog itself.
 */
export const resolveQuestText = (text: QuestText, context: QuestTextContext): string => {
  const values = text.values ? resolveValues(text.values, context) : undefined;
  const inline = inlineText(text, context.locale);
  if (inline !== undefined) return renderInline(inline, values);
  const key = text.translationKey;
  if (key !== undefined && context.catalog?.has(key)) return context.catalog.translate(key, text.en, values);
  return renderInline(text.en, values);
};
