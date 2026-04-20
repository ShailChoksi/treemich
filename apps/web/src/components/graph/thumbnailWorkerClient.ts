import type {
  ThumbnailWorkerRequestItem,
  ThumbnailWorkerResponse,
  ThumbnailWorkerResult
} from "./thumbnailWorkerTypes";

const DEFAULT_TIMEOUT_MS = 30_000;

type PendingRequest = {
  resolve: (value: ThumbnailWorkerResult[]) => void;
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

const handleWorkerMessage = (event: MessageEvent<ThumbnailWorkerResponse>) => {
  const message = event.data;
  const pending = pendingById.get(message.id);
  if (!pending) {
    return;
  }
  cleanupPendingRequest(message.id);
  pending.resolve(message.results);
};

const handleWorkerFailure = (error: ErrorEvent) => {
  for (const [requestId, pending] of pendingById.entries()) {
    cleanupPendingRequest(requestId);
    pending.reject(new Error(error.message || "Thumbnail worker failed"));
  }
};

const createWorker = async (): Promise<Worker> => {
  const workerModule = await import("./thumbnailLoader.worker?worker");
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
    workerPromise = createWorker().catch((error: unknown) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
};

export const loadThumbnailBatch = async (
  items: ThumbnailWorkerRequestItem[],
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<ThumbnailWorkerResult[]> => {
  const worker = await getWorker();
  const requestId = nextRequestId++;
  return new Promise<ThumbnailWorkerResult[]>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanupPendingRequest(requestId);
      reject(new Error("Thumbnail worker timed out"));
    }, timeoutMs);
    pendingById.set(requestId, { resolve, reject, timeoutId });
    worker.postMessage({ id: requestId, items });
  });
};
