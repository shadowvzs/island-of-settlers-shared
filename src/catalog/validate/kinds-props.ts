import { isPlainObject, isSafeCount } from "../../validation/index.ts";
import { checkContentText } from "./entry.ts";
import { checkFields, type FieldRules, isOneOf, optional, rule } from "./fields.ts";
import type { IssueSink } from "./issues.ts";
import type { PayloadCheck } from "./kinds.ts";

const EDITOR_RULES: FieldRules = {
  label: optional(isPlainObject, "A text { key, en }"),
  order: rule(isSafeCount, "A non-negative integer"),
  tool: rule(isOneOf(["doodad", "ore", "tree"]), "doodad, ore or tree")
};

const checkEditor = (value: unknown, path: string, sink: IssueSink) => {
  const editor = checkFields(value, path, sink, EDITOR_RULES, "{ order, tool, label? }");
  if (editor?.label !== undefined) checkContentText(editor.label, `${path}.label`, sink);
};

const PROP_RULES: FieldRules = {
  editor: optional(isPlainObject, "An editor tool choice"),
  layer: rule(isOneOf(["adventure", "cover", "worldProp"]), "adventure, cover or worldProp")
};

/** Ground props: the persisted prop-kind byte is required. */
const checkProp: PayloadCheck = (payload, path, sink, _context, entry) => {
  const fields = checkFields(payload, path, sink, PROP_RULES, "{ layer, editor? }");
  if (fields?.editor !== undefined) checkEditor(fields.editor, `${path}.editor`, sink);
  if (!isSafeCount(entry.code)) sink.add("payload", path.replace(/\.prop$/, ".code"), "A prop byte is required");
};

const DEPOSIT_RULES: FieldRules = {
  editor: optional(isPlainObject, "An editor tool choice"),
  source: rule(isOneOf(["mineZone", "stoneBoulder"]), "mineZone or stoneBoulder")
};

/** Deposits: mine zone ores carry their `ORE` byte. */
const checkDeposit: PayloadCheck = (payload, path, sink, _context, entry) => {
  const fields = checkFields(payload, path, sink, DEPOSIT_RULES, "{ source, editor? }");
  if (fields?.editor !== undefined) checkEditor(fields.editor, `${path}.editor`, sink);
  if (fields?.source === "mineZone" && !isSafeCount(entry.code))
    sink.add("payload", path.replace(/\.deposit$/, ".code"), "A mine zone ore has its ORE byte");
};

export const PROP_KIND_RULES = {
  deposit: { check: checkDeposit, payload: "deposit" },
  plant: { check: checkProp, payload: "prop" },
  shell: { check: checkProp, payload: "prop" },
  stone: { check: checkProp, payload: "prop" },
  tree: { check: checkProp, payload: "prop" }
} as const;
