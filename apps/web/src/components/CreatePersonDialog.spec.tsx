import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreatePersonDialog } from "./CreatePersonDialog";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("CreatePersonDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("renders when open and hides when closed", () => {
    act(() => {
      root.render(
        <CreatePersonDialog open title="New Person" onConfirm={() => undefined} onCancel={() => undefined} />
      );
    });

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    expect(container.textContent).toContain("New Person");

    act(() => {
      root.render(
        <CreatePersonDialog
          open={false}
          title="New Person"
          onConfirm={() => undefined}
          onCancel={() => undefined}
        />
      );
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("submits normalized form values", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    act(() => {
      root.render(<CreatePersonDialog open onConfirm={onConfirm} onCancel={() => undefined} />);
    });

    const inputs = container.querySelectorAll("input");
    const givenNameInput = inputs[0] as HTMLInputElement;
    const surnameInput = inputs[1] as HTMLInputElement;
    const select = container.querySelector("select") as HTMLSelectElement;
    const inputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    const selectValueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;

    await act(async () => {
      inputValueSetter.call(givenNameInput, "  Alice  ");
      givenNameInput.dispatchEvent(new Event("input", { bubbles: true }));
      inputValueSetter.call(surnameInput, "  Smith  ");
      surnameInput.dispatchEvent(new Event("input", { bubbles: true }));
      selectValueSetter.call(select, "FEMALE");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const submit = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Create person")
    );
    expect(submit).toBeTruthy();

    await act(async () => {
      submit!.click();
    });

    expect(onConfirm).toHaveBeenCalledWith({ givenName: "Alice", surname: "Smith", gender: "FEMALE" });
  });

  it("disables submit when all name fields are blank", () => {
    act(() => {
      root.render(<CreatePersonDialog open onConfirm={() => undefined} onCancel={() => undefined} />);
    });

    const submit = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Create person")
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("calls onCancel when Escape is pressed", () => {
    const onCancel = vi.fn();
    act(() => {
      root.render(<CreatePersonDialog open onConfirm={() => undefined} onCancel={onCancel} />);
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
