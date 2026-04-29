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

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
