/** Content kinds: the id prefix and the payload discriminator (catalog README, "Ids"). */
export type ContentKind =
  | "ware" | "building" | "bandit" | "settler" | "soldier" | "commander" | "ship" | "boat"
  | "animal" | "critter" | "fish" | "whale" | "bird" | "butterfly"
  | "tree" | "stone" | "plant" | "shell" | "deposit" | "decoration"
  | "item" | "offer" | "nation" | "sound" | "music";

/** `<kind>:<key>`; the key is the persisted identifier and never changes. */
export type ContentId = `${ContentKind}:${string}`;

/** Code algorithm referenced by id (placement, production logic, habitat, AI): `rule:<area>.<name>`. */
export type RuleId = `rule:${string}`;
/** Model recipe referenced by id: `recipe:<kind>.<key>[.<nation>][.level<n>]`. */
export type RecipeId = `recipe:${string}`;
/** Audio cue referenced by id: `cue:<group>.<name>`. */
export type CueId = `cue:${string}`;

/** Folders an asset path is relative to: client `assets/`, client `public/`, the worker repo's `game_ready/`. */
export type AssetRoot = "clientAssets" | "clientPublic" | "workerRepo";

export interface AssetRef {
  /**
   * POSIX path relative to the root. Tokens in braces must be declared variant axes or `code`/`key`:
   * "ware-icons/{key}.png", "building-icons/{nation}-{code}.png".
   */
  path: string;
  root: AssetRoot;
}

export type ModelRef =
  | { kind: "recipe"; recipe: RecipeId }
  | { asset: AssetRef; kind: "glb" };

/**
 * A lazily loaded sidecar JSON file of the same catalog (heavy per-building / per-nation data:
 * navigation cells, door and approach geometry, stock layout, construction data). The path is
 * relative to `catalog/data/` and ends in `.json`; tokens follow the asset path rules.
 */
export interface SidecarRef {
  path: string;
}
