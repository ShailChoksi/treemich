import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CreatePersonDialog } from "./CreatePersonDialog";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("CreatePersonDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("prefills given name and surname when dialog opens", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        createElement(CreatePersonDialog, {
          open: true,
          defaultGivenName: "Pat",
          defaultSurname: "Lee",
          onConfirm: () => undefined,
          onCancel: () => undefined
        })
      );
    });

    const given = container.querySelector<HTMLInputElement>('input[placeholder="Given name"]');
    const surname = container.querySelector<HTMLInputElement>('input[placeholder="Surname"]');
    expect(given?.value).toBe("Pat");
    expect(surname?.value).toBe("Lee");

    act(() => {
      root.unmount();
    });
  });
});
