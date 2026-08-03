import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthScreen } from "./AuthScreen";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

type RenderResult = {
  container: HTMLDivElement;
  root: Root;
};

const renderAuthScreen = (): RenderResult => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<AuthScreen busy={false} error={null} onSubmit={vi.fn()} />);
  });

  return { container, root };
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("AuthScreen", () => {
  it("positions Immich login as a legacy migration path", () => {
    const { container, root } = renderAuthScreen();

    expect(container.textContent).toContain("Existing legacy Immich-login users");
    expect(container.textContent).toContain("Immich migration login");
    expect(container.textContent).toContain("once");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("warns that Immich migration login should only be used once when selected", () => {
    const { container, root } = renderAuthScreen();
    const select = container.querySelector("select") as HTMLSelectElement;

    expect(container.textContent).not.toContain("Use Immich migration login only once");

    act(() => {
      select.value = "immich";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("Use Immich migration login only once");
    expect(container.textContent).toContain("clear or overwrite");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("confirms before submitting Immich migration login", async () => {
    const onSubmit = vi.fn();
    const confirmSpy = vi.fn().mockReturnValue(false);
    window.confirm = confirmSpy;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<AuthScreen busy={false} error={null} onSubmit={onSubmit} />);
    });

    const select = container.querySelector("select") as HTMLSelectElement;
    const email = container.querySelector('input[name="email"]') as HTMLInputElement;
    const password = container.querySelector('input[name="password"]') as HTMLInputElement;
    const form = container.querySelector("form") as HTMLFormElement;

    act(() => {
      select.value = "immich";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      email.value = "alice@example.com";
      email.dispatchEvent(new Event("input", { bubbles: true }));
      password.value = "secret-password";
      password.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("only be used once"));
    expect(onSubmit).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
