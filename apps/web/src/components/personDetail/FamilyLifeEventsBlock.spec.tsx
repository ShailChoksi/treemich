import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEventRecord } from "../../lib/api";
import { FamilyLifeEventsBlock } from "./FamilyLifeEventsBlock";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => Promise.resolve();

const censusEvent: LifeEventRecord = {
  id: "fev-1",
  eventType: "CENSUS",
  customLabel: null,
  dateQualifier: "EXACT",
  year: 1880,
  month: null,
  day: null,
  endYear: null,
  endMonth: null,
  endDay: null,
  notes: "US Federal",
  place: null,
  citations: [],
  familyId: "fam-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("FamilyLifeEventsBlock", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it("shows loading when events are undefined", () => {
    act(() => {
      root.render(
        <FamilyLifeEventsBlock
          familyId="fam-1"
          events={undefined}
          onCreate={noop}
          onPatch={noop}
          onDelete={noop}
        />
      );
    });
    expect(container.textContent).toContain("Loading household events");
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders household event summary when list is loaded", () => {
    act(() => {
      root.render(
        <FamilyLifeEventsBlock
          familyId="fam-1"
          events={[censusEvent]}
          onCreate={noop}
          onPatch={noop}
          onDelete={noop}
        />
      );
    });
    expect(container.querySelector("[data-family-id='fam-1']")).toBeTruthy();
    expect(container.textContent).toMatch(/Census|1880/);
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
