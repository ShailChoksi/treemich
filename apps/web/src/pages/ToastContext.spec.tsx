import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast, type ToastMessage } from "./ToastContext";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

/** Flush passive effects / microtasks (e.g. provider useEffect after setState) inside the act environment. */
const flushAct = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

type Snapshot = {
  toasts: ToastMessage[];
  status: string | null;
  addToast: (message: string) => void;
  setStatus: (message: string | null) => void;
};

describe("ToastContext", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("exposes direct toasts and status-backed notifications", async () => {
    vi.useFakeTimers();
    let latest: Snapshot | undefined;
    const getLatest = () => {
      if (!latest) {
        throw new Error("Toast context was not captured");
      }
      return latest;
    };
    const Probe = () => {
      const toast = useToast();
      useEffect(() => {
        latest = toast;
      }, [toast]);
      return null;
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(ToastProvider, null, createElement(Probe)));
    });
    await flushAct();

    await act(async () => {
      getLatest().addToast("Saved");
    });
    await flushAct();
    expect(getLatest().toasts.map((toast) => toast.message)).toEqual(["Saved"]);

    await act(async () => {
      getLatest().setStatus("Loaded");
    });
    await flushAct();
    expect(getLatest().status).toBe("Loaded");
    expect(getLatest().toasts.map((toast) => toast.message)).toEqual(["Saved", "Loaded"]);

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await flushAct();
    expect(getLatest().toasts).toEqual([]);
    expect(getLatest().status).toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
