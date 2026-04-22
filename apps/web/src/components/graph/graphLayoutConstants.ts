/**
 * @file Layout thresholds, worker toggles, and cache size constants for the graph.
 */

import type { GraphLayoutMode } from "./layout/types";

/** Large family graphs run layout off the main thread when Web Workers are available. */
export const LAYOUT_WORKER_MIN_PEOPLE = 320;

/** Max entries for sync `positionPeople` results keyed by topology revision (not LRU eviction). */
export const TOPOLOGY_LAYOUT_CACHE_MAX_ENTRIES = 8;

export const shouldUseLayoutWorker = (viewMode: GraphLayoutMode, peopleCount: number) =>
  viewMode === "family" && peopleCount >= LAYOUT_WORKER_MIN_PEOPLE && typeof Worker !== "undefined";
