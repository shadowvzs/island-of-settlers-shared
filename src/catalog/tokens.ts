import { entriesOfKind } from "./loader.ts";
import { fillPathTokens, type PathTokenValues } from "./paths.ts";
import type { ContentEntry, VariantAxes } from "./types/index.ts";
import type { RecipeId } from "./types/refs.ts";

/** The values of one declared axis: a list, every nation for "all", or every integer of a range. */
const axisValues = (declared: VariantAxes[keyof VariantAxes]): readonly (number | string)[] => {
  if (declared === "all") return entriesOfKind("nation").map(nation => nation.key);
  if (Array.isArray(declared)) return declared;
  if (!declared || typeof declared !== "object") return [];
  const { max, min } = declared as { max: number; min: number };
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
};

/** Every token combination of an entry: `key`, `code` and each value of each declared variant axis. */
export const entryTokenValues = (entry: ContentEntry): PathTokenValues[] => {
  let combinations: Record<string, number | string>[] = [{ code: entry.code ?? "", key: entry.key }];
  for (const [axis, declared] of Object.entries(entry.variants ?? {})) {
    const values = axisValues(declared);
    combinations = combinations.flatMap(combination => values.map(value => ({ ...combination, [axis]: value })));
  }
  return combinations;
};

/** The concrete model recipe id of an entry instance (template tokens filled); undefined without a recipe model. */
export const modelRecipeId = (entry: ContentEntry, values: PathTokenValues): RecipeId | undefined =>
  entry.model?.kind === "recipe" ? fillPathTokens(entry.model.recipe, values) as RecipeId : undefined;

/** Every concrete model recipe id an entry's template expands to over its declared axes (no duplicates). */
export const modelRecipeIds = (entry: ContentEntry): readonly RecipeId[] => {
  const model = entry.model;
  if (model?.kind !== "recipe") return [];
  return [...new Set(entryTokenValues(entry).map(values => fillPathTokens(model.recipe, values) as RecipeId))];
};
