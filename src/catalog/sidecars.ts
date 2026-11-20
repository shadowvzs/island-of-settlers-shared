import { deepFreeze } from "./helpers.ts";
import type { SidecarRef } from "./types/refs.ts";

/**
 * Sidecar importers keyed by path relative to `catalog/data/`. The client passes a lazy `import.meta.glob`
 * map (one chunk per sidecar), Node passes a reader; the catalog itself never resolves files.
 */
export type SidecarImporters = Readonly<Record<string, () => Promise<unknown>>>;

/**
 * A loader of heavy per-entry data (navigation cells, door/approach geometry, stock layout, construction data):
 * each sidecar is imported on first use, frozen and cached. Paths with tokens are filled by the caller first.
 */
export const createSidecarLoader = (importers: SidecarImporters) => {
  const cache = new Map<string, Promise<unknown>>();
  return <T>(ref: SidecarRef): Promise<T> => {
    const cached = cache.get(ref.path);
    if (cached) return cached as Promise<T>;
    const importer = importers[ref.path];
    if (!importer) return Promise.reject(new Error(`Unknown catalog sidecar ${ref.path}`));
    const loading = importer().then(deepFreeze);
    cache.set(ref.path, loading);
    return loading as Promise<T>;
  };
};
