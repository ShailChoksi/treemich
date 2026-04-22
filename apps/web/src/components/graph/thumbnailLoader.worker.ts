/**
 * @file Web worker entry: thumbnailLoader.worker.ts.
 */

/// <reference lib="webworker" />

import type {
  ThumbnailWorkerRequest,
  ThumbnailWorkerResponse,
  ThumbnailWorkerResult,
  ThumbnailWorkerResultFulfilled
} from "./thumbnailWorkerTypes";

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = async (event: MessageEvent<ThumbnailWorkerRequest>) => {
  const { id, items } = event.data;
  const results: ThumbnailWorkerResult[] = [];

  for (const item of items) {
    try {
      const response = await fetch(item.url, { credentials: "include" });
      if (!response.ok) {
        results.push({
          personId: item.personId,
          status: "rejected",
          error: `HTTP ${response.status}`
        });
        continue;
      }
      const blob = await response.blob();
      // imageOrientation: "flipY" pre-flips the bitmap because WebGL2's
      // UNPACK_FLIP_Y_WEBGL has no effect on ImageBitmap uploads.
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
