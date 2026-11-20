import type { ContentId, ContentKind } from "./types/refs.ts";

/**
 * True when a family selector covers a family path on dot boundaries: "animal" covers "animal" and
 * "animal.deer", never "animalia". An empty selector covers nothing.
 */
export const familyMatches = (selector: string, path: string) =>
  selector.length > 0 && (path === selector || path.startsWith(`${selector}.`));

/** `<kind>:<key>` of a content entry. */
export const toContentId = (kind: ContentKind, key: string): ContentId => `${kind}:${key}`;

/** Kind and key of a content id; null when it has no `:` separator. */
export const splitContentId = (id: string): { key: string; kind: string } | null => {
  const separator = id.indexOf(":");
  if (separator <= 0) return null;
  return { key: id.slice(separator + 1), kind: id.slice(0, separator) };
};
