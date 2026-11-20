import type { ContentText } from "./entry.ts";
import type { ContentKind } from "./refs.ts";

/** A UI tab / palette category; `order` sorts the categories of one kind. */
export interface CatalogCategory {
  id: string;
  kind: ContentKind;
  order: number;
  text: { name: ContentText };
}
