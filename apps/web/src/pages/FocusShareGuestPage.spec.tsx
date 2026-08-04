import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusShareGuestGraphResponse, FocusShareGuestUnlockResponse } from "@treemich/shared";
import { FocusShareGuestPage } from "./FocusShareGuestPage";
import { parseFocusSharePublicIdFromPath } from "../lib/api";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const unlockFocusShare = vi.fn();
const fetchGuestFocusShareGraph = vi.fn();

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    unlockFocusShare: (...args: unknown[]) => unlockFocusShare(...args),
    fetchGuestFocusShareGraph: (...args: unknown[]) => fetchGuestFocusShareGraph(...args)
  };
});

vi.mock("../components/share/GuestPeopleGraph3D", () => ({
  GuestPeopleGraph3D: ({
    people,
    onSelectedPersonChange,
    depths
  }: {
    people: Array<{ id: string; name: string }>;
    onSelectedPersonChange: (personId: string | null) => void;
    depths: { ancestorDepth: number; descendantDepth: number; collateralDepth: number };
  }) => (
    <div data-testid="guest-graph-3d">
      <span data-testid="guest-depths">
        {depths.ancestorDepth}/{depths.descendantDepth}/{depths.collateralDepth}
      </span>
      <button type="button" onClick={() => onSelectedPersonChange(people[0]?.id ?? null)}>
        Select {people[0]?.name}
      </button>
      {people.map((person) => person.name).join(", ")}
    </div>
  )
}));

const shareView = {
  publicId: "pub-1",
  label: "Family reunion",
  focusAnchorPersonId: "a1",
  maxAncestorDepth: 2,
  maxDescendantDepth: 1,
  maxCollateralDepth: 0
};

const graphResponse: FocusShareGuestGraphResponse = {
  share: shareView,
  depths: {
    ancestorDepth: 2,
    descendantDepth: 1,
    collateralDepth: 0
  },
  people: [
    {
      id: "a1",
      name: "Ada",
      givenName: "Ada",
      surname: null,
      hasThumbnail: true,
      hasImmichLink: true,
      birthDate: null,
      deathDate: null
    }
  ],
  relationships: [],
  layout: {
    primaryFamilyUnitByPersonId: {},
    treeLayoutPreferences: {}
  }
};

const unlockResponse: FocusShareGuestUnlockResponse = {
  share: shareView,
  expiresAt: new Date(Date.now() + 60_000).toISOString()
};

describe("parseFocusSharePublicIdFromPath", () => {
  it("extracts public ids and rejects guest API paths", () => {
    expect(parseFocusSharePublicIdFromPath("/share/abc123")).toBe("abc123");
    expect(parseFocusSharePublicIdFromPath("/share/abc%2Fdef")).toBe("abc/def");
    expect(parseFocusSharePublicIdFromPath("/share/guest")).toBeNull();
    expect(parseFocusSharePublicIdFromPath("/share/guest/graph")).toBeNull();
    expect(parseFocusSharePublicIdFromPath("/people")).toBeNull();
  });
});

describe("FocusShareGuestPage", () => {
  beforeEach(() => {
    unlockFocusShare.mockReset();
    fetchGuestFocusShareGraph.mockReset();
    sessionStorage.clear();
  });

  it("shows the password gate when there is no guest session", async () => {
    const { ApiHttpError } = await import("../lib/api");
    fetchGuestFocusShareGraph.mockRejectedValue(new ApiHttpError(401, "Unauthorized"));

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<FocusShareGuestPage publicId="pub-1" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Enter the password");
    expect(container.querySelector('input[type="password"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("loads the graph when a guest session already exists", async () => {
    fetchGuestFocusShareGraph.mockResolvedValue(graphResponse);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<FocusShareGuestPage publicId="pub-1" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Family reunion");
    expect(container.textContent).toContain("Ada");
    expect(container.querySelector('[data-testid="guest-graph-3d"]')).not.toBeNull();

    const selectButton = container.querySelector('[data-testid="guest-graph-3d"] button');
    expect(selectButton).not.toBeNull();
    await act(async () => {
      selectButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Read-only shared view");
    expect(container.textContent).toContain("Relatives");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("unlocks then loads the graph at share max depths", async () => {
    const { ApiHttpError } = await import("../lib/api");
    fetchGuestFocusShareGraph
      .mockRejectedValueOnce(new ApiHttpError(401, "Unauthorized"))
      .mockResolvedValueOnce(graphResponse);
    unlockFocusShare.mockResolvedValue(unlockResponse);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<FocusShareGuestPage publicId="pub-1" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement | null;
    const form = container.querySelector("form");
    expect(passwordInput).not.toBeNull();
    expect(form).not.toBeNull();

    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      valueSetter?.call(passwordInput!, "secret-password");
      passwordInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(unlockFocusShare).toHaveBeenCalledWith("pub-1", { password: "secret-password" });
    expect(fetchGuestFocusShareGraph).toHaveBeenLastCalledWith({
      ancestorDepth: 2,
      descendantDepth: 1,
      collateralDepth: 0
    });
    expect(container.textContent).toContain("Ada");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
