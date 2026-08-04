import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusShareRecord } from "@treemich/shared";
import { CreateFocusShareDialog } from "./CreateFocusShareDialog";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const createFocusShare = vi.fn();
const focusShareAbsoluteUrl = vi.fn((path: string) => `https://app.test${path}`);

vi.mock("../../lib/api", () => ({
  createFocusShare: (...args: unknown[]) => createFocusShare(...args),
  focusShareAbsoluteUrl: (path: string) => focusShareAbsoluteUrl(path)
}));

const setInputValue = (input: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
};

const createdShare: FocusShareRecord = {
  id: "share-1",
  publicId: "pub-1",
  publicPath: "/share/pub-1",
  label: "Reunion",
  focusAnchorPersonId: "person-1",
  maxAncestorDepth: 3,
  maxDescendantDepth: 2,
  maxCollateralDepth: 0,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z"
};

describe("CreateFocusShareDialog", () => {
  beforeEach(() => {
    createFocusShare.mockReset();
    focusShareAbsoluteUrl.mockClear();
  });

  it("portals above the graph and renders create copy", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CreateFocusShareDialog
          open
          focusAnchorPersonId="person-1"
          focusAnchorLabel="Ada Lovelace"
          maxAncestorDepth={3}
          maxDescendantDepth={2}
          maxCollateralDepth={0}
          onClose={vi.fn()}
        />
      );
    });

    const backdrop = document.body.querySelector(".confirm-dialog-backdrop");
    expect(backdrop).not.toBeNull();
    expect(backdrop?.parentElement).toBe(document.body);
    expect(document.body.textContent).toContain("Share Focus view");
    expect(document.body.textContent).toContain("Ada Lovelace");
    expect(document.body.textContent).toContain("↑3 ↓2 siblings 0");
    expect(document.body.textContent).toContain("Password");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("creates a share and shows the copyable public URL", async () => {
    createFocusShare.mockResolvedValue(createdShare);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CreateFocusShareDialog
          open
          focusAnchorPersonId="person-1"
          focusAnchorLabel="Ada Lovelace"
          maxAncestorDepth={3}
          maxDescendantDepth={2}
          maxCollateralDepth={0}
          onClose={vi.fn()}
        />
      );
    });

    const labelInput = document.body.querySelector('input[type="text"]') as HTMLInputElement | null;
    const passwordInput = document.body.querySelector('input[type="password"]') as HTMLInputElement | null;
    const form = document.body.querySelector("form");
    expect(labelInput).not.toBeNull();
    expect(passwordInput).not.toBeNull();
    expect(form).not.toBeNull();

    await act(async () => {
      setInputValue(labelInput!, "Reunion");
      setInputValue(passwordInput!, "secret-password");
    });

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(createFocusShare).toHaveBeenCalledWith({
      password: "secret-password",
      label: "Reunion",
      focusAnchorPersonId: "person-1",
      maxAncestorDepth: 3,
      maxDescendantDepth: 2,
      maxCollateralDepth: 0
    });
    expect(document.body.textContent).toContain("Focus Share created");
    expect(document.body.textContent).toContain("share the password separately");
    expect(document.body.querySelector('input[value="https://app.test/share/pub-1"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
