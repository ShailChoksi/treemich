import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FamilyRecord, ImmichPerson } from "../../lib/api";
import { FamiliesSection } from "./FamiliesSection";

vi.mock("./FamilyLifeEventsBlock", () => ({
  FamilyLifeEventsBlock: () => null
}));

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const person: ImmichPerson = {
  id: "self-1",
  name: "Self Person",
  displayName: null,
  birthDate: null
};

const parent1: ImmichPerson = {
  id: "p1",
  name: "Parent One",
  displayName: null,
  birthDate: null
};

const parent2: ImmichPerson = {
  id: "p2",
  name: "Parent Two",
  displayName: null,
  birthDate: null
};

const baseFamily = (overrides: Partial<FamilyRecord> = {}): FamilyRecord => ({
  id: "fam-1",
  userId: "u1",
  parent1ImmichPersonId: "p1",
  parent2ImmichPersonId: "p2",
  notes: "Original notes",
  externalIds: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  children: [
    {
      id: "fc-1",
      childImmichPersonId: "self-1",
      pedigree: "BIOLOGICAL",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  ],
  ...overrides
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("FamiliesSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it("empty state keeps concise guidance", () => {
    act(() => {
      root.render(<FamiliesSection person={person} people={[person, parent1]} families={[]} />);
    });

    expect(container.textContent).toContain("not created automatically");
    expect(container.textContent).toContain("POST /families");
    expect(container.textContent).not.toContain("phase4:backfill-families");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("saves notes via onPatchFamily after editing", async () => {
    const onPatchFamily = vi.fn().mockResolvedValue(undefined);
    const family = baseFamily();

    act(() => {
      root.render(
        <FamiliesSection
          person={person}
          people={[person, parent1, parent2]}
          families={[family]}
          onPatchFamily={onPatchFamily}
        />
      );
    });

    const editNotesBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Edit notes"
    );
    expect(editNotesBtn).toBeTruthy();
    await act(async () => {
      editNotesBtn!.click();
    });

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      valueSetter.call(textarea, "Updated notes");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const saveBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Save");
    expect(saveBtn).toBeTruthy();
    await act(async () => {
      saveBtn!.click();
    });

    expect(onPatchFamily).toHaveBeenCalledWith("fam-1", { notes: "Updated notes" });

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("calls onDeleteFamily when delete is confirmed", async () => {
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmMock);
    const onDeleteFamily = vi.fn().mockResolvedValue(undefined);

    act(() => {
      root.render(
        <FamiliesSection
          person={person}
          people={[person, parent1, parent2]}
          families={[baseFamily()]}
          onDeleteFamily={onDeleteFamily}
        />
      );
    });

    const deleteBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Delete family"
    );
    expect(deleteBtn).toBeTruthy();
    await act(async () => {
      deleteBtn!.click();
    });

    expect(confirmMock).toHaveBeenCalled();
    expect(onDeleteFamily).toHaveBeenCalledWith("fam-1");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not delete when confirm is dismissed", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false)
    );
    const onDeleteFamily = vi.fn().mockResolvedValue(undefined);

    act(() => {
      root.render(
        <FamiliesSection
          person={person}
          people={[person, parent1, parent2]}
          families={[baseFamily()]}
          onDeleteFamily={onDeleteFamily}
        />
      );
    });

    const deleteBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Delete family"
    );
    await act(async () => {
      deleteBtn!.click();
    });

    expect(onDeleteFamily).toHaveBeenCalledTimes(0);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows an error when saving notes fails", async () => {
    const onPatchFamily = vi.fn().mockRejectedValue(new Error("network down"));

    act(() => {
      root.render(
        <FamiliesSection
          person={person}
          people={[person, parent1, parent2]}
          families={[baseFamily()]}
          onPatchFamily={onPatchFamily}
        />
      );
    });

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((b) => b.textContent === "Edit notes")!
        .click();
    });

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((b) => b.textContent === "Save")!
        .click();
    });

    expect(container.textContent).toContain("network down");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
