import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGraphProgressiveRenderLimit } from "./useGraphProgressiveRenderLimit";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("useGraphProgressiveRenderLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("raises effective cap in steps until the candidate count is reached", async () => {
    let latest = 0;
    const Probe = ({ count }: { count: number }) => {
      const { effectiveRenderLimit } = useGraphProgressiveRenderLimit({
        renderLimit: 10,
        candidateCount: count,
        topologyRevision: "rev-a",
        viewMode: "family"
      });
      latest = effectiveRenderLimit;
      return null;
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(Probe, { count: 35 }));
    });
    expect(latest).toBe(10);

    await act(async () => {
      vi.advanceTimersByTime(160);
    });
    expect(latest).toBe(20);

    await act(async () => {
      vi.advanceTimersByTime(160);
    });
    expect(latest).toBe(30);

    await act(async () => {
      vi.advanceTimersByTime(160);
    });
    expect(latest).toBe(35);

    root.unmount();
    container.remove();
  });

  it("resets when topology revision changes", async () => {
    let latest = 0;
    const Harness = () => {
      const [rev, setRev] = useState("r1");
      const { effectiveRenderLimit } = useGraphProgressiveRenderLimit({
        renderLimit: 5,
        candidateCount: 40,
        topologyRevision: rev,
        viewMode: "family"
      });
      latest = effectiveRenderLimit;
      return createElement("button", { type: "button", onClick: () => setRev("r2"), "data-testid": "bump" });
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(Harness));
    });
    expect(latest).toBe(5);

    await act(async () => {
      vi.advanceTimersByTime(160);
    });
    expect(latest).toBe(10);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="bump"]')?.click();
    });
    expect(latest).toBe(5);

    root.unmount();
    container.remove();
  });
});
