/** Named values of a message template (`{name}` placeholders and simple plurals). */
export type MessageValues = Readonly<Record<string, unknown>>;

const SIMPLE_PLURAL = /\{(\w+), plural, one \{([^}]*)\} other \{([^}]*)\}\}/g;
const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * The one source-text fallback (UNIFY-A item 3): renders a message without a locale catalog. Simple one/other ICU
 * plurals are resolved first (`#` becomes the count), then named values; a placeholder without a value stays as
 * written. The client's `translateMessage` and the quest text resolver both use it.
 */
export const formatSourceMessage = (source: string, values: MessageValues) => {
  const withPlural = source.replace(SIMPLE_PLURAL, (_, key: string, one: string, other: string) => {
    const value = Number(values[key] ?? 0);
    return (value === 1 ? one : other).replace(/#/g, String(value));
  });
  return withPlural.replace(PLACEHOLDER, (placeholder, key: string) =>
    key in values ? String(values[key]) : placeholder);
};
