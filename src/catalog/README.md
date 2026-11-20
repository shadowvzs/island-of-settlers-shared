# Content catalog

The single source of every game content definition (wares, buildings, units, animals, props, decorations, items,
offers, nations). Plan: `docs/plans/content-catalog-plan-2026-11-11.md`; owner answers at its end are binding.
The client, the API, the verifier/server replay bundle and the tools import this folder only. No other module
defines a content list; guard tests fail when one appears.

## Layout

```text
catalog/
  index.ts        loader (lazy, built once, frozen) and lookups; re-exports types, validator, helpers
  constants.ts    kinds, id/key/family/tag/translation-key patterns, asset roots
  family.ts       familyMatches, toContentId, splitContentId
  sidecars.ts     lazy sidecar loader (importers injected by the caller)
  tuning/         per-table accessor modules of the tuning sidecars (not re-exported by index.ts)
  balance/        economy formulas over data/balance.json (not re-exported by index.ts)
  ai/             computer factions' build programs over data/ai/<style>.json (not re-exported by index.ts)
  types/          entry, refs and one file per kind payload
  validate/       validateCatalog: one payload rule per kind (kinds.ts), reference checks (refs.ts)
  data/           JSON only (plus data/index.ts, the list of core files, and data/buildings/index.ts)
    buildings/    one core file per building (`<key>.json`, menu order in buildings/index.ts); sidecars go
                  below `buildings/<key>/`
```

## Core and sidecars (owner 2026-11-11)

- The **core catalog** is loaded eagerly at first page load (e.g. the nation picker), so it stays small: ids,
  translation keys, icons, categories, families, tags and small rules or tables.
- **Heavy per-entry data** lives in **sidecar** JSON files in this same folder, loaded lazily when needed:
  navigation cells, door/approach geometry, stock layout, construction data. Example:
  `data/buildings/<key>/<nation>.nav.json`. The core entry keeps only the reference:
  `"sidecars": { "navigation": { "path": "buildings/woodcutter/{nation}.nav.json" } }`.
- Sidecar paths are relative to `data/`, end in `.json` and may use the same tokens as asset paths. The validator
  checks their form; the shared test checks that every concrete sidecar path exists.
- `createSidecarLoader(importers)` imports, freezes and caches each sidecar on first use. The client passes a lazy
  `import.meta.glob` map, Node a file reader; the catalog never resolves files itself.

## Tuning sidecars (owner 2026-11-11, lane CAT-TUNING)

- Serializable species and model tuning is data in `data/tuning/`: `wildlife-profiles.json` (`animal:*` behaviour
  profiles), `models/birds.json`, `models/butterflies.json`, `models/fish.json`, `models/whales.json` and
  `models/plants.json` (ornamental plant model parameters keyed by `decoration.plant.species`). Every file is a record
  keyed by entry key; each owning entry references it as `"sidecars": { "tuning": { "path": "tuning/..." } }`.
- Code keeps only behaviour: functions and derivation rules (wildlife slope `DMath.tan` of `maxSlopeDegrees`, a null
  `maxForestDepth` meaning unlimited, the plant crown base by form, butterfly paint/marking recipes, `sampleProfile`).
- Loading, per table: every tuning table is read **synchronously at module init** through its accessor module
  `tuning/<table>.ts` (client alias `@shared/catalog/tuning/<table>`), which imports the JSON statically. Wildlife
  profiles must be: the simulation and the verifier need them deterministically before the first tick. The render
  tables (birds, butterflies, fish, whales, plants) are read by module-level constants of their consumers (flyer atlas
  worker, audio sources, fish pools, renderer layers, sim-side plant clearance), so an async gate would have to precede
  every entry point (game, editor, replay viewer, showcases, icon tools, workers, tests). The accessor modules are not
  re-exported by `index.ts`: each sidecar is bundled into its consumer's chunk, never into the core catalog chunk.
  `createSidecarLoader` stays the path for heavy data that a caller can await (building sidecars).
- `validateTuningSidecars` (Node check and tests): plain JSON, one record per owning entry and no orphan, per-table
  field rules (colours in 0..1, ranges min <= max, increasing profile points, known enums), and every owning entry
  referencing its sidecar. A new species needs its tuning record in the same commit.

## Nation terrain affinity (NATION-TERRAIN, owner 2026-11-18)

- Every `nation` entry may carry `nation.terrainAffinity` (`NationTerrainAffinity`): the homeland's grass/cover plant
  ids, ground materials and render-only variants, palette default plus the palette values it is typical of, tree-mix
  lean (broadleaf/conifer/forest/palms) and water lean (rivers/wetness). It is content, read by the map editor
  tooltips and by the world generator as a bias.
- The shared vocabularies live in `terrain.ts` (palette ids, ground materials, ground variants); the client
  re-exports the palette ids from its ground-palette module rather than keeping a second list.
- `validate/nation-terrain.ts` checks the payload: known values, non-empty distinct lists where required, plant ids
  that exist in the catalog, palette typical lists including their default, and numeric ranges. A nation without an
  affinity keeps the temperate defaults.

## Building sidecars (lane CAT7)

- Every active building core entry references two sidecars: `buildings/<key>/rules.json` (`BuildingRules`: role,
  worker `settler:*`, work animation, recipe art inputs, progression tier, unlock level, limits incl. the colony
  rule, levels with their family, effects and expanded upgrade costs, production with nation overrides and shipyard
  `modes` that name what they build, output shelf, storage, military, residence, territory) and
  `buildings/<key>/construction.json` (`BuildingConstruction`). Retired stubs have none.
- Like the tuning sidecars they are simulation data: `catalog/building-data/rules.ts` and `construction.ts`
  (client alias `@shared/catalog/building-data/<module>`) import them synchronously through
  `data/buildings/{rules,construction}-index.ts`, so they ship with the simulation chunk, never with the core
  catalog. `validateBuildingSidecars` (Node check, tests) checks fields, references and the construction rule.
- The legacy tables (`BUILDING_CATALOG`, `PRODUCTION_RULES`, `GARRISON_CAPACITIES`, `TERRITORY_RADII`, …) are
  views over these files in the client; numeric `BuildingType` stays a typed enum guarded 1:1.

## Building geometry (lane CAT8)

- Every active building references `buildings/<key>/geometry.json` (`BuildingGeometry`: reserved plot cells and
  the one recipe-to-grid scale, door hinge/width/height/spring/profile, door-swing reservations, logistics anchors,
  worker exit, mechanism, model origin offset, rotor sweeps) and `buildings/<key>/navigation/{nation}.json`
  (`BuildingNavigationFile`: per level 1-5 the rooms, structural obstacles and stock displays the public walkable
  area avoids; a number repeats an earlier level). Recipe units unless the field says fitted grid units.
- Placement geometry is nation independent (the Roman base recipe sizes every nation). The walkable area is
  nation specific; a nation whose walkable area equals the Roman one has no file and reuses the Roman one.
- Generated, never hand edited: `npm run building-geometry` (`C/tools/catalog/building-geometry.ts`, step 2 of
  `npm run building-assets`) evaluates the recipes once and writes the files and `geometry-index.ts` /
  `navigation-index.ts`. The client's permanent `tests/building-geometry-contract.slow.test.ts` fails when a
  recipe and the stored data disagree.
- Loading: `building-data/geometry.ts` is small and synchronous (`buildingGeometry`, `requireBuildingGeometry`).
  Navigation is large (about 1.9 MB raw / 125 KB gzip per nation) and lazy: `loadBuildingNavigation(nation)` runs
  before a simulation of that nation starts (client boot, map editor, verifier bundle, test setup); the
  synchronous reads then find it in memory. A nation that was not loaded falls back to evaluating its recipes
  once (with a console warning).
- Encoded volume: `[minX, minY, minZ, maxX, maxY, maxZ, shape?, yaw?, id?]`. `validateBuildingSidecars` checks
  the geometry fields and every navigation file's structure.

## Construction costs (owner 2026-11-11: authored per nation, CAT8)

- Every active building's `construction.json` holds **authored receipts**: `cost` (the shared base receipt, used
  without a nation context) and `nations.<nation>` (what that nation pays). These are the pre-CAT7 costs, restored
  exactly: the national timber/stone preferences (Roman, Chinese, Persian, Maya, Indigenous +1 plank; Viking +1
  plank −1 stone; Japanese +1 stone; Nubian −1 plank +1 stone) and the Indigenous cloth receipts (cloth for most
  buildings, less stone; textile producers and the headquarters free of cloth). `getConstructionCost(code, nation)`
  reads `nations[nation]`, else `cost`.
- Authored exceptions carry `fixed: true`: the free headquarters and the all-tier monument (the Indigenous
  monument receipt adds 20 cloth and halves the stone, as before). The Indigenous starter cloth is unchanged.
- **Unified default** (CAT7, `building-data/construction-formula.ts`), only for a building **without authored
  receipts** (no `nations`, not `fixed`): planks and stone scaled by footprint, height and triangles,
  `points = cells / 12 + height / 3 + triangles / 5000`, `total = max(2, round(points))`,
  `stone = max(1, round(total × 0.4))`, `planks = total − stone`; every nation pays it. The inputs are measured at
  build time from the High, base-level Roman model by `npm run building-construction` (first step of
  `npm run building-assets`); the tool re-measures inputs but never overwrites authored receipts. The validator
  checks the unified rule only for such default entries.

## Audio (lane AUDIO-CATALOG, owner 2026-11-12)

- `sound:*` (`data/sounds.json`) and `music:*` (`data/music.json`) list every sound and music track the client
  ships; map scripts (`playSound`, `playMusic`) and the editor's audio picker choose from them. The payload
  (`sound` / `music`, `AudioPayload`) holds `source` (`{ kind: "file", file: <asset> }` for a shipped `.ogg`/`.mp3`
  under `clientAssets`, or `{ kind: "cue", cue: "cue:<group>.<name>" }` for a sound the client synthesizes),
  `type` (`music` for every track; `ambient`, `effect` or `fanfare` for a sound; tags refine it: `bird`, `weather`,
  `military`, ...), `durationSeconds` (approximate for cues), `loop`, `licence` and `credits` (the shipped licence
  text). The name is `text.name` (`key` = Lingui id, `en` = English name). Music adds
  `collection` (a nation key or `neutral`); its category is `music.<collection>`, the music player's collection.
- A music key is the render pipeline's track id (`assets/audio/midi/catalog.json`, the file name without `.ogg`).
- The music player's playable list is this catalog (`bundledMusicTracks` in the client's `music-catalog.ts`; guard
  `tests/music-catalog.test.ts`). No other module lists tracks; `assets/audio/midi/catalog.json` is only the render
  pipeline's record (hashes), kept equal by a test and never imported by the game.
- Guards: `tests/catalog-audio.test.ts` fails when an entry's file or credits text is missing, when a shipped audio
  file under the client `assets/` is not listed, or when a file is listed twice. Only processed, licence-checked
  assets are listed; a new audio file needs its entry (and the id snapshot) in the same commit.
- Uploaded map audio (`world.audioAssets`) is not catalog content: see `src/script/audio.ts`.

## Bandit sites (lane CAT7)

- `bandit:*` (`data/bandits.json`) is its own kind with own codes 0–2. Saves, map files and render frames store a
  site as `bandit: { code, layout }` (`BanditSiteRef`: the `bandit:` code and the index into `bandit.models`; lane
  BANDIT-CODES, 2026-11-11). `bandit.militaryBuilding` (`building:guardhouse|watchtower|fortress`) names the building
  whose military rules the site borrows; the run-time `typeId` of a site is derived from it
  (`banditMilitaryBuildingCode`) and checked on load. The retired format (building type 2/4/9 plus
  `enemyCampModel` in saves, `model` in map files) is converted once on load (`banditByMilitaryBuilding`).
  Names keep the `domain.bandit.*` ids (`text.name`, `variants.enclosure|tier|tower`).

## Entries

Kinds with data: nations, wares, decorations, items, offers, ground props, deposits, life (animals, critters, fish,
whales, birds, butterflies), settlers, soldiers, commanders, ships, boats, buildings (core entries and sidecars),
bandit sites, sounds and music.

- `id = "<kind>:<key>"`: `ware:logs`, `building:woodcutter`, `nation:roman`.
- `key` is the **already persisted identifier** (save, ledger, map, command log). It never changes. Exceptions
  where the persisted value is not a valid key: settlers persist their English job string in `settler.job`
  ("Iron founder"; key `ironFounder`), buildings persist only `code` (BuildingType; key `woodcutter`).
- `code` is the persisted numeric code where the sim/save uses numbers (BuildingType, PROP byte, CRITTER byte).
  Typed TS constants for these enums may stay for readability, guarded 1:1 against the catalog codes.
- Retired entries stay with `"retired": true`; ids are never reused. Removing an id fails the id snapshot test
  (`tests/fixtures/catalog-ids.snapshot.json`); adding one requires a snapshot update in the same commit.
- `family` is a dotted path, most general first (`animal.deer`, `building.military`). A selector matches on dot
  boundaries: `familyMatches("animal", "animal.deer")` is true. `category` is the UI tab (`data/categories.json`),
  `tags` are orthogonal sets (`tool`, `food`, `huntable`).
- `variants` declares the qualifier axes an instance may carry (`nation`, `level`, `rank`, `finish`, `form`).
  Instances (runtime/map objects) never live in the catalog. `qualifierIssues` checks trigger qualifiers.

## Text and translation

- `text.name.key` (and `plural`, `description`, `variants.*`) is the **explicit Lingui message id**. Existing ids
  are kept verbatim (`domain.ware.logs`, `domain.nation.roman`); new entries use `content.<kind>.<key>.<field>`.
- `text.<field>.en` is the English source: the Lingui source message and the only text the server and the
  Lingui-free simulation use. The catalog never imports Lingui.
- The client's Lingui extractor reads these JSON files, so no `msg()` mirror module is needed.
- Building role texts (the short "what this building does" line of the build menu) are `{ key, en }` texts in the
  rules sidecar: `role` and `nations.<nation>.role`, ids `content.building.<key>.role[.<nation>]`. Buildings with the
  same English role and meaning share one id (the three residences; guardhouse and barracks). The client resolves
  them with `displayBuildingRole` (`src/shared/i18n/building-role.ts`); `buildingRoleText(code, nation)` picks the
  nation override. The extractor reads the sidecars too, so a new role only needs `lingui extract` and translations.

## References

| Reference | Format | Resolved by |
|---|---|---|
| Content entry | `"<kind>:<key>"` | catalog lookups |
| Ware inside goods or costs | bare ware key (`"logs"`) | `entryByKey("ware", key)` |
| Code algorithm | `"rule:<area>.<name>"` | registry in the owning module |
| Model, code-built | `{ "kind": "recipe", "recipe": "recipe:<kind>.<key>[.{nation}][.level{level}]" }` | client registry |
| Model, authored | `{ "kind": "glb", "asset": <asset> }` | client asset glob |
| Audio cue | `"cue:<group>.<name>"` | audio cue registry (client) |
| Asset | `{ "root": "clientAssets" \| "clientPublic" \| "workerRepo", "path": "ware-icons/{key}.png" }` | client resolver |
| Sidecar | `{ "path": "buildings/{key}/{nation}.nav.json" }` | `createSidecarLoader` |

### Default references per data file (owner answer 62; icons: owner decision 2026-11-11)

`data/defaults.json` holds the `icon`, `model` and `sidecars` references every entry of one data file shares, keyed
by the file name (`"decorations/plants.json": { "model": { "kind": "recipe", "recipe": "recipe:decoration.{key}" },
"sidecars": { "tuning": … } }`; wares share `"icon": { "root": "clientAssets", "path": "ware-icons/{key}.png" }`).
An entry writes `icon`, `model` or `sidecars` only where it differs; its own field replaces the default as a whole.
`data/index.ts` fills the defaults in once at module load (`defaults.ts`; `{key}` in a default recipe id becomes the
entry key, while an icon path keeps its tokens for the client resolver), so the loader, the validator and every reader
see the same resolved entry as before. `tests/catalog-ref-defaults.test.ts` locks the resolved model, sidecar and icon
references of every entry and fails on an entry that repeats its file's default. Buildings keep their references in
their own file (one building = one file; retired stubs have no model).

Recipe ids may be templates: their `{token}`s follow the asset path rules and fill per instance
(`modelRecipeId(entry, { level: 3, nation: "maya" })` is `recipe:building.mill.maya.level3`; `modelRecipeIds(entry)`
lists every expansion). The id names geometry only: detail (High/Minimal), finish materials and seeds are builder
inputs. The client test `content-catalog-model-recipes.test.ts` requires every expansion to be registered and every
registered id to be named by an entry.

Asset paths are POSIX paths relative to their root, without `.`/`..` segments. Tokens in braces are `code`, `key`
or a declared variant axis. The server treats asset refs as opaque strings. Registries import only the catalog's
id types; the catalog never imports registries, renderers, Lingui, Three.js, the DOM or client code. Its only
outside import is the dependency-free shared validation kit (`src/validation/`, UNIFY-B3): guards, issue sink and
the strict object check behind `checkFields`.

## Data and validation

- Data is plain JSON: no functions, getters, classes, `Map`/`Set`, `undefined`, `NaN` or `Infinity`.
- `validateCatalog` is runtime **data** validation (fields, types, unique ids/codes/translation keys, categories,
  families, tags, references, asset and sidecar paths). It runs in tests, the client Vite build/dev start and at
  API start-up, never in the production client. It is separate from TypeScript type checking.
- `contentCatalogVersion()` is a content hash of the core catalog. Map files store the version they were authored
  with; the map editor warns when a loaded map was authored with a different version.
- The verifier source fingerprint includes this package, so a content change yields a new `SOURCE_VERSION`.

## Balance (lane CAT10, owner answer 34)

- `data/balance.json` holds the owner-tunable economy tables: the level curve, material tiers with their unlock
  levels, daily quest numbers and ware lists (stone-material quests, excluded wares and donations, tutorial reserve
  wares), adventure camps and rewards, colony lifetime, Monument bonus, talents, trade values and market rules, the
  Market screen's 12 wares (owner 2026-11-11: a multiplayer mock), starter stock and road speeds.
- `balance/*.ts` are the pure formulas over it (level rewards, quest material, relief quest wares, adventure loot,
  talent caps, `createEconomyCatalog` for `GET /v1/economy/game-catalog`). Client alias `@shared/catalog/balance`;
  the API imports `catalog/balance/index.ts` directly. There is no generated copy.
- Not re-exported by `index.ts`: quest wares read the building rules sidecars, so the module loads with the
  simulation chunk, like the building sidecars.
- Trade values are whole value units (100 = 1 gem); their key order is the merchant market's ware order and must
  stay stable. `validateBalance` (Node check, tests) requires every ware/nation reference to exist, material tiers
  in order and the trade-value keys to equal the wares flagged `ware.economy.trade`.
- Ship deck capacity is not balance data: it is the `ship:sailingShip` entry's `capacity` (`shipDeckCapacity()`).
- Ware categories (owner 2026-11-11): `ware.food` is edible food only (fish, meat, bread), `ware.drink` beer and the
  nation drinks, `ware.foodChain` the food-chain ingredients (grain, flour, water, pig, raw drink ingredients).

## Build programs (lane EAI3a, enemy economy AI plan §3.4)

- `data/ai/<style>.json` is a style's build program (`BuildProgram`): goals in build order, each a building
  (`building:*`, one goal per building) with its group, weight, target count curve (`{ buildings, count }`: from that
  many own buildings, sites included, on) and earlier goals that must stand finished first; `nations` limits a goal
  to the computer nations that need it (the Indigenous cloth chain). Groups carry the style factor, the posture
  factors (`grow`, `fortify`; percent) and whether their workers are exposed to known enemies. The program also sets
  the commitment margin, the cost weight and the threat penalty, and the economy manager's stock targets (`stock`,
  lane EAI3c: a default and per-ware targets per posture, and the resume margin below them). Lane EAI5a: `balanced`,
  `turtle` (towers early, a watchtower goal, a later Academy) and `aggressive` (the weapons chain right after the
  first residences, an early Academy); the optional `strategy` (`StyleStrategy`) sets the posture a style plays
  while calm and scales its level's offensive row (first attack, strength, ratio, raids, back-off) and its soldier
  reserve; absent, `DEFAULT_STYLE_STRATEGY` (the balanced play). An unknown style plays `balanced`
  (`buildProgramOf`). `turtle` and `aggressive` are overlays (`BuildProgramOverlay`, `extends: "balanced"`): only
  their differences (`removeGoals`, per-goal field `goals`, `addGoals`, `goalOrder`, `groups`, `stock`, scalars,
  `strategy`), resolved once at load by `applyProgramOverlay`; a goal added to `balanced` reaches every style.
- `ai/build-programs.ts` imports them synchronously (client alias `@shared/catalog/ai/<module>`), so they load with
  the simulation chunk.
- `validateBuildPrograms` (Node check, tests): the shape, unique goals in build order, known groups and placeable
  buildings, and for every nation that the goals' production inputs and construction wares are produced by goals
  that nation plays (start stock only seeds the chains); every stock target lies above the resume margin and names a
  ware a goal produces. Each issue (`BuildProgramIssue`) carries its program, kind, goal, nation and ware as data.
- Upkeep after a building, ware, recipe or construction cost change: `npm run ai:check` and `npm run ai:suggest` in
  the client (docs/reference/dev-tools.md, TOOL-7). `data/ai/drafts/` holds the suggestion drafts; nothing loads it.

## Imports

- Client: `@shared/catalog` (alias to this folder). API: relative imports (`../../island-of-settlers-shared/...`).
- Everything outside `catalog/` imports `catalog/index.ts`, `catalog/balance/index.ts` or a `catalog/tuning/<table>.ts`
  accessor; nothing imports
  `data/*.json` directly.

## Adding a kind (lane checklist)

1. Add the payload type in `types/<kind>.ts` and extend `ContentEntry` in `types/index.ts`.
2. Add the payload rule in `validate/kinds.ts` and the data file in `data/` plus `data/index.ts`.
3. Write the data once from the legacy modules, add a parity test, switch consumers, delete the legacy lists and
   shrink the client guard allowlist (`island-of-settlers-client/tests/fixtures/catalog-migration-allowlist.json`).
4. Update the id snapshot.
