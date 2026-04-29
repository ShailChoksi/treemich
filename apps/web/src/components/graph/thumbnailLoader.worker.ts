/**
 * @file Web worker entry: thumbnailLoader.worker.ts.
 *
 * Uses the Cache API so thumbnails persist across hard page refreshes.
 */

/// <reference lib="webworker" />

import type {
  ThumbnailWorkerRequest,
  ThumbnailWorkerResponse,
  ThumbnailWorkerResult,
  ThumbnailWorkerResultFulfilled
} from "./thumbnailWorkerTypes";
import { resolveThumbnailHttpResponse } from "./resolveThumbnailHttpResponse";

const CACHE_NAME = "treemich-thumbnails-v1";

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = async (event: MessageEvent<ThumbnailWorkerRequest>) => {
  const { id, items } = event.data;
  const results: ThumbnailWorkerResult[] = [];
  let cache: Cache | undefined;

  try {
    cache = await caches.open(CACHE_NAME);
  } catch {
    // Cache API unavailable (e.g. insecure context) — fall back to fetch-only.
  }

  for (const item of items) {
    try {
      const response = await resolveThumbnailHttpResponse(item.url, cache, fetch);
      if (!response.ok) {
        results.push({
          personId: item.personId,
          status: "rejected",
          error: `HTTP ${response.status}`
        });
        continue;
      }

      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob, { imageOrientation: "flipY" });
      results.push({ personId: item.personId, status: "fulfilled", bitmap });
    } catch (error) {
      results.push({
        personId: item.personId,
        status: "rejected",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const transferables = results
    .filter((r): r is ThumbnailWorkerResultFulfilled => r.status === "fulfilled")
    .map((r) => r.bitmap);

  const workerResponse: ThumbnailWorkerResponse = { id, results };
  workerScope.postMessage(workerResponse, transferables);
};

export {};
