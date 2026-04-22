/**
 * @file Main-thread RPC to the graph layout Web Worker with revision caching.
 */

import type { LayoutWorkerPayload, LayoutWorkerPosition, LayoutWorkerResponse } from "./layoutWorkerTypes";

const DEFAULT_TIMEOUT_MS = 12_000;

type PendingRequest = {
  resolve: (value: LayoutWorkerPosition[]) => void;
  reject: (reason?: unknown) => void;
  timeoutId: number;
};

let workerPromise: Promise<Worker> | null = null;
let workerInstance: Worker | null = null;
let nextRequestId = 1;
const pendingById = new Map<number, PendingRequest>();

const cleanupPendingRequest = (requestId: number) => {
  const pending = pendingById.get(requestId);
  if (!pending) {
    return;
  }
  window.clearTimeout(pending.timeoutId);
  pendingById.delete(requestId);
};

const handleWorkerMessage = (event: MessageEvent<LayoutWorkerResponse>) => {
  const message = event.data;
  const pending = pendingById.get(message.id);
  if (!pending) {
    return;
  }
  cleanupPendingRequest(message.id);
  if ("error" in message) {
    pending.reject(new Error(message.error));
    return;
  }
  pending.resolve(message.positions);
};

const handleWorkerFailure = (error: ErrorEvent) => {
  for (const [requestId, pending] of pendingById.entries()) {
    cleanupPendingRequest(requestId);
    pending.reject(new Error(error.message || "Layout worker failed"));
  }
};

const createWorker = async (): Promise<Worker> => {
  const workerModule = await import("./layout.worker?worker");
  const instance = new workerModule.default();
  instance.addEventListener("message", handleWorkerMessage as EventListener);
  instance.addEventListener("error", handleWorkerFailure as EventListener);
  workerInstance = instance;
  return instance;
};

const getWorker = () => {
  if (workerInstance) {
    return Promise.resolve(workerInstance);
  }
  if (!workerPromise) {
    workerPromise = createWorker().catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
};

export const requestPositionPeopleInWorker = async (
  payload: LayoutWorkerPayload,
  timeoutMs = DEFAULT_TIMEOUT_MS
) => {
  const worker = await getWorker();
  const requestId = nextRequestId++;
  return new Promise<LayoutWorkerPosition[]>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanupPendingRequest(requestId);
      reject(new Error("Layout worker timed out"));
    }, timeoutMs);
    pendingById.set(requestId, {
      resolve,
      reject,
      timeoutId
    });
    worker.postMessage({
      id: requestId,
      payload
    });
  });
};

export const resetLayoutWorkerClientForTests = () => {
  if (workerInstance) {
    workerInstance.terminate();
  }
  workerInstance = null;
  workerPromise = null;
  nextRequestId = 1;
  for (const [requestId, pending] of pendingById.entries()) {
    cleanupPendingRequest(requestId);
    pending.reject(new Error("Layout worker reset"));
  }
};
