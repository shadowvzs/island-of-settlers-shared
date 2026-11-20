import type { MapRegion } from "../../campaign/campaign-regions.ts";
import type { CameraShot, CinematicSequence } from "../../campaign/cinematics/types.ts";
import type { ScriptActor } from "./actors.ts";
import type { QuestBook, QuestRepeat } from "./quests.ts";
import type { RewardId } from "./refs.ts";
import type { CampaignRewardEntry } from "./rewards.ts";
import type { ScriptTrigger } from "./triggers.ts";
import type { ScriptValue, ValueType } from "./values.ts";

/** The map script container (trigger design §4.1, §4.5, §4.14). */

export interface ScriptFolder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface ScriptVariable {
  comment?: string;
  id: string;
  /** Initial value; arrays carry their initial items; actor variables always start empty. */
  initial: ScriptValue;
  /** Arrays and actor groups: maximum length (≤ SCRIPT_LIMITS.arrayLength). */
  maxLength?: number;
  /** Unique (case-insensitive), `[A-Za-z][A-Za-z0-9_]*`. */
  name: string;
  /** Shown read-only in the quest window debug overlay and usable in quest texts. */
  questVisible?: boolean;
  type: ValueType;
}

/** How the occurrence key of a declared home reward is formed (§4.14). */
export type DeclaredRewardOccurrence =
  | { kind: "once" }
  | { kind: "window"; repeat: QuestRepeat }
  /** 0..maxOccurrences-1; needs the completion proof (TRG7b). */
  | { kind: "counter"; maxOccurrences: number };

/** A home reward a trigger may grant; the server pays it only through the claim ledger (§9.4). */
export interface DeclaredHomeReward {
  id: RewardId;
  /** Editor label. */
  name: string;
  occurrence: DeclaredRewardOccurrence;
  /** Recomputed by the server from this definition; the client never sends amounts. */
  rewards: CampaignRewardEntry[];
}

export interface ScriptIdCounters {
  actor: number;
  folder: number;
  region: number;
  reward: number;
  trigger: number;
  variable: number;
}

/** Everything scriptable on one map; stored in the map file header (TRG1), hashed canonically. */
export interface MapScript {
  actors: ScriptActor[];
  cameraShots: CameraShot[];
  folders: ScriptFolder[];
  homeRewards: DeclaredHomeReward[];
  /** Counters per id prefix; ids are never reused. */
  nextIds: ScriptIdCounters;
  quests: QuestBook;
  regions: MapRegion[];
  /** Admin publish counter; a run keeps the revision it started with (§6.13). */
  revision: number;
  /** Random id of this script document; kept on save/export, new on "save as"/copy (rev M5). */
  scriptUid: string;
  sequences: CinematicSequence[];
  triggers: ScriptTrigger[];
  /** Includes multiboards and timers. */
  variables: ScriptVariable[];
  version: 1;
}
