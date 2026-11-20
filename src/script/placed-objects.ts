import { createScriptIssueSink, type ScriptIssue, type ScriptIssueSink } from "./issues.ts";
import { scriptReferences, scriptUsersOf } from "./references.ts";
import type { PlacedObjectFingerprint } from "./types/actors.ts";
import type { MapScript } from "./types/script.ts";

/**
 * Placed actor bindings against the map's authored objects (TRG1, deferred from ACT1; trigger design rev M5). A
 * placed actor stores a fingerprint per map-file object (`objectId`, catalog content id, cell); the Ready check
 * compares them with the map, and the editor lists the script users of an object before it is deleted. The map
 * side is a lookup, so the client (scenario) and later the API can supply it.
 */

/** What the map has under a map-file object id now. */
export interface PlacedObjectFacts {
  cell: number;
  /** Catalog content id, e.g. `soldier:shield`, `building:barracks`, `decoration:<key>`. */
  content: string;
}

export type PlacedObjectLookup = (objectId: number) => PlacedObjectFacts | undefined;

interface BoundObject {
  actor: string;
  fingerprint: PlacedObjectFingerprint;
  path: string;
}

const boundObjects = (script: MapScript): BoundObject[] => script.actors.flatMap((actor, actorIndex) => {
  if (actor.binding !== "placed") return [];
  return actor.objects.map((fingerprint, index) =>
    ({ actor: actor.id, fingerprint, path: `actors[${actorIndex}].objects[${index}]` }));
});

/**
 * The script owners that depend on a map-file object, sorted: the placed actors that bind it, then every trigger,
 * quest, variable, actor or declared reward that references one of those actors. Empty when nothing uses it.
 */
export const scriptUsersOfObject = (script: MapScript, objectId: number): string[] => {
  const actors = [...new Set(boundObjects(script)
    .filter(bound => bound.fingerprint.objectId === objectId).map(bound => bound.actor))];
  if (!actors.length) return [];
  const references = scriptReferences(script);
  const users = actors.flatMap(actor => [`actor:${actor}`, ...scriptUsersOf(references, "actor", actor)]);
  return [...new Set(users)].sort();
};

const checkBound = (bound: BoundObject, facts: PlacedObjectFacts | undefined, issues: ScriptIssueSink) => {
  const { actor, fingerprint, path } = bound;
  const objectId = fingerprint.objectId;
  if (!facts) {
    issues.add("error", "placedObjectMissing", path, { actor, objectId });
    return;
  }
  if (facts.content !== fingerprint.content.id) {
    issues.add("error", "placedObjectChanged", `${path}.content`,
      { actor, expected: fingerprint.content.id, found: facts.content, objectId });
    return;
  }
  if (facts.cell !== fingerprint.cell)
    issues.add("warning", "placedObjectMoved", `${path}.cell`,
      { actor, expected: fingerprint.cell, found: facts.cell, objectId });
};

/**
 * The Ready check of placed fingerprints: a missing object or another content is an error (the binding would
 * animate the wrong thing); a moved object is a warning (rebind or accept the new cell in the actor panel).
 */
export const checkPlacedObjects = (script: MapScript, lookup: PlacedObjectLookup): ScriptIssue[] => {
  const sink = createScriptIssueSink();
  for (const bound of boundObjects(script)) checkBound(bound, lookup(bound.fingerprint.objectId), sink);
  return sink.issues;
};
