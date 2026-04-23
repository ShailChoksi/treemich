import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEventRecord } from "../../lib/api";
import * as api from "../../lib/api";
import { LifeEventRichForm } from "./LifeEventRichForm";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const baseEvent: LifeEventRecord = {
  id: "event-1",
  eventType: "RESIDENCE",
  customLabel: null,
  dateQualifier: "EXACT",
  year: 1995,
  month: 2,
  day: 14,
  endYear: null,
  endMonth: null,
  endDay: null,
  notes: null,
  place: {
    id: "place-1",
    name: "New York",
    addressLine1: null,
    locality: "New York",
    adminArea: null,
    postalCode: null,
    countryCode: "US",
    latitude: 40.7484,
    longitude: 73.9857,
    notes: null
  },
  citations: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const findFieldInput = (container: HTMLElement, label: string): HTMLInputElement => {
  const groups = Array.from(container.querySelectorAll(".field-group"));
  for (const group of groups) {
    const labelEl = group.querySelector(".field-label");
    if (labelEl?.textContent?.trim() === label) {
      const input = group.querySelector("input");
      if (input instanceof HTMLInputElement) {
        return input;
      }
    }
  }
  throw new Error(`Input not found for label ${label}`);
};

const setInputValue = async (input: HTMLInputElement, value: string) => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  await act(async () => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

describe("LifeEventRichForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(api, "listEvidenceSources").mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it("accepts unicode minus longitude and submits normalized negative value", async () => {
    const onSubmitPatch = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <LifeEventRichForm
          variant="edit"
          initialEvent={baseEvent}
          onSubmitCreate={() => Promise.resolve()}
          onSubmitPatch={onSubmitPatch}
          onCancel={() => undefined}
        />
      );
    });

    const lngInput = findFieldInput(container, "Longitude");
    await setInputValue(lngInput, "−73.9857");

    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Save changes"
    );
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSubmitPatch).toHaveBeenCalledTimes(1);
    expect(onSubmitPatch).toHaveBeenCalledWith(
      "event-1",
      expect.objectContaining({
        place: expect.objectContaining({
          longitude: -73.9857
        })
      })
    );
  });

  it("shows a validation error instead of clearing invalid longitude", async () => {
    const onSubmitPatch = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <LifeEventRichForm
          variant="edit"
          initialEvent={baseEvent}
          onSubmitCreate={() => Promise.resolve()}
          onSubmitPatch={onSubmitPatch}
          onCancel={() => undefined}
        />
      );
    });

    const lngInput = findFieldInput(container, "Longitude");
    await setInputValue(lngInput, "-73.9x");

    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Save changes"
    );
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSubmitPatch.mock.calls.length).toBe(0);
    expect(container.textContent).toContain("Longitude must be a valid number");
  });

  it("accepts boundary coordinate values", async () => {
    const onSubmitPatch = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <LifeEventRichForm
          variant="edit"
          initialEvent={baseEvent}
          onSubmitCreate={() => Promise.resolve()}
          onSubmitPatch={onSubmitPatch}
          onCancel={() => undefined}
        />
      );
    });

    await setInputValue(findFieldInput(container, "Latitude"), "-90");
    await setInputValue(findFieldInput(container, "Longitude"), "180");

    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Save changes"
    );
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSubmitPatch).toHaveBeenCalledTimes(1);
    expect(onSubmitPatch).toHaveBeenCalledWith(
      "event-1",
      expect.objectContaining({
        place: expect.objectContaining({
          latitude: -90,
          longitude: 180
        })
      })
    );
  });

  it("rejects out-of-range coordinate values", async () => {
    const onSubmitPatch = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <LifeEventRichForm
          variant="edit"
          initialEvent={baseEvent}
          onSubmitCreate={() => Promise.resolve()}
          onSubmitPatch={onSubmitPatch}
          onCancel={() => undefined}
        />
      );
    });

    await setInputValue(findFieldInput(container, "Latitude"), "90.1");
    await setInputValue(findFieldInput(container, "Longitude"), "-180.1");

    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Save changes"
    );
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSubmitPatch.mock.calls.length).toBe(0);
    expect(container.textContent).toContain("Latitude must be between -90 and 90.");
  });

  it("blocks create when CUSTOM is selected but custom label is empty", async () => {
    const onSubmitCreate = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <LifeEventRichForm
          variant="create"
          allowedCreateTypes={["CUSTOM"]}
          onSubmitCreate={onSubmitCreate}
          onSubmitPatch={() => Promise.resolve()}
          onCancel={() => undefined}
        />
      );
    });

    const createButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Create event"
    );
    expect(createButton).toBeTruthy();

    await act(async () => {
      createButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSubmitCreate).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Custom events need a short display label.");
  });

  it("submits create with customLabel when type is CUSTOM", async () => {
    const onSubmitCreate = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <LifeEventRichForm
          variant="create"
          allowedCreateTypes={["CUSTOM"]}
          onSubmitCreate={onSubmitCreate}
          onSubmitPatch={() => Promise.resolve()}
          onCancel={() => undefined}
        />
      );
    });

    await setInputValue(findFieldInput(container, "Custom label"), "Muster roll");
    await setInputValue(findFieldInput(container, "Year"), "1864");

    const createButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Create event"
    );
    expect(createButton).toBeTruthy();

    await act(async () => {
      createButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSubmitCreate).toHaveBeenCalledTimes(1);
    expect(onSubmitCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "CUSTOM",
        customLabel: "Muster roll",
        year: 1864
      })
    );
  });

  it("blocks save on edit when CUSTOM label is cleared", async () => {
    const onSubmitPatch = vi.fn().mockResolvedValue(undefined);
    const customEvent: LifeEventRecord = {
      ...baseEvent,
      eventType: "CUSTOM",
      customLabel: "Original",
      year: 1900,
      month: 1,
      day: 1
    };

    await act(async () => {
      root.render(
        <LifeEventRichForm
          variant="edit"
          initialEvent={customEvent}
          onSubmitCreate={() => Promise.resolve()}
          onSubmitPatch={onSubmitPatch}
          onCancel={() => undefined}
        />
      );
    });

    const labelInput = findFieldInput(container, "Custom label");
    await setInputValue(labelInput, "");

    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Save changes"
    );
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSubmitPatch).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Custom events need a short display label.");
  });
});
