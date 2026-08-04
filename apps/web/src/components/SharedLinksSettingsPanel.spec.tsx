import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusShareRecord, PersonRecord } from "@treemich/shared";
import { SharedLinksSettingsPanel } from "./SharedLinksSettingsPanel";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const listFocusShares = vi.fn();
const patchFocusShare = vi.fn();
const rotateFocusSharePassword = vi.fn();
const deleteFocusShare = vi.fn();
const focusShareAbsoluteUrl = vi.fn((path: string) => `https://app.test${path}`);

vi.mock("../lib/api", () => ({
  listFocusShares: (...args: unknown[]) => listFocusShares(...args),
  patchFocusShare: (...args: unknown[]) => patchFocusShare(...args),
  rotateFocusSharePassword: (...args: unknown[]) => rotateFocusSharePassword(...args),
  deleteFocusShare: (...args: unknown[]) => deleteFocusShare(...args),
  focusShareAbsoluteUrl: (path: string) => focusShareAbsoluteUrl(path)
}));

const setInputValue = (input: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
};

const people: PersonRecord[] = [
  { id: "person-1", name: "Ada Lovelace" },
  { id: "person-2", name: "Charles Babbage" }
];

const sampleShare: FocusShareRecord = {
  id: "share-1",
  publicId: "pub-abc",
  publicPath: "/share/pub-abc",
  label: "Reunion branch",
  focusAnchorPersonId: "person-1",
  maxAncestorDepth: 2,
  maxDescendantDepth: 1,
  maxCollateralDepth: 0,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z"
};

describe("SharedLinksSettingsPanel", () => {
  beforeEach(() => {
    listFocusShares.mockReset();
    patchFocusShare.mockReset();
    rotateFocusSharePassword.mockReset();
    deleteFocusShare.mockReset();
    focusShareAbsoluteUrl.mockClear();
    listFocusShares.mockResolvedValue([sampleShare]);
  });

  it("lists Focus Shares with anchor and depths", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SharedLinksSettingsPanel people={people} />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(listFocusShares).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Shared links");
    expect(container.textContent).toContain("Reunion branch");
    expect(container.textContent).toContain("Ada Lovelace");
    expect(container.textContent).toContain("↑2 ↓1 siblings 0");
    expect(container.querySelector('input[value="https://app.test/share/pub-abc"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows empty state when there are no shares", async () => {
    listFocusShares.mockResolvedValue([]);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SharedLinksSettingsPanel people={people} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("No shared links yet");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("saves edits via patchFocusShare", async () => {
    patchFocusShare.mockResolvedValue({
      ...sampleShare,
      label: "Updated label",
      maxAncestorDepth: 3
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SharedLinksSettingsPanel people={people} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const editButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Edit")
    );
    expect(editButton).not.toBeUndefined();

    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const labelInput = container.querySelector(
      '.shared-links-edit input[type="text"]'
    ) as HTMLInputElement | null;
    const ancestorInput = [...container.querySelectorAll('.shared-links-edit input[type="number"]')][0] as
      | HTMLInputElement
      | undefined;
    expect(labelInput).not.toBeNull();
    expect(ancestorInput).not.toBeUndefined();

    await act(async () => {
      if (labelInput) {
        setInputValue(labelInput, "Updated label");
      }
      if (ancestorInput) {
        setInputValue(ancestorInput, "3");
      }
    });

    const form = container.querySelector(".shared-links-edit") as HTMLFormElement | null;
    expect(form).not.toBeNull();

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(patchFocusShare).toHaveBeenCalledWith("share-1", {
      label: "Updated label",
      focusAnchorPersonId: "person-1",
      maxAncestorDepth: 3,
      maxDescendantDepth: 1,
      maxCollateralDepth: 0
    });
    expect(container.textContent).toContain("Updated label");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
