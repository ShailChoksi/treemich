import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { GuestFocusGraph } from "./GuestFocusGraph";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../lib/api", () => ({
  guestFocusShareThumbnailUrl: (personId: string) => `/api/share/guest/people/${personId}/thumbnail`
}));

describe("GuestFocusGraph", () => {
  it("renders people labels and relationship edges", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <GuestFocusGraph
          focusAnchorPersonId="a1"
          people={[
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
              id: "p1",
              name: "Parent",
              givenName: "Parent",
              surname: null,
              hasThumbnail: false,
              hasImmichLink: false,
              birthDate: null,
              deathDate: null
            }
          ]}
          relationships={[
            {
              id: "r1",
              fromPersonId: "p1",
              toPersonId: "a1",
              type: "PARENT_OF"
            }
          ]}
        />
      );
    });

    expect(container.textContent).toContain("Ada");
    expect(container.textContent).toContain("Parent");
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelectorAll("line").length).toBe(1);
    expect(container.querySelector(".guest-focus-node--anchor")).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows empty copy when there are no people", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<GuestFocusGraph focusAnchorPersonId="a1" people={[]} relationships={[]} />);
    });

    expect(container.textContent).toContain("No people in this Focus view");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
