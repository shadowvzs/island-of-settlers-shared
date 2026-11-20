import type { ContentEntryBase, ContentText } from "./entry.ts";

/** Map editor tool that places the entry, its position in the tool list and an optional tool label. */
export interface EditorToolChoice {
  /** Tool label when it differs from the entry name (e.g. the doodad tool's "Small stone"). */
  label?: ContentText;
  order: number;
  tool: "animal" | "doodad" | "ore" | "tree";
}

/**
 * Where a prop kind lives: `worldProp` saved world prop bytes (gameplay objects), `cover` render-only field
 * cover and beach shells, `adventure` append-only render kinds of adventure maps.
 */
export type PropLayer = "adventure" | "cover" | "worldProp";

/** A ground prop: its `code` is the persisted prop-kind byte (`PROP`, `COVER`, `ADVENTURE_PROP`). */
export interface PropEntry extends ContentEntryBase<"plant" | "shell" | "stone" | "tree"> {
  code: number;
  prop: { editor?: EditorToolChoice; layer: PropLayer };
}

/** A resource deposit: mine zone ores (`code` = `ORE` byte) and authored stone boulders (marble, …). */
export interface DepositEntry extends ContentEntryBase<"deposit"> {
  deposit: { editor?: EditorToolChoice; source: "mineZone" | "stoneBoulder" };
}
