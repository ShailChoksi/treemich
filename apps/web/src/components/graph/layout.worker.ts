/**
 * @file Web worker entry: layout.worker.ts.
 */

/// <reference lib="webworker" />

import { positionPeople } from "./layout";
import type { LayoutWorkerRequest, LayoutWorkerResponse } from "./layoutWorkerTypes";

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<LayoutWorkerRequest>) => {
  const { id, payload } = event.data;
  try {
    const positioned = positionPeople(payload.people, payload.relationships, payload.options);
    const response: LayoutWorkerResponse = {
      id,
      positions: positioned.map((item) => ({
        personId: item.person.id,
        position: item.position
      }))
    };
    workerScope.postMessage(response);
  } catch (error) {
    const response: LayoutWorkerResponse = {
      id,
      error: error instanceof Error ? error.message : "Failed to compute layout in worker"
    };
    workerScope.postMessage(response);
  }
};

export {};
