import type { TranslatableText } from "../../campaign/campaign-text.ts";
import type { ScriptEventKind } from "./events.ts";

/**
 * Sentence phrasings of the events with two actor slots (owner 2026-11-11). The engine indexes a subscription under
 * its most selective actor slot (TRG2), so "a hunter kills a deer" and "a deer is killed by a hunter" are the same
 * event kind with the same slots; the inverse phrasing only presents the slots in the other order. It is editor
 * presentation: `ScriptEvent.phrasing` remembers the author's choice, validation and the engine ignore it.
 */

export type EventPhrasingKind = "primary" | "inverse";

export interface EventPhrasing {
  /** An optional slot that must be filtered for this phrasing to make sense (the editor offers it only then). */
  requires?: string;
  /** Slot names in sentence order; the first is the sentence's lead. A permutation of the event's slots. */
  order: readonly string[];
  /** `{slot}` placeholders name the event's slots; `{player}` is the event player filter. */
  sentence: TranslatableText;
}

export interface EventPhrasingPair {
  inverse: EventPhrasing;
  primary: EventPhrasing;
}

const pair = (
  primary: readonly string[], primaryEn: string, primaryHu: string,
  inverse: readonly string[], inverseEn: string, inverseHu: string
): EventPhrasingPair => ({
  inverse: { order: inverse, sentence: { en: inverseEn, hu: inverseHu } },
  primary: { order: primary, sentence: { en: primaryEn, hu: primaryHu } }
});

export const EVENT_PHRASINGS: Readonly<Partial<Record<ScriptEventKind, EventPhrasingPair>>> = Object.freeze({
  actorDamaged: {
    inverse: { order: ["source", "subject", "percent"], requires: "source", sentence: {
      en: "{source} damages {player}'s {subject} (below {percent}%)",
      hu: "{source} megsebzi {player} {subject} egységét ({percent}% alatt)" } },
    primary: { order: ["subject", "source", "percent"], sentence: {
      en: "{player}'s {subject} is damaged by {source} (below {percent}%)",
      hu: "{player} {subject} egysége sebzést kap tőle: {source} ({percent}% alatt)" } }
  },
  actorKilled: pair(
    ["killer", "victim"], "{player}'s {killer} kills {victim}", "{player} {killer} egysége megöli: {victim}",
    ["victim", "killer"], "{player}'s {victim} is killed by {killer}", "{player} {victim} egységét megöli: {killer}"),
  animalKilled: pair(
    ["killer", "victim"], "{player}'s {killer} kills {victim}", "{player} {killer} vadásza elejti: {victim}",
    ["victim", "killer"], "{victim} is killed by {player}'s {killer}", "{victim} elejtője {player} {killer} vadásza"),
  cameNear: pair(
    ["subject", "target", "radius"], "{player}'s {subject} comes within {radius} of {target}",
    "{player} {subject} egysége {radius} mezőn belül ér ehhez: {target}",
    ["target", "subject", "radius"], "{target} is approached within {radius} by {player}'s {subject}",
    "{target} közelébe ({radius} mező) ér {player} {subject} egysége"),
  cameNearMoving: pair(
    ["subject", "target", "radius"], "{player}'s {subject} comes within {radius} of the moving {target}",
    "{player} {subject} egysége {radius} mezőn belül ér a mozgó {target} közelébe",
    ["target", "subject", "radius"], "the moving {target} is approached within {radius} by {player}'s {subject}",
    "a mozgó {target} közelébe ({radius} mező) ér {player} {subject} egysége"),
  soldierRecruited: pair(
    ["soldier", "building"], "{player}'s {soldier} is recruited in {building}",
    "{player} {soldier} katonát toboroz itt: {building}",
    ["building", "soldier"], "{building} trains {player}'s {soldier}",
      "{building} kiképzi {player} {soldier} katonáját"),
  enteredBuilding: pair(
    ["subject", "building"], "{player}'s {subject} enters {building}",
      "{player} {subject} egysége belép ide: {building}",
    ["building", "subject"], "{building} is entered by {player}'s {subject}",
    "{building} épületbe belép {player} {subject} egysége"),
  leftBuilding: pair(
    ["subject", "building"], "{player}'s {subject} leaves {building}",
      "{player} {subject} egysége elhagyja: {building}",
    ["building", "subject"], "{building} is left by {player}'s {subject}",
    "{building} épületet elhagyja {player} {subject} egysége"),
  garrisoned: pair(
    ["subject", "building"], "{player}'s {subject} garrisons {building}",
    "{player} {subject} katonája beköltözik ide: {building}",
    ["building", "subject"], "{building} is garrisoned by {player}'s {subject}",
    "{building} helyőrsége lesz {player} {subject} katonája"),
  leftGarrison: pair(
    ["subject", "building"], "{player}'s {subject} leaves the garrison of {building}",
    "{player} {subject} katonája elhagyja ennek a helyőrségét: {building}",
    ["building", "subject"], "{building} loses {player}'s {subject} from its garrison",
    "{building} helyőrségéből távozik {player} {subject} katonája"),
  boardedShip: pair(
    ["subject", "ship"], "{player}'s {subject} boards {ship}", "{player} {subject} egysége beszáll ide: {ship}",
    ["ship", "subject"], "{ship} is boarded by {player}'s {subject}",
      "{ship} hajóra beszáll {player} {subject} egysége"),
  disembarked: pair(
    ["subject", "ship"], "{player}'s {subject} leaves {ship}", "{player} {subject} egysége kiszáll innen: {ship}",
    ["ship", "subject"], "{ship} unloads {player}'s {subject}", "{ship} hajóról kiszáll {player} {subject} egysége"),
  wareDelivered: pair(
    ["subject", "building", "ware"], "{player}'s {subject} delivers {ware} to {building}",
    "{player} {subject} szállítója {ware} árut visz ide: {building}",
    ["building", "subject", "ware"], "{building} receives {ware} from {player}'s {subject}",
    "{building} {ware} árut kap {player} {subject} szállítójától"),
  buildingOccupied: pair(
    ["building", "job"], "{player}'s {building} is occupied by a {job}",
    "{player} {building} épületébe beköltözik egy {job}",
    ["job", "building"], "a {job} starts work at {player}'s {building}",
    "egy {job} munkába áll {player} {building} épületében"),
  catapultFired: pair(
    ["tower", "target"], "{player}'s {tower} fires at {target}", "{player} {tower} tornya lő erre: {target}",
    ["target", "tower"], "{target} is fired at by {player}'s {tower}", "{target} felé lő {player} {tower} tornya"),
  catapultHit: pair(
    ["tower", "target"], "{player}'s {tower} hits {target}", "{player} {tower} tornya eltalálja: {target}",
    ["target", "tower"], "{target} is hit by {player}'s {tower}", "{target} találatot kap {player} {tower} tornyától"),
  catapultMissed: pair(
    ["tower", "target"], "{player}'s {tower} misses {target}", "{player} {tower} tornya elvéti: {target}",
    ["target", "tower"], "{target} is missed by {player}'s {tower}", "{target} mellé lő {player} {tower} tornya"),
  bridgeStepped: pair(
    ["subject", "bridge"], "{player}'s {subject} steps onto {bridge}",
      "{player} {subject} egysége rálép erre: {bridge}",
    ["bridge", "subject"], "{bridge} is stepped on by {player}'s {subject}",
    "{bridge} hídra rálép {player} {subject} egysége"),
  shipDocked: pair(
    ["ship", "harbour"], "{player}'s {ship} docks at {harbour}", "{player} {ship} hajója kiköt itt: {harbour}",
    ["harbour", "ship"], "{harbour} receives {player}'s {ship}", "{harbour} kikötőbe befut {player} {ship} hajója"),
  actorUnloaded: pair(
    ["ship", "type", "region"], "{player}'s {ship} unloads a {type} in {region}",
    "{player} {ship} hajója kirak egy {type} egységet itt: {region}",
    ["type", "ship", "region"], "a {type} is unloaded from {player}'s {ship} in {region}",
    "egy {type} egység kiszáll {player} {ship} hajójáról itt: {region}"),
  treeCut: pair(
    ["by", "tree"], "{player}'s {by} fells {tree}", "{player} {by} favágója kivágja: {tree}",
    ["tree", "by"], "{tree} is felled by {player}'s {by}", "{tree} fát kivágja {player} {by} favágója"),
  treePlanted: pair(
    ["by", "tree"], "{player}'s {by} plants {tree}", "{player} {by} erdésze elülteti: {tree}",
    ["tree", "by"], "{tree} is planted by {player}'s {by}", "{tree} fát elülteti {player} {by} erdésze"),
  stonePickedUp: pair(
    ["by", "prop"], "{player}'s {by} picks up {prop}", "{player} {by} egysége felveszi: {prop}",
    ["prop", "by"], "{prop} is picked up by {player}'s {by}", "{prop} tárgyat felveszi {player} {by} egysége")
});

/** The phrasing pair of an event kind; undefined for events with fewer than two actor slots. */
export const eventPhrasings = (kind: ScriptEventKind): EventPhrasingPair | undefined => EVENT_PHRASINGS[kind];

/**
 * Resolves an authored phrasing to the stored event: always the same kind and the identity slot mapping (slots are
 * stored by name, never by position), so either phrasing yields one subscription.
 */
export const resolveEventPhrasing = (kind: ScriptEventKind, phrasing: EventPhrasingKind) => {
  const pairOf = EVENT_PHRASINGS[kind];
  const chosen = pairOf?.[phrasing];
  if (!chosen) return undefined;
  return { kind, order: chosen.order, slotMapping: Object.fromEntries(chosen.order.map(slot => [slot, slot])) };
};
