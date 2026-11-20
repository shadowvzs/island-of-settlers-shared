import type { CampaignWareAmount } from "../../campaign/campaign-model.ts";
import type { ActorSelector } from "./actors.ts";
import type { QuestText } from "./quest-text.ts";
import type { ScriptRef } from "./refs.ts";

/** Mails and presentation-only UI targets (trigger design §4.12). */

/** A scripted mail in the player's inbox (generalises BattleMessage); written by the client only (§6.12). */
export interface ScriptMail {
  /** Informative ("returned home"), never a payout. */
  attachments: { goods: CampaignWareAmount[] } | null;
  body: QuestText;
  /** `gameNow` UTC ms. */
  date: number;
  /** "mail:<bookId>:<questId|triggerId>:<occurrence>" (idempotent). */
  id: string;
  island: string;
  kind: "script";
  read: boolean;
  title: QuestText;
}

export type SettingsSection = "graphics" | "sound" | "weather" | "dayMode" | "world" | "dialogueSpeed";
export type MainPanelView = "build" | "menu" | "notices" | "ships";

export type UiTarget =
  | { kind: "inventory" }
  /** Opener token; hidden quests are refused (rev m3). */
  | { kind: "quests"; quest?: ScriptRef<"quest"> }
  | { kind: "settings"; section?: SettingsSection }
  /** Its own window (rev n2). */
  | { kind: "language" }
  /** UI-only details focus, never the recorded `select` (rev M16). */
  | { actor: ActorSelector; kind: "building" }
  /** Building register / summary. */
  | { kind: "overview" }
  | { kind: "mainPanel"; view: MainPanelView }
  | { kind: "messages"; mailId?: string }
  | { kind: "talents" }
  | { kind: "market" }
  | { kind: "tradeOffice" }
  | { kind: "fleet" }
  | { kind: "expeditionPlanner" }
  | { kind: "colonyTracker" }
  | { kind: "terrainSurvey" }
  | { kind: "gemShop" };

export type UiTargetKind = UiTarget["kind"];

/** Stable `data-ui-anchor` ids on existing controls (bottom bar icons, build tabs, quest scroll button …). */
export type UiAnchorId = string;
