/**
 * The playable nations, in the order the nation choice lists them (unification survey §5). Account, worker,
 * commander, replay and economy code all read this one list.
 */
export const NATIONS = [
  "roman", "viking", "japanese", "nubian", "indigenous", "chinese", "persian", "maya"
] as const;

export type Nation = (typeof NATIONS)[number];

export const isNation = (value: unknown): value is Nation => NATIONS.includes(value as Nation);
