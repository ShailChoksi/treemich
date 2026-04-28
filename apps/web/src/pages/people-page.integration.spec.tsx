import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeoplePage } from "./people";
import type { PersonRecord, RelationshipRecord, RelationshipType } from "../lib/api";
import type { GraphUiSnapshot, MapUiSnapshot } from "../lib/workspaceUiState";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

type GraphProps = {
  people?: PersonRecord[];
  relationships?: RelationshipRecord[];
  onCreateRelationship?: (
    sourcePersonId: string,
    targetPersonId: string,
    relationshipType: RelationshipType
  ) => Promise<void>;
  initialUiState?: GraphUiSnapshot;
  onUiStateChange?: (next: GraphUiSnapshot) => void;
};
let latestGraphProps: GraphProps | null = null;
vi.mock("../components/PeopleGraph3D", () => ({
  PeopleGraph3D: (props: GraphProps) => {
    latestGraphProps = props;
    return null;
  }
}));

type MapPanelProps = {
  places: Array<{ id: string; name: string; latitude: number; longitude: number }> | null;
  selectedPersonId?: string | null;
  initialUiState?: MapUiSnapshot;
  onUiStateChange?: (next: MapUiSnapshot) => void;
};
let latestMapPanelProps: MapPanelProps | null = null;
vi.mock("../components/MapPlacesPanel", () => ({
  MapPlacesPanel: (props: MapPanelProps) => {
    latestMapPanelProps = props;
    return null;
  }
}));

const jsonResponse = (data: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" }
    })
  );

const birthEventPayload = {
  id: "lev-b",
  eventType: "BIRTH",
  dateQualifier: "EXACT",
  year: 1991,
  month: 5,
  day: 6,
  endYear: null,
  endMonth: null,
  endDay: null,
  notes: null,
  place: {
    id: "pl-1",
    name: "Boston, US",
    locality: "Boston",
    countryCode: "US",
    addressLine1: null,
    adminArea: null,
    postalCode: null,
    latitude: null,
    longitude: null,
    notes: null
  },
  citations: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

describe("PeoplePage + life events (integration)", () => {
  const originalFetch = globalThis.fetch;
  let placesMapCallCount = 0;
  let peopleLoadCount = 0;
  let relationshipsLoadCount = 0;

  beforeEach(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
    latestMapPanelProps = null;
    latestGraphProps = null;
    placesMapCallCount = 0;
    peopleLoadCount = 0;
    relationshipsLoadCount = 0;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (method === "POST" && url.includes("/graph/layout")) {
        return jsonResponse({
          layoutRevision: "lr1",
          algorithmVersion: "alg1",
          positionsByPersonId: {
            p1: [0, 0, 0],
            p2: [1, 0, 0]
          }
        });
      }

      if (method === "GET" && url.includes("/relationships?")) {
        relationshipsLoadCount += 1;
        if (relationshipsLoadCount > 1) {
          return jsonResponse({
            relationships: [
              { id: "r1", fromPersonId: "p1", toPersonId: "p2", type: "PARENT_OF" },
              { id: "r2", fromPersonId: "p1", toPersonId: "p3", type: "SIBLING_OF" }
            ],
            nextCursor: null
          });
        }
        return jsonResponse({
          relationships: [{ id: "r1", fromPersonId: "p1", toPersonId: "p2", type: "PARENT_OF" }],
          nextCursor: null
        });
      }

      if (method === "GET" && url.endsWith("/user/preferences")) {
        return jsonResponse({});
      }

      if (method === "GET" && /\/people$/.test(url)) {
        peopleLoadCount += 1;
        if (peopleLoadCount > 1) {
          return jsonResponse({
            people: [
              { id: "p1", name: "Alex", hasRelationship: true, birthDate: "1990-01-01" },
              { id: "p2", name: "Blair", hasRelationship: true, birthDate: null },
              { id: "p3", name: "Charlie Brown", hasRelationship: true, birthDate: null }
            ]
          });
        }
        return jsonResponse({
          people: [
            { id: "p1", name: "Alex", hasRelationship: true, birthDate: "1990-01-01" },
            { id: "p2", name: "Blair", hasRelationship: true, birthDate: null }
          ]
        });
      }

      if (method === "POST" && url.includes("/people/p1/relationships")) {
        return jsonResponse({ id: "r2", fromPersonId: "p1", toPersonId: "p3", type: "SIBLING_OF" });
      }

      if (method === "GET" && url.includes("/people/p1/life-events/validation")) {
        return jsonResponse({ findings: [] });
      }

      if (method === "GET" && url.includes("/tree/validation")) {
        return jsonResponse({ findings: [], engineDisabled: false, persist: false });
      }

      if (method === "GET" && url.includes("/people/p1/life-events")) {
        return jsonResponse({
          lifeEvents: [birthEventPayload]
        });
      }

      if (method === "GET" && url.includes("/places/map")) {
        placesMapCallCount += 1;
        if (placesMapCallCount === 1) {
          return jsonResponse({ mapUiEnabled: true, places: [] });
        }
        return jsonResponse({
          mapUiEnabled: true,
          places: [
            {
              id: "pl-1",
              name: "Boston",
              latitude: 42.3601,
              longitude: -71.0589,
              eventCount: 1,
              personCount: 1,
              lastEventYear: 1991,
              samplePersonIds: ["p1"]
            }
          ]
        });
      }

      if (method === "PATCH" && /\/people\/p1$/.test(url) && !url.includes("life-events")) {
        return jsonResponse({
          id: "p1",
          gender: "UNKNOWN",
          givenName: null,
          surname: null,
          nicknames: null
        });
      }

      if (method === "PATCH" && url.includes("/people/p1/life-events/")) {
        return jsonResponse(birthEventPayload);
      }

      return jsonResponse({ error: `unmocked ${method} ${url}` }, 404);
    }) as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("loads person life events after selecting a person and hydrates profile quick-edit fields", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(createElement(PeoplePage, { immichBaseUrl: null, currentUserName: null }));
    });

    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      const fetchMock = vi.mocked(globalThis.fetch);
      if (fetchMock.mock.calls.some((call) => String(call[0]).includes("/people/p1/life-events"))) {
        break;
      }
    }

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/people/p1/life-events"))).toBe(
      true
    );

    const profileContent = container.querySelector("#person-detail-section-content-profile");
    const birthInput = profileContent?.querySelector('input[type="date"]') as HTMLInputElement | null;
    expect(birthInput?.value).toBe("1991-05-06");

    expect(container.textContent).toContain("Life events (advanced)");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("sends PATCH /people when Save profile is clicked after load", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(createElement(PeoplePage, { immichBaseUrl: null, currentUserName: null }));
    });

    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      const fetchMock = vi.mocked(globalThis.fetch);
      if (fetchMock.mock.calls.some((call) => String(call[0]).includes("/people/p1/life-events"))) {
        break;
      }
    }

    const saveButton = container.querySelector(".person-detail-primary-action") as HTMLButtonElement | null;
    expect(saveButton?.textContent).toContain("Save profile");

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    for (let i = 0; i < 20; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      const fetchMock = vi.mocked(globalThis.fetch);
      if (
        fetchMock.mock.calls.some(
          (call) => String(call[0]).match(/\/people\/p1$/) && call[1]?.method === "PATCH"
        )
      ) {
        break;
      }
    }

    const fetchMock = vi.mocked(globalThis.fetch);
    const profilePatch = fetchMock.mock.calls.find(
      (call) => String(call[0]).match(/\/people\/p1$/) && call[1]?.method === "PATCH"
    );
    expect(profilePatch).toBeTruthy();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("refreshes map places after profile save so new point can appear", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(createElement(PeoplePage, { immichBaseUrl: null, currentUserName: null }));
    });

    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      const fetchMock = vi.mocked(globalThis.fetch);
      if (fetchMock.mock.calls.some((call) => String(call[0]).includes("/people/p1/life-events"))) {
        break;
      }
    }

    const saveButton = container.querySelector(".person-detail-primary-action") as HTMLButtonElement | null;
    expect(saveButton?.textContent).toContain("Save profile");

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      const fetchMock = vi.mocked(globalThis.fetch);
      if (fetchMock.mock.calls.filter((call) => String(call[0]).includes("/places/map")).length >= 1) {
        break;
      }
    }

    const placesNav = container.querySelector('[data-workspace="places"]') as HTMLButtonElement | null;
    expect(placesNav).toBeTruthy();
    await act(async () => {
      placesNav!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      if ((latestMapPanelProps?.places?.length ?? 0) > 0) {
        break;
      }
    }

    const fetchMock = vi.mocked(globalThis.fetch);
    const mapCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes("/places/map"));
    expect(mapCalls.length).toBeGreaterThanOrEqual(1);
    expect(latestMapPanelProps?.places).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "pl-1",
          latitude: 42.3601,
          longitude: -71.0589
        })
      ])
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("refreshes people and relationships after creating a relationship while save state is active", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(createElement(PeoplePage, { immichBaseUrl: null, currentUserName: null }));
    });

    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      if (latestGraphProps?.onCreateRelationship) {
        break;
      }
    }

    await act(async () => {
      await latestGraphProps?.onCreateRelationship?.("p1", "p3", "SIBLING_OF");
    });

    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      if (latestGraphProps?.people?.some((person) => person.id === "p3")) {
        break;
      }
    }

    expect(peopleLoadCount).toBeGreaterThanOrEqual(2);
    expect(relationshipsLoadCount).toBeGreaterThanOrEqual(2);
    expect(latestGraphProps?.people).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "p3", name: "Charlie Brown" })])
    );
    expect(latestGraphProps?.relationships).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "r2", toPersonId: "p3" })])
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not request places map until the Places workspace is opened", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(createElement(PeoplePage, { immichBaseUrl: null, currentUserName: null }));
    });

    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      const fetchMock = vi.mocked(globalThis.fetch);
      if (fetchMock.mock.calls.some((call) => String(call[0]).includes("/people/p1/life-events"))) {
        break;
      }
    }

    const fetchMock = vi.mocked(globalThis.fetch);
    const mapCallsBefore = fetchMock.mock.calls.filter((call) => String(call[0]).includes("/places/map"));
    expect(mapCallsBefore.length).toBe(0);

    const placesNav = container.querySelector('[data-workspace="places"]') as HTMLButtonElement | null;
    await act(async () => {
      placesNav!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      if (
        vi.mocked(globalThis.fetch).mock.calls.filter((call) => String(call[0]).includes("/places/map"))
          .length >= 1
      ) {
        break;
      }
    }

    const mapCallsAfter = vi
      .mocked(globalThis.fetch)
      .mock.calls.filter((call) => String(call[0]).includes("/places/map"));
    expect(mapCallsAfter.length).toBeGreaterThanOrEqual(1);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("hydrates graph UI state from storage and persists callback updates", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      "treemich.graph.uiState",
      JSON.stringify({
        schemaVersion: 1,
        searchTerm: "alex",
        focusPersonId: "p1",
        pinnedPersonId: null,
        highlightedPersonIds: ["p1", "p2"],
        camera: {
          position: [1, 2, 3],
          target: [4, 5, 6]
        }
      })
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(createElement(PeoplePage, { immichBaseUrl: null, currentUserName: null }));
    });

    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      if (latestGraphProps?.initialUiState) {
        break;
      }
    }

    expect(latestGraphProps?.initialUiState).toEqual(
      expect.objectContaining({
        searchTerm: "alex",
        focusPersonId: "p1",
        highlightedPersonIds: ["p1", "p2"],
        camera: { position: [1, 2, 3], target: [4, 5, 6] }
      })
    );

    await act(async () => {
      latestGraphProps?.onUiStateChange?.({
        schemaVersion: 1,
        searchTerm: "updated",
        focusPersonId: "p2",
        pinnedPersonId: null,
        highlightedPersonIds: ["p2", "p3"],
        camera: null
      });
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(JSON.parse(window.localStorage.getItem("treemich.graph.uiState") ?? "{}")).toEqual(
      expect.objectContaining({
        searchTerm: "updated",
        focusPersonId: "p2",
        highlightedPersonIds: ["p2", "p3"]
      })
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("hydrates Places UI state from storage and ignores corrupted payloads", async () => {
    window.localStorage.setItem(
      "treemich.map.uiState",
      JSON.stringify({
        schemaVersion: 1,
        search: "boston",
        minEvents: 4,
        baseClusterCellDegrees: 2.2,
        center: [42.36, -71.05],
        zoom: 8
      })
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(createElement(PeoplePage, { immichBaseUrl: null, currentUserName: null }));
    });

    const placesNav = container.querySelector('[data-workspace="places"]') as HTMLButtonElement | null;
    await act(async () => {
      placesNav!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      if (latestMapPanelProps?.initialUiState) {
        break;
      }
    }

    expect(latestMapPanelProps?.initialUiState).toEqual(
      expect.objectContaining({
        search: "boston",
        minEvents: 4,
        center: [42.36, -71.05],
        zoom: 8
      })
    );

    act(() => {
      root.unmount();
    });
    container.remove();

    window.localStorage.setItem("treemich.map.uiState", "{bad");
    const container2 = document.createElement("div");
    document.body.appendChild(container2);
    const root2 = createRoot(container2);
    latestMapPanelProps = null;
    act(() => {
      root2.render(createElement(PeoplePage, { immichBaseUrl: null, currentUserName: null }));
    });
    const placesNav2 = container2.querySelector('[data-workspace="places"]') as HTMLButtonElement | null;
    await act(async () => {
      placesNav2!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      if ((latestMapPanelProps as MapPanelProps | null)?.initialUiState) {
        break;
      }
    }
    expect((latestMapPanelProps as MapPanelProps | null)?.initialUiState).toEqual(
      expect.objectContaining({ search: "", minEvents: 1, center: null, zoom: 2 })
    );
    act(() => {
      root2.unmount();
    });
    container2.remove();
  });
});
