/**
 * Ids, tagged references and player filters of the map script (trigger design §4.1, §4.2). Every id-valued field of
 * a script is a tagged `ScriptRef`; a bare string is always a literal, so validation, "used by" and the import
 * remapper are one generic walk over `{ k: "ref" }` nodes.
 */

export type MapKind = "home" | "adventure" | "colony" | "campaign";

export type ActorId = string;
export type FolderId = string;
export type RegionId = string;
export type RewardId = string;
/** `s<n>`, unique inside one trigger or quest action list (stable for logs and outcomes). */
export type StepId = string;
export type TriggerId = string;
export type VariableId = string;

/**
 * What a reference points at. `content` ids are catalog ids (`animal:deer`), `family` ids are catalog family paths
 * (`animal.deer`); both are global and never remapped on import. `multiboard` and `timer` name variables of that
 * type. `exit` and `speaker` ids live in the campaign records (a map exit, a campaign speaker), not in the script.
 */
export type ScriptRefKind =
  | "actor" | "content" | "exit" | "family" | "folder" | "multiboard" | "quest" | "region" | "reward"
  | "sequence" | "shot" | "speaker" | "step" | "timer" | "trigger" | "variable";

export interface ScriptRef<K extends ScriptRefKind = ScriptRefKind> {
  id: string;
  k: "ref";
  kind: K;
}

/** Display: "Player 1" = faction 0 (the human), "Player n" = faction n - 1; neutral is not a slot. */
export type PlayerFilter =
  | { kind: "any" }
  | { faction: number; kind: "slot" }
  | { faction: number; includeSelf: boolean; kind: "alliesOf" }
  | { faction: number; kind: "enemiesOf" }
  /** Ownerless: wildlife, props, scenery, neutral actors. */
  | { kind: "neutral" }
  | { kind: "humans" }
  | { kind: "computers" }
  /** The player of the current event. */
  | { key: "triggeringPlayer"; kind: "response" };

export type PlayerFilterKind = PlayerFilter["kind"];
