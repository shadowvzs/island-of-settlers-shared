import type { ContentEntryBase } from "./entry.ts";
import type { EditorToolChoice } from "./props.ts";

/** Kinds of living content: hunted wildlife and the decorative (render-only) life. */
export type LifeKind = "animal" | "bird" | "butterfly" | "critter" | "fish" | "whale";

/**
 * A species; `code` is its persisted index (`SPECIES`, `CRITTER`, `WHALE_SPECIES`, frame species ids).
 * `sim` life is part of the deterministic simulation; `render` life never enters the hash.
 */
export interface LifeEntry extends ContentEntryBase<LifeKind> {
  code: number;
  life: {
    /** Wildlife: meat of an adult in units (younger stages yield a share). */
    adultMeat?: number;
    /** Critters: personal ground radius in cells (0: no collision). */
    bodyRadius?: number;
    domain: "render" | "sim";
    editor?: EditorToolChoice;
    /** Wildlife: game minutes from birth to adult. */
    growthMinutes?: number;
    /** Critters: casts a sun shadow. */
    shadow?: boolean;
    /** Critters: drawn size relative to the model. */
    size?: number;
    /** Critters: instance size variation around 1. */
    sizeJitter?: number;
    /** Fish: share of the species among spawned schools. */
    weight?: number;
  };
}
