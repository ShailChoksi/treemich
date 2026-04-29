import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MutableRefObject } from "react";
import type { Vector3 } from "three";
import type { ThumbnailWorkerResult } from "./thumbnailWorkerTypes";
import {
  buildThumbnailLoadOrder,
  pickThumbnailBatch,
  resolveNextThumbnailBackoffMs,
  useThumbnailLoader
} from "./useThumbnailLoader";

vi.mock("./thumbnailWorkerClient", () => ({
  loadThumbnailBatch: vi.fn()
}));

// Mock the thumbnailCache so its module-level state doesn't leak across tests.
vi.mock("./thumbnailCache", async () => {
  const actual = await vi.importActual<typeof import("./thumbnailCache")>("./thumbnailCache");
  return {
    ...actual,
    getCachedTexture: vi.fn(() => undefined),
    getCachedBitmap: vi.fn(() => undefined),
    hasCachedValue: vi.fn(() => false),
    setCachedTexture: vi.fn(),
    setCachedBitmap: vi.fn(),
    removeCachedTexture: vi.fn()
  };
});

import { loadThumbnailBatch } from "./thumbnailWorkerClient";
import { hasCachedValue, removeCachedTexture } from "./thumbnailCache";

const reactTestEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnv.IS_REACT_ACT_ENVIRONMENT = true;

const makeFakeBitmap = (): ImageBitmap => ({ width: 1, height: 1, close: vi.fn() }) as unknown as ImageBitmap;

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.mocked(hasCachedValue).mockImplementation(() => false);
});

describe("useThumbnailLoader hook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("loads thumbnails via the worker client and exposes them in thumbnailNodeIds", async () => {
    const mockBitmapA = makeFakeBitmap();
    const mockBitmapB = makeFakeBitmap();

    let resolveFirstBatch!: (results: ThumbnailWorkerResult[]) => void;
    const firstBatchPromise = new Promise<ThumbnailWorkerResult[]>((resolve) => {
      resolveFirstBatch = resolve;
    });

    vi.mocked(loadThumbnailBatch).mockReturnValueOnce(firstBatchPromise);

    let capturedIds: Set<string> = new Set();
    let capturedTextures: Map<string, unknown> = new Map();

    type Props = { nearIds: string[] };
    const Probe = ({ nearIds }: Props) => {
      const { thumbnailNodeIds, thumbnailTextures } = useThumbnailLoader({
        peopleIds: ["a", "b"],
        prioritizedNodeIds: new Set<string>(),
        renderNearPersonIds: nearIds,
        displayVisiblePeople: nearIds.map((id, i) => ({
          person: { id },
          displayPosition: [i * 2, 0, 0] as [number, number, number]
        })),
        cameraSampleRef: { current: { x: 0, y: 0, z: 0 } } as unknown as MutableRefObject<Vector3>
      });
      capturedIds = thumbnailNodeIds;
      capturedTextures = thumbnailTextures;
      return null;
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      act(() => {
        root.render(createElement(Probe, { nearIds: ["a", "b"] }));
      });

      expect(vi.mocked(loadThumbnailBatch)).toHaveBeenCalledTimes(1);
      expect(capturedIds.size).toBe(0);

      // Resolve the batch with two successful thumbnails
      await act(async () => {
        resolveFirstBatch([
          { personId: "a", status: "fulfilled", bitmap: mockBitmapA },
          { personId: "b", status: "fulfilled", bitmap: mockBitmapB }
        ]);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(capturedIds.has("a")).toBe(true);
      expect(capturedIds.has("b")).toBe(true);
      expect(capturedTextures.has("a")).toBe(true);
      expect(capturedTextures.has("b")).toBe(true);
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("pickThumbnailBatch skips IDs when hasCachedValue is true", () => {
    vi.mocked(hasCachedValue).mockImplementation((id: string) => id === "a");
    const batch = pickThumbnailBatch({
      loadOrder: ["a", "b", "c"],
      loadedIds: new Set(),
      inFlightIds: new Set(),
      batchSize: 5
    });
    expect(batch).toEqual(["b", "c"]);
  });

  it("evicts and reloads a cached thumbnail when its revision changes", async () => {
    let hasCachedThumbnail = true;
    vi.mocked(hasCachedValue).mockImplementation((id: string) => id === "a" && hasCachedThumbnail);
    vi.mocked(removeCachedTexture).mockImplementation((id: string) => {
      if (id === "a") {
        hasCachedThumbnail = false;
      }
    });
    vi.mocked(loadThumbnailBatch).mockResolvedValue([
      { personId: "a", status: "fulfilled", bitmap: makeFakeBitmap() }
    ]);

    type Props = { revision: string };
    const Probe = ({ revision }: Props) => {
      useThumbnailLoader({
        peopleIds: ["a"],
        thumbnailCacheKeys: { a: revision },
        prioritizedNodeIds: new Set<string>(),
        renderNearPersonIds: ["a"],
        displayVisiblePeople: [
          {
            person: { id: "a" },
            displayPosition: [0, 0, 0] as [number, number, number]
          }
        ],
        cameraSampleRef: { current: { x: 0, y: 0, z: 0 } } as unknown as MutableRefObject<Vector3>
      });
      return null;
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      act(() => {
        root.render(createElement(Probe, { revision: "old" }));
      });
      expect(vi.mocked(loadThumbnailBatch)).not.toHaveBeenCalled();

      act(() => {
        root.render(createElement(Probe, { revision: "new" }));
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(removeCachedTexture).toHaveBeenCalledWith("a");
      expect(vi.mocked(loadThumbnailBatch)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(loadThumbnailBatch).mock.calls[0]?.[0]).toEqual([
        { personId: "a", url: "/api/people/a/thumbnail?revision=new" }
      ]);
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("reports thumbnail progress via thumbnailProgress", async () => {
    vi.mocked(loadThumbnailBatch).mockResolvedValue([
      { personId: "a", status: "fulfilled", bitmap: makeFakeBitmap() },
      { personId: "b", status: "fulfilled", bitmap: makeFakeBitmap() }
    ]);

    let capturedProgress: { loaded: number; total: number } | null = null;

    const Probe = () => {
      const { thumbnailProgress } = useThumbnailLoader({
        peopleIds: ["a", "b"],
        prioritizedNodeIds: new Set<string>(),
        renderNearPersonIds: ["a", "b"],
        displayVisiblePeople: ["a", "b"].map((id, i) => ({
          person: { id },
          displayPosition: [i * 2, 0, 0] as [number, number, number]
        })),
        cameraSampleRef: { current: { x: 0, y: 0, z: 0 } } as unknown as MutableRefObject<Vector3>
      });
      capturedProgress = thumbnailProgress;
      return null;
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      act(() => {
        root.render(createElement(Probe));
      });

      // Initially, progress shows loaded=0 (not in React state yet)
      expect(capturedProgress).toEqual({ loaded: 0, total: 2 });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(capturedProgress).toEqual({ loaded: 2, total: 2 });
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("continues loading new thumbnails after drain-order change while a prior drain is in flight", async () => {
    let resolveFirstBatch!: (results: ThumbnailWorkerResult[]) => void;
    const firstBatchPromise = new Promise<ThumbnailWorkerResult[]>((resolve) => {
      resolveFirstBatch = resolve;
    });

    let resolveSecondBatch!: (results: ThumbnailWorkerResult[]) => void;
    const secondBatchPromise = new Promise<ThumbnailWorkerResult[]>((resolve) => {
      resolveSecondBatch = resolve;
    });

    vi.mocked(loadThumbnailBatch)
      .mockReturnValueOnce(firstBatchPromise)
      .mockReturnValueOnce(secondBatchPromise);

    let capturedIds: Set<string> = new Set();

    type Props = { nearIds: string[] };
    const Probe = ({ nearIds }: Props) => {
      const { thumbnailNodeIds } = useThumbnailLoader({
        peopleIds: ["a", "b"],
        prioritizedNodeIds: new Set<string>(),
        renderNearPersonIds: nearIds,
        displayVisiblePeople: nearIds.map((id, i) => ({
          person: { id },
          displayPosition: [i * 2, 0, 0] as [number, number, number]
        })),
        cameraSampleRef: { current: { x: 0, y: 0, z: 0 } } as unknown as MutableRefObject<Vector3>
      });
      capturedIds = thumbnailNodeIds;
      return null;
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      // First render: only "a" is near, drain starts for "a"
      act(() => {
        root.render(createElement(Probe, { nearIds: ["a"] }));
      });

      expect(vi.mocked(loadThumbnailBatch)).toHaveBeenCalledTimes(1);
      const firstCall = vi.mocked(loadThumbnailBatch).mock.calls[0]!;
      expect(firstCall[0].some((item) => item.personId === "a")).toBe(true);

      // Re-render while drain for "a" is in flight — "b" is now also near
      act(() => {
        root.render(createElement(Probe, { nearIds: ["a", "b"] }));
      });

      // Lock is still held — second batch should not have started yet
      expect(vi.mocked(loadThumbnailBatch)).toHaveBeenCalledTimes(1);

      // Resolve "a" → drain completes with isDisposed=true (effect was re-created).
      // The finally block must release the drain lock AND remove "a" from inFlightIds
      // so both can be picked up in the next batch.
      await act(async () => {
        resolveFirstBatch([{ personId: "a", status: "fulfilled", bitmap: makeFakeBitmap() }]);
        await Promise.resolve();
        await Promise.resolve();
      });

      // Advance past THUMBNAIL_BATCH_INTERVAL_MS so the new effect's interval fires
      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
        await Promise.resolve();
      });

      // A second batch should have been requested — the new drain picks up remaining IDs
      expect(vi.mocked(loadThumbnailBatch)).toHaveBeenCalledTimes(2);

      // Resolve second batch with both a and b
      await act(async () => {
        resolveSecondBatch([
          { personId: "a", status: "fulfilled", bitmap: makeFakeBitmap() },
          { personId: "b", status: "fulfilled", bitmap: makeFakeBitmap() }
        ]);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(capturedIds.has("a")).toBe(true);
      expect(capturedIds.has("b")).toBe(true);
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("applies exponential backoff when the worker reports failures", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(loadThumbnailBatch).mockResolvedValueOnce([
      { personId: "a", status: "rejected", error: "HTTP 429" }
    ]);

    let capturedIds: Set<string> = new Set();

    type Props = { nearIds: string[] };
    const Probe = ({ nearIds }: Props) => {
      const { thumbnailNodeIds } = useThumbnailLoader({
        peopleIds: ["a"],
        prioritizedNodeIds: new Set<string>(),
        renderNearPersonIds: nearIds,
        displayVisiblePeople: nearIds.map((id, i) => ({
          person: { id },
          displayPosition: [i * 2, 0, 0] as [number, number, number]
        })),
        cameraSampleRef: { current: { x: 0, y: 0, z: 0 } } as unknown as MutableRefObject<Vector3>
      });
      capturedIds = thumbnailNodeIds;
      return null;
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      act(() => {
        root.render(createElement(Probe, { nearIds: ["a"] }));
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      // After a failure the ID should not be in thumbnailNodeIds
      expect(capturedIds.has("a")).toBe(false);

      // Advance less than the backoff — no new batch
      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve();
      });
      expect(vi.mocked(loadThumbnailBatch)).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });
});

describe("useThumbnailLoader helpers", () => {
  it("orders thumbnail load candidates by near render set, then priority, then camera, then visible", () => {
    const ordered = buildThumbnailLoadOrder({
      renderNearPersonIds: ["camera-a", "selected"],
      prioritizedNodeIds: new Set(["pinned", "selected"]),
      nearCameraNodeIds: ["selected", "camera-a", "camera-b"],
      visibleIdsByDistance: ["camera-b", "visible-a", "visible-b"]
    });

    expect(ordered).toEqual(["camera-a", "selected", "pinned", "camera-b", "visible-a", "visible-b"]);
  });

  it("picks the next batch excluding loaded and in-flight thumbnails", () => {
    const batch = pickThumbnailBatch({
      loadOrder: ["a", "b", "c", "d", "e"],
      loadedIds: new Set(["a", "d"]),
      inFlightIds: new Set(["b"]),
      batchSize: 3
    });

    expect(batch).toEqual(["c", "e"]);
  });

  it("computes exponential backoff with cap", () => {
    expect(resolveNextThumbnailBackoffMs({ failureStreak: 1, baseMs: 1000, maxMs: 4000 })).toBe(1000);
    expect(resolveNextThumbnailBackoffMs({ failureStreak: 2, baseMs: 1000, maxMs: 4000 })).toBe(2000);
    expect(resolveNextThumbnailBackoffMs({ failureStreak: 3, baseMs: 1000, maxMs: 4000 })).toBe(4000);
    expect(resolveNextThumbnailBackoffMs({ failureStreak: 6, baseMs: 1000, maxMs: 4000 })).toBe(4000);
  });
});
