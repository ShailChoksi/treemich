import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RELATIONSHIP_TYPES } from "../../lib/relationshipConstants";
import type { AddRelativeSlot } from "./NodeActionButtons";
import { AddRelativePopup } from "./AddRelativePopup";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const people = [
  { id: "p1", name: "Alice Smith" },
  { id: "p2", name: "Bob Jones" }
];

describe("AddRelativePopup", () => {
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

  const renderPopup = (
    onSubmit = vi.fn().mockResolvedValue(undefined),
    slot: AddRelativeSlot = "siblingOrSpouse"
  ) => {
    act(() => {
      root.render(
        <AddRelativePopup
          slot={slot}
          selectedPersonName="Selected Person"
          people={people}
          busy={false}
          onCancel={() => undefined}
          onSubmit={onSubmit}
        />
      );
    });
    return onSubmit;
  };

  const typeName = async (value: string) => {
    const input = container.querySelector('input[list="add-relative-options"]') as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      valueSetter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  it("shows create offer for a typed name that does not match an existing person", async () => {
    renderPopup();

    await typeName("Charlie Brown");

    expect(container.textContent).toContain('Create "Charlie Brown" as a new person');
  });

  it("does not show create offer when the typed name matches an existing person", async () => {
    renderPopup();

    await typeName("Alice");

    expect(container.textContent).not.toContain("Create");
  });

  it("submits existing person payload", async () => {
    const onSubmit = renderPopup();

    await typeName("Alice");
    const submit = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Add"
    );
    expect(submit).toBeTruthy();

    await act(async () => {
      submit!.click();
    });

    expect(onSubmit).toHaveBeenCalledWith({
      type: "existing",
      personName: "Alice",
      relationshipType: RELATIONSHIP_TYPES.siblingOf
    });
  });

  it("creates a new person when submitting an unmatched typed name directly", async () => {
    const onSubmit = renderPopup();

    await typeName("Charlie Brown");
    const submit = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Create & Add")
    );
    expect(submit).toBeTruthy();

    await act(async () => {
      submit!.click();
    });

    expect(onSubmit).toHaveBeenCalledWith({
      type: "new",
      givenName: "Charlie",
      surname: "Brown",
      gender: "UNKNOWN",
      relationshipType: RELATIONSHIP_TYPES.siblingOf
    });
  });

  it.each([
    {
      slot: "parent" as const,
      expectedRelationshipType: undefined
    },
    {
      slot: "child" as const,
      expectedRelationshipType: undefined
    },
    {
      slot: "siblingOrSpouse" as const,
      expectedRelationshipType: RELATIONSHIP_TYPES.siblingOf
    }
  ])(
    "creates a new person when submitting an unmatched typed name directly for the $slot slot",
    async ({ slot, expectedRelationshipType }) => {
      const onSubmit = renderPopup(undefined, slot);

      await typeName("Charlie Brown");
      const submit = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Create & Add")
      );
      expect(submit).toBeTruthy();

      await act(async () => {
        submit!.click();
      });

      expect(onSubmit).toHaveBeenCalledWith({
        type: "new",
        givenName: "Charlie",
        surname: "Brown",
        gender: "UNKNOWN",
        relationshipType: expectedRelationshipType
      });
    }
  );

  it("switches to create mode and submits new person payload", async () => {
    const onSubmit = renderPopup();

    await typeName("Charlie Brown");
    const createOffer = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Create")
    );
    expect(createOffer).toBeTruthy();

    await act(async () => {
      createOffer!.click();
    });

    expect(container.textContent).toContain("Create a new Treemich person");
    const inputs = container.querySelectorAll("input");
    const givenNameInput = inputs[0] as HTMLInputElement;
    const surnameInput = inputs[1] as HTMLInputElement;
    const select = container.querySelector("select") as HTMLSelectElement;
    const inputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    const selectValueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;

    await act(async () => {
      inputValueSetter.call(givenNameInput, "Charlie");
      givenNameInput.dispatchEvent(new Event("input", { bubbles: true }));
      inputValueSetter.call(surnameInput, "Brown");
      surnameInput.dispatchEvent(new Event("input", { bubbles: true }));
      selectValueSetter.call(select, "MALE");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const submit = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Create & Add")
    );
    expect(submit).toBeTruthy();

    await act(async () => {
      submit!.click();
    });

    expect(onSubmit).toHaveBeenCalledWith({
      type: "new",
      givenName: "Charlie",
      surname: "Brown",
      gender: "MALE",
      relationshipType: RELATIONSHIP_TYPES.siblingOf
    });
  });
});
