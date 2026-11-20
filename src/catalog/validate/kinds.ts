import { isPlainObject } from "../../validation/index.ts";
import type { ContentKind } from "../types/refs.ts";
import type { EntryContext } from "./entry.ts";
import type { Fields, IssueSink } from "./issues.ts";
import { AUDIO_KIND_RULES } from "./kinds-audio.ts";
import { BANDIT_KIND_RULES } from "./kinds-bandits.ts";
import { BUILDING_KIND_RULES } from "./kinds-buildings.ts";
import { LIFE_KIND_RULES } from "./kinds-life.ts";
import { PROP_KIND_RULES } from "./kinds-props.ts";
import { SHIP_KIND_RULES } from "./kinds-ships.ts";
import { SHOP_KIND_RULES } from "./kinds-shop.ts";
import { UNIT_KIND_RULES } from "./kinds-units.ts";
import { checkNationPayload } from "./nation-terrain.ts";

/** Checks one kind's payload field (`entry[payload]`); the base fields are already checked. */
export type PayloadCheck = (
  payload: unknown, path: string, sink: IssueSink, context: EntryContext, entry: Fields
) => void;

export interface KindRule {
  check: PayloadCheck;
  /** The payload field name beside the base fields. */
  payload: string;
}

const ALIAS_PATTERN = /^[a-z0-9]+$/;
const ECONOMY_SCOPES = ["ledger", "stock", "trade"];
const WARE_FIELDS = ["aliases", "boxSize", "economy", "handCarried"];

const checkWare: PayloadCheck = (payload, path, sink) => {
  if (!isPlainObject(payload)) {
    sink.add("payload", path, "A ware payload is { boxSize, economy, aliases?, handCarried? }");
    return;
  }
  const economy = payload.economy;
  const validEconomy = isPlainObject(economy) && Object.keys(economy).length === ECONOMY_SCOPES.length
    && ECONOMY_SCOPES.every(scope => typeof economy[scope] === "boolean");
  if (!validEconomy) sink.add("payload", `${path}.economy`, "economy is { ledger, stock, trade } booleans");
  const aliases = payload.aliases;
  if (aliases !== undefined && (!Array.isArray(aliases) || !aliases.every(alias => ALIAS_PATTERN.test(alias))))
    sink.add("payload", `${path}.aliases`, "Aliases are lower-case letters and digits");
  if (!Number.isInteger(payload.boxSize) || (payload.boxSize as number) < 1)
    sink.add("payload", `${path}.boxSize`, "boxSize is a positive integer");
  if (payload.handCarried !== undefined && payload.handCarried !== true)
    sink.add("payload", `${path}.handCarried`, "Only true");
  for (const field of Object.keys(payload))
    if (!WARE_FIELDS.includes(field)) sink.add("payload", `${path}.${field}`, "Unknown field");
};

/** Payload rules of the kinds that have data; a lane adds its kind here together with its data file. */
export const KIND_RULES: Readonly<Partial<Record<ContentKind, KindRule>>> = {
  ...AUDIO_KIND_RULES,
  ...BANDIT_KIND_RULES,
  ...BUILDING_KIND_RULES,
  ...LIFE_KIND_RULES,
  ...PROP_KIND_RULES,
  ...SHIP_KIND_RULES,
  ...SHOP_KIND_RULES,
  ...UNIT_KIND_RULES,
  nation: { check: checkNationPayload, payload: "nation" },
  ware: { check: checkWare, payload: "ware" }
};
