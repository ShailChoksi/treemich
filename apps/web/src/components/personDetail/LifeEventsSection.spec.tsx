import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../lib/api";
import { LifeEventsSection } from "./LifeEventsSection";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => Promise.resolve();

const sampleEvent: api.LifeEventRecord = {
  id: "lev-1",
  eventType: "BIRTH",
  dateQualifier: "EXACT",
  year: 1990,
  month: 1,
  day: 2,
  endYear: null,
  endMonth: null,
  endDay: null,
  notes: null,
  place: null,
  citations: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("LifeEventsSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  const flushValidation = async () => {
    for (let i = 0; i < 15; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  };

  it("shows loading when life events are undefined", () => {
    act(() => {
      root.render(
        <LifeEventsSection
          personId="p1"
          personLifeEvents={undefined}
          onCreate={noop}
          onPatch={noop}
          onDelete={noop}
        />
      );
    });
    expect(container.textContent).toContain("Loading life events");
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("fetches validation and renders finding messages", async () => {
    const spy = vi.spyOn(api, "getPersonLifeEventValidation").mockResolvedValue({
      findings: [
        {
          code: "birth_after_death",
          severity: "error",
          message: "BIRTH is dated after DEATH for this person."
        }
      ]
    });

    act(() => {
      root.render(
        <LifeEventsSection
          personId="p1"
          personLifeEvents={[sampleEvent]}
          onCreate={noop}
          onPatch={noop}
          onDelete={noop}
        />
      );
    });

    await flushValidation();

    expect(spy).toHaveBeenCalledWith("p1");
    expect(container.textContent).toContain("BIRTH is dated after DEATH");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows validation API errors", async () => {
    vi.spyOn(api, "getPersonLifeEventValidation").mockRejectedValue(new Error("network down"));

    act(() => {
      root.render(
        <LifeEventsSection
          personId="p1"
          personLifeEvents={[sampleEvent]}
          onCreate={noop}
          onPatch={noop}
          onDelete={noop}
        />
      );
    });

    await flushValidation();

    expect(container.textContent).toContain("network down");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not render a findings list when validation returns none", async () => {
    vi.spyOn(api, "getPersonLifeEventValidation").mockResolvedValue({ findings: [] });

    act(() => {
      root.render(
        <LifeEventsSection
          personId="p1"
          personLifeEvents={[sampleEvent]}
          onCreate={noop}
          onPatch={noop}
          onDelete={noop}
        />
      );
    });

    await flushValidation();

    expect(container.querySelector(".life-events-validation-findings")).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
