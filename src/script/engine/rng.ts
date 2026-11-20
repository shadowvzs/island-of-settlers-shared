/**
 * The script's own deterministic random stream (design §4.4): a 32-bit state saved in `ScriptRunState.rng`,
 * advanced only when `random` or a `random` query pick is evaluated. Integer arithmetic only (`Math.imul`).
 */

/** One step: the next 32-bit state and a uniform number in [0, 1). */
export const nextRandom = (state: number): { state: number; unit: number } => {
  const next = (state + 0x6d2b79f5) >>> 0;
  let mixed = Math.imul(next ^ (next >>> 15), next | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return { state: next, unit: ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296 };
};

/** Integer bounds draw an integer in [min, max]; other bounds a number in [min, max). Swapped bounds are fixed. */
export const randomBetween = (unit: number, first: number, second: number) => {
  const min = Math.min(first, second);
  const max = Math.max(first, second);
  if (Number.isInteger(min) && Number.isInteger(max)) return min + Math.floor(unit * (max - min + 1));
  return min + unit * (max - min);
};
