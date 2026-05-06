import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetPasswordScreen } from "./SetPasswordScreen";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

type RenderResult = {
  container: HTMLDivElement;
  root: Root;
};

const renderScreen = (
  onSubmit = vi
    .fn<(currentPassword: string, newPassword: string) => Promise<void>>()
    .mockResolvedValue(undefined),
  onPasswordChanged = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
): RenderResult => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<SetPasswordScreen onSubmit={onSubmit} onPasswordChanged={onPasswordChanged} />);
  });
  return { container, root };
};

const unmount = ({ container, root }: RenderResult) => {
  act(() => {
    root.unmount();
  });
  container.remove();
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("SetPasswordScreen", () => {
  it("renders all three password fields and a submit button", () => {
    const result = renderScreen();

    expect(result.container.querySelector("input[name='currentPassword']")).toBeTruthy();
    expect(result.container.querySelector("input[name='newPassword']")).toBeTruthy();
    expect(result.container.querySelector("input[name='confirmPassword']")).toBeTruthy();
    expect(result.container.querySelector("button[type='submit']")).toBeTruthy();

    unmount(result);
  });

  it("uses password type for all input fields", () => {
    const result = renderScreen();

    const inputs = Array.from(result.container.querySelectorAll("input"));
    expect(inputs.every((input) => input.type === "password")).toBe(true);

    unmount(result);
  });

  it("shows the heading and instructional hint text", () => {
    const result = renderScreen();

    expect(result.container.textContent).toContain("Set a new password");
    expect(result.container.textContent).toContain("password change before continuing");

    unmount(result);
  });

  it("labels current, new, and confirm password fields", () => {
    const result = renderScreen();

    expect(result.container.textContent).toContain("Current password");
    expect(result.container.textContent).toContain("New password");
    expect(result.container.textContent).toContain("Confirm new password");

    unmount(result);
  });

  it("renders submit button with correct label and not disabled by default", () => {
    const result = renderScreen();

    const button = result.container.querySelector<HTMLButtonElement>("button[type='submit']");
    expect(button).toBeTruthy();
    expect(button?.textContent).toContain("Change password");
    expect(button?.disabled).toBe(false);

    unmount(result);
  });

  it("new and confirm password inputs enforce minLength of 8", () => {
    const result = renderScreen();

    const newInput = result.container.querySelector<HTMLInputElement>("input[name='newPassword']");
    const confirmInput = result.container.querySelector<HTMLInputElement>("input[name='confirmPassword']");
    expect(newInput?.minLength).toBe(8);
    expect(confirmInput?.minLength).toBe(8);

    unmount(result);
  });
});
