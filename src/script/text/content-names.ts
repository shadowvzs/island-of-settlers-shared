import { getContentEntry } from "../../catalog/index.ts";
import type { ContentEntry, ContentText } from "../../catalog/index.ts";
import { SCRIPT_FALLBACK_LANGUAGE, TROOP_NAME_FALLBACK_NATION } from "../constants.ts";
import type { ContentNameForm } from "../types/quest-text.ts";
import type { QuestTextContext } from "./context.ts";
import { formatSourceMessage, type MessageValues } from "./format.ts";

/**
 * The catalog bridge of quest texts: the display name of a ware, building, soldier or any other content entry, in
 * the viewer's language and nation. It is the one selection rule for nation variants and count forms; the client's
 * domain name helpers delegate to it.
 */
export interface ContentNameRequest {
  /** The amount the name stands for; `name` ignores it. */
  count: number;
  form: ContentNameForm;
}

/** Without a catalog every name is English, so English number rules apply whatever the viewer's locale is. */
const nameLocale = (context: QuestTextContext) => context.catalog ? context.locale : SCRIPT_FALLBACK_LANGUAGE;

const translateContent = (text: ContentText, context: QuestTextContext, values?: MessageValues) => {
  if (context.catalog) return context.catalog.translate(text.key, text.en, values);
  return values ? formatSourceMessage(text.en, values) : text.en;
};

const numberFormats = new Map<string, Intl.NumberFormat>();
const formatCount = (count: number, locale: string) => {
  let format = numberFormats.get(locale);
  if (!format) numberFormats.set(locale, format = new Intl.NumberFormat(locale));
  return format.format(Math.round(count));
};

/** A building's nation-specific name (`text.variants[nation]`), else its generic name. */
const buildingText = (entry: ContentEntry, nation: string | undefined) => {
  const { name, variants } = entry.text;
  return nation && variants && Object.hasOwn(variants, nation) ? variants[nation]! : name;
};

/** English pluralizes the building noun; the other languages keep the name unchanged after a number. */
const buildingNameForCount = (entry: ContentEntry, count: number, context: QuestTextContext) => {
  const name = translateContent(buildingText(entry, context.nation), context);
  return count === 1 || nameLocale(context) !== SCRIPT_FALLBACK_LANGUAGE ? name : `${name}s`;
};

/** The nation's troop name (`<nation>.singular|plural` variants); nations without a roster use the fallback one. */
const soldierName = (entry: ContentEntry, plural: boolean, context: QuestTextContext) => {
  const form = plural ? "plural" : "singular";
  const variants = entry.text.variants ?? {};
  const text = variants[`${context.nation}.${form}`] ?? variants[`${TROOP_NAME_FALLBACK_NATION}.${form}`];
  return translateContent(text ?? entry.text.name, context);
};

/** Entries with an ICU plural text ("Sword"/"Swords"); mass nouns and already plural names have none. */
const pluralTextName = (entry: ContentEntry, count: number, context: QuestTextContext) => {
  const { name, plural } = entry.text;
  return plural ? translateContent(plural, context, { count }) : translateContent(name, context);
};

const singularName = (entry: ContentEntry, context: QuestTextContext) => {
  if (entry.kind === "building") return translateContent(buildingText(entry, context.nation), context);
  if (entry.kind === "soldier") return soldierName(entry, false, context);
  return translateContent(entry.text.name, context);
};

const nameForCount = (entry: ContentEntry, count: number, context: QuestTextContext) => {
  if (entry.kind === "building") return buildingNameForCount(entry, count, context);
  if (entry.kind === "soldier") return soldierName(entry, count !== 1, context);
  return pluralTextName(entry, count, context);
};

/** An id the catalog does not know (an older save): its key, capitalized. */
const unknownContentName = (contentId: string) => {
  const key = contentId.slice(contentId.indexOf(":") + 1);
  return `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
};

const entryName = (entry: ContentEntry, request: ContentNameRequest, context: QuestTextContext) =>
  request.form === "name" ? singularName(entry, context) : nameForCount(entry, request.count, context);

/** The display name of the catalog entry `contentId` (`<kind>:<key>`) for one viewer. */
export const contentDisplayName = (contentId: string, request: ContentNameRequest, context: QuestTextContext) => {
  const entry = getContentEntry(context.contentAlias ? context.contentAlias(contentId) : contentId);
  const name = entry ? entryName(entry, request, context) : unknownContentName(contentId);
  return request.form === "counted" ? `${formatCount(request.count, nameLocale(context))} ${name}` : name;
};
