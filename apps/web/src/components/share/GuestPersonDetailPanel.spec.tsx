import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import {
  buildGuestRelativeRows,
  formatGuestVitalDate,
  GuestPersonDetailPanel
} from "./GuestPersonDetailPanel";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("buildGuestRelativeRows", () => {
  it("lists relatives with labels from the guest graph edges", () => {
    const rows = buildGuestRelativeRows(
      "a1",
      [
        {
          id: "a1",
          name: "Ada",
          givenName: "Ada",
          surname: null,
          hasThumbnail: true,
          hasImmichLink: true,
          birthDate: null,
          deathDate: null
        },
        {
          id: "c1",
          name: "Byron",
          givenName: "Byron",
          surname: null,
          hasThumbnail: false,
          hasImmichLink: false,
          birthDate: null,
          deathDate: null
        }
      ],
      [{ id: "r1", fromPersonId: "a1", toPersonId: "c1", type: "PARENT_OF" }]
    );
    expect(rows).toEqual([
      {
        personId: "c1",
        name: "Byron",
        label: "Child",
        hasThumbnail: false
      }
    ]);
  });

  it("dedupes direct+inverse relationship pairs", () => {
    const people = [
      {
        id: "p1",
        name: "Pradeep",
        givenName: "Pradeep",
        surname: null,
        hasThumbnail: false,
        hasImmichLink: false,
        birthDate: null,
        deathDate: null
      },
      {
        id: "c1",
        name: "Ankur",
        givenName: "Ankur",
        surname: null,
        hasThumbnail: false,
        hasImmichLink: false,
        birthDate: null,
        deathDate: null
      },
      {
        id: "s1",
        name: "Anil",
        givenName: "Anil",
        surname: null,
        hasThumbnail: false,
        hasImmichLink: false,
        birthDate: null,
        deathDate: null
      }
    ];
    const rows = buildGuestRelativeRows("p1", people, [
      { id: "r1", fromPersonId: "p1", toPersonId: "c1", type: "PARENT_OF" },
      { id: "r2", fromPersonId: "c1", toPersonId: "p1", type: "CHILD_OF" },
      { id: "r3", fromPersonId: "p1", toPersonId: "s1", type: "SIBLING_OF" },
      { id: "r4", fromPersonId: "s1", toPersonId: "p1", type: "SIBLING_OF" }
    ]);
    expect(rows).toEqual([
      { personId: "s1", name: "Anil", label: "Sibling", hasThumbnail: false },
      { personId: "c1", name: "Ankur", label: "Child", hasThumbnail: false }
    ]);
  });
});

const people = [
  {
    id: "a1",
    name: "Ada",
    givenName: "Ada",
    surname: null,
    hasThumbnail: false,
    hasImmichLink: false,
    birthDate: null,
    deathDate: null
  },
  {
    id: "c1",
    name: "Byron",
    givenName: "Byron",
    surname: null,
    hasThumbnail: false,
    hasImmichLink: false,
    birthDate: null,
    deathDate: null
  },
  {
    id: "s1",
    name: "Spouse",
    givenName: "Spouse",
    surname: null,
    hasThumbnail: false,
    hasImmichLink: false,
    birthDate: null,
    deathDate: null
  }
];

const relationships = [
  { id: "r1", fromPersonId: "a1", toPersonId: "c1", type: "PARENT_OF" },
  { id: "r2", fromPersonId: "a1", toPersonId: "s1", type: "SPOUSE_OF" }
];

describe("formatGuestVitalDate", () => {
  it("formats year-only, year-month, and full dates", () => {
    expect(formatGuestVitalDate(null)).toBeNull();
    expect(formatGuestVitalDate("1950")).toBe("1950");
    expect(formatGuestVitalDate("1950-03")).toMatch(/1950/);
    expect(formatGuestVitalDate("1950-03-12")).toMatch(/1950/);
  });
});

describe("GuestPersonDetailPanel", () => {
  it("shows birth and death dates when present", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <GuestPersonDetailPanel
          person={{
            ...people[0]!,
            birthDate: "1950-03-12",
            deathDate: "2020"
          }}
          people={people}
          relationships={relationships}
          onSelectRelative={vi.fn()}
          onClose={vi.fn()}
        />
      );
    });

    expect(container.textContent).toContain("Born");
    expect(container.textContent).toContain("Died");
    expect(container.textContent).toContain("2020");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders read-only details and selects a relative", async () => {
    const onSelectRelative = vi.fn();
    const onClose = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <GuestPersonDetailPanel
          person={people[0]!}
          people={people}
          relationships={relationships}
          onSelectRelative={onSelectRelative}
          onClose={onClose}
        />
      );
    });

    expect(container.textContent).toContain("Ada");
    expect(container.textContent).toContain("Read-only shared view");
    expect(container.textContent).toContain("Byron");

    const relativeButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Byron")
    );
    expect(relativeButton).toBeTruthy();
    await act(async () => {
      relativeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelectRelative).toHaveBeenCalledWith("c1");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("replaces the relatives list when the selected person changes", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <GuestPersonDetailPanel
          key="a1"
          person={people[0]!}
          people={people}
          relationships={relationships}
          onSelectRelative={vi.fn()}
          onClose={vi.fn()}
        />
      );
    });

    expect(container.querySelector("[data-person-id='a1']")).not.toBeNull();
    expect(container.textContent).toContain("Byron");
    expect(container.textContent).toContain("Spouse");
    expect(container.textContent).toContain("Child");

    await act(async () => {
      root.render(
        <GuestPersonDetailPanel
          key="c1"
          person={people[1]!}
          people={people}
          relationships={relationships}
          onSelectRelative={vi.fn()}
          onClose={vi.fn()}
        />
      );
    });

    expect(container.querySelector("[data-person-id='c1']")).not.toBeNull();
    expect(container.textContent).toContain("Byron");
    expect(container.textContent).toContain("Ada");
    expect(container.textContent).toContain("Parent");
    expect(container.textContent).not.toContain("Spouse");
    expect(container.textContent).not.toContain("Child");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
