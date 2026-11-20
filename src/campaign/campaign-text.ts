/**
 * Story/editor text stored in data, not in PO catalogs (plan item 51): one string per language code.
 * English (CAMPAIGN_FALLBACK_LANGUAGE) is required and is the fallback for every other language.
 */
export type TranslatableText = { readonly en: string } & { readonly [language: string]: string | undefined };

export const createTranslatableText = (en = ""): TranslatableText => ({ en });

/** The text in `language`, or the English fallback when that translation is missing or blank. */
export const resolveTranslatableText = (text: TranslatableText, language: string) => {
  const translated = text[language];
  if (translated === undefined || !translated.trim()) return text.en;
  return translated;
};

/** Languages of `languages` whose translation is missing or blank, in the given order. */
export const missingTranslations = (text: TranslatableText, languages: readonly string[]) =>
  languages.filter(language => !text[language]?.trim());
