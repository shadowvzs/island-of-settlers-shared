import { buildingByKey, buildingEntries } from "../buildings.ts";
import { BUILDING_RULE_FILES } from "../data/buildings/rules-index.ts";
import { deepFreeze } from "../helpers.ts";
import type { BuildingEntry } from "../types/building.ts";
import type { BuildingRules } from "../types/building-data.ts";
import type { ContentText } from "../types/entry.ts";

/**
 * Building rules sidecars (`data/buildings/<key>/rules.json`): level costs, production, limits, unlock level,
 * garrison, storage, residence and territory. Simulation data, so they load synchronously with their consumer's
 * chunk, never with the core catalog (README, "Building sidecars"); validated by `validateBuildingSidecars`.
 */
const RULES = deepFreeze(BUILDING_RULE_FILES) as Readonly<Record<string, BuildingRules>>;

const indexByCode = () => {
  const codes: (BuildingRules | undefined)[] = [];
  for (const [key, rules] of Object.entries(RULES)) {
    const entry = buildingByKey(key);
    if (!entry) throw new Error(`No building entry for the rules sidecar ${key}`);
    codes[entry.code] = rules;
  }
  return Object.freeze(codes);
};

let byCode: readonly (BuildingRules | undefined)[] | null = null;

/** The rules of an active building code (dense array, built once); undefined for retired and unknown codes. */
export const buildingRules = (code: number): BuildingRules | undefined => (byCode ??= indexByCode())[code];

/** The role text of a building as the nation shows it (drink chain slots override it); undefined when unknown. */
export const buildingRoleText = (code: number, nation?: string): ContentText | undefined => {
  const rules = buildingRules(code);
  if (!rules) return undefined;
  return (nation ? rules.nations?.[nation]?.role : undefined) ?? rules.role;
};

/** Every active building with its rules, in ascending code order. */
export const buildingsWithRules = (): readonly { entry: BuildingEntry; rules: BuildingRules }[] =>
  [...buildingEntries()].sort((first, second) => first.code - second.code)
    .map(entry => ({ entry, rules: buildingRules(entry.code)! }));
