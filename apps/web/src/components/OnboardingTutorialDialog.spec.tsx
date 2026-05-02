import { act, createElement, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingTutorialDialog } from "./OnboardingTutorialDialog";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("OnboardingTutorialDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  const renderDialog = (props: Partial<ComponentProps<typeof OnboardingTutorialDialog>> = {}) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onComplete = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    act(() => {
      root.render(
        createElement(OnboardingTutorialDialog, {
          open: true,
          persistOnDismiss: true,
          isSaving: false,
          saveError: null,
          onComplete,
          onClose,
          ...props
        })
      );
    });
    return { container, root, onComplete, onClose };
  };

  it("renders spotlight chrome when the step target exists in the document", async () => {
    const anchor = document.createElement("div");
    anchor.setAttribute("data-onboarding-target", "main-content");
    document.body.appendChild(anchor);
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue({
      top: 50,
      left: 60,
      width: 80,
      height: 30,
      bottom: 80,
      right: 140,
      x: 60,
      y: 50,
      toJSON: () => ({})
    } as DOMRect);

    const { root } = renderDialog();
    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });

    expect(document.body.querySelector(".onboarding-tour-spotlight-hole")).not.toBeNull();

    act(() => {
      root.unmount();
    });
    anchor.remove();
  });

  it("shows step 1 of 5 and the welcome slide", () => {
    const { root } = renderDialog();
    expect(document.body.textContent).toContain("Step 1 of 5");
    expect(document.body.textContent).toContain("Welcome to Treemich");
    act(() => {
      root.unmount();
    });
  });

  it("disables Back on the first slide and enables it after Next", async () => {
    const { root } = renderDialog();
    const buttons = () => [...document.body.querySelectorAll("button")];
    const back = () => buttons().find((b) => b.textContent === "Back");
    expect(back()?.disabled).toBe(true);

    const next = buttons().find((b) => b.textContent === "Next");
    await act(async () => {
      next?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("Step 2 of 5");
    expect(back()?.disabled).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it("shows Done only on the final slide after advancing", async () => {
    const { root } = renderDialog();
    const primary = () =>
      document.body.querySelector<HTMLButtonElement>(".confirm-dialog-submit") as HTMLButtonElement | null;

    for (let i = 0; i < 4; i += 1) {
      expect(primary()?.textContent).toBe("Next");
      await act(async () => {
        primary()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }
    expect(document.body.textContent).toContain("Step 5 of 5");
    expect(primary()?.textContent).toBe("Done");

    act(() => {
      root.unmount();
    });
  });

  it("calls onComplete when Skip tutorial is used and persistOnDismiss is true", async () => {
    const { root, onComplete, onClose } = renderDialog();
    const skip = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Skip tutorial");
    await act(async () => {
      skip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("calls onClose without onComplete when persistOnDismiss is false", async () => {
    const { root, onComplete, onClose } = renderDialog({ persistOnDismiss: false });
    const skip = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Skip tutorial");
    await act(async () => {
      skip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onComplete).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("persists dismissal on Escape when persistOnDismiss is true", async () => {
    const { root, onComplete } = renderDialog();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onComplete).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("disables actions while saving and shows Saving on the primary button", () => {
    const { root } = renderDialog({ isSaving: true });
    const primary = document.body.querySelector<HTMLButtonElement>(".confirm-dialog-submit");
    expect(primary?.disabled).toBe(true);
    expect(primary?.textContent).toBe("Saving...");
    const skip = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Skip tutorial");
    expect(skip?.disabled).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  it("renders saveError when provided", () => {
    const { root } = renderDialog({ saveError: "Could not save. Try again." });
    expect(document.body.textContent).toContain("Could not save. Try again.");

    act(() => {
      root.unmount();
    });
  });

  it("focuses the primary action button when opened", async () => {
    const { root } = renderDialog();
    const primary = document.body.querySelector<HTMLButtonElement>(".confirm-dialog-submit");
    await act(async () => {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });
    });
    expect(document.activeElement).toBe(primary);

    act(() => {
      root.unmount();
    });
  });
});
