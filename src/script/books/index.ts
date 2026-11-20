import { HOME_DEFAULT_SCRIPT_UID } from "../constants.ts";
import { freezeMapScript } from "../hash.ts";
import type { QuestBook } from "../types/quests.ts";
import type { MapScript } from "../types/script.ts";
import homeDefault from "./home-default.json" with { type: "json" };

let homeDefaultScript: MapScript | undefined;

/**
 * The base/default home quest pack (owner answer 45, QU §4.4): the tutorial chapters as map data, with the global
 * daily pool switched on. Home maps without their own quest book use it, and an overwritten World01 inherits it.
 * The JSON is the only source after QU8; its shape and Ready state are checked by the golden book test.
 */
export const defaultHomeScript = (): MapScript => homeDefaultScript ??= freezeMapScript({
  actors: [],
  cameraShots: [],
  folders: [],
  homeRewards: [],
  nextIds: { actor: 0, folder: 0, region: 0, reward: 0, trigger: 0, variable: 0 },
  quests: homeDefault as unknown as QuestBook,
  regions: [],
  revision: homeDefault.revision,
  scriptUid: HOME_DEFAULT_SCRIPT_UID,
  sequences: [],
  triggers: [],
  variables: [],
  version: 1
});

/** The default home quest book itself (frozen). */
export const defaultHomeQuestBook = (): QuestBook => defaultHomeScript().quests;
