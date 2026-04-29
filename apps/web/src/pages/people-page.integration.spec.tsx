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

const setInputValue = (input: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
};

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
  let preferencePatchShouldFail = false;
  let preferencesGetNeverResolves = false;

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
    preferencePatchShouldFail = false;
    preferencesGetNeverResolves = false;
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
        if (preferencesGetNeverResolves) {
          return new Promise<Response>(() => undefined);
        }
        return jsonResponse({});
      }

      if (method === "PATCH" && url.endsWith("/user/preferences")) {
        if (preferencePatchShouldFail) {
          return jsonResponse({ error: "save failed" }, 500);
        }
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
        return jsonResponse({
          showSingleFamilyTree: true,
          primaryFamilyUnitByPersonId: {},
          cooccurrence: { refreshEnabled: true, refreshIntervalDays: 7 },
          searchIncludeAlternateNames: body.searchIncludeAlternateNames ?? true
        });
      }

      if (method === "GET" && /\/people$/.test(url)) {
        peopleLoadCount += 1;
        if (peopleLoadCount > 1) {
          return jsonResponse({
            people: [
              {
                id: "p1",
                name: "Alex Smith",
                hasRelationship: true,
                birthDate: "1990-01-01",
                profile: { id: "p1", gender: "UNKNOWN", givenName: "Alex", surname: "Smith", nicknames: null }
              },
              { id: "p2", name: "Blair", hasRelationship: true, birthDate: null },
              { id: "p3", name: "Charlie Brown", hasRelationship: true, birthDate: null }
            ]
          });
        }
        return jsonResponse({
          people: [
            {
              id: "p1",
              name: "Alex Smith",
              hasRelationship: true,
              birthDate: "1990-01-01",
              profile: { id: "p1", gender: "UNKNOWN", givenName: "Alex", surname: "Smith", nicknames: null }
            },
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
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, string | null>) : {};
        return jsonResponse({
          id: "p1",
          gender: body.gender ?? "UNKNOWN",
          givenName: body.givenName ?? null,
          surname: body.surname ?? null,
          nicknames: body.nicknames ?? null
        });
      }

      if (method === "PATCH" && url.includes("/people/p1/life-events/")) {
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, number | null>) : {};
        return jsonResponse({
          ...birthEventPayload,
          year: body.year ?? birthEventPayload.year,
          month: body.month ?? birthEventPayload.month,
          day: body.day ?? birthEventPayload.day
        });
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

  it("updates graph person name immediately after profile save", async () => {
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
      if (latestGraphProps?.people?.some((person) => person.id === "p1")) {
        break;
      }
    }

    expect(latestGraphProps?.people?.find((person) => person.id === "p1")?.name).toBe("Alex Smith");

    const profileContent = container.querySelector("#person-detail-section-content-profile");
    const labels = [...(profileContent?.querySelectorAll(".field-group") ?? [])];
    const inputByLabel = (text: string) =>
      labels
        .find((label) => label.querySelector(".field-label")?.textContent === text)
        ?.querySelector("input") ?? null;
    const givenNameInput = inputByLabel("Given name") as HTMLInputElement | null;
    const surnameInput = inputByLabel("Surname") as HTMLInputElement | null;
    expect(givenNameInput).toBeTruthy();
    expect(surnameInput).toBeTruthy();

    await act(async () => {
      setInputValue(givenNameInput!, "Taylor");
      setInputValue(surnameInput!, "Jones");
    });

    const saveButton = container.querySelector(".person-detail-primary-action") as HTMLButtonElement | null;
    expect(saveButton?.textContent).toContain("Save profile");

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    for (let i = 0; i < 20; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      const graphPerson = latestGraphProps?.people?.find((person) => person.id === "p1");
      if (graphPerson?.name === "Taylor Jones") {
        break;
      }
    }

    const fetchMock = vi.mocked(globalThis.fetch);
    const profilePatch = fetchMock.mock.calls.find(
      (call) => String(call[0]).match(/\/people\/p1$/) && call[1]?.method === "PATCH"
    );
    expect(profilePatch?.[1]?.body).toBe(
      JSON.stringify({ gender: "UNKNOWN", givenName: "Taylor", surname: "Jones", nicknames: null })
    );
    expect(latestGraphProps?.people?.find((person) => person.id === "p1")?.name).toBe("Taylor Jones");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("updates birth date display and graph people immediately after profile save", async () => {
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
      if (container.textContent?.includes("Birth date: Jan 1, 1990")) {
        break;
      }
    }

    expect(container.textContent).toContain("Birth date: Jan 1, 1990");
    expect(latestGraphProps?.people?.find((person) => person.id === "p1")?.birthDate).toBe("1990-01-01");

    const birthInput = container.querySelector(
      '#person-detail-section-content-profile input[type="date"]'
    ) as HTMLInputElement | null;
    expect(birthInput).toBeTruthy();

    await act(async () => {
      setInputValue(birthInput!, "1992-02-03");
    });

    const saveButton = container.querySelector(".person-detail-primary-action") as HTMLButtonElement | null;
    expect(saveButton?.textContent).toContain("Save profile");

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    for (let i = 0; i < 20; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      const graphPerson = latestGraphProps?.people?.find((person) => person.id === "p1");
      if (
        graphPerson?.birthDate === "1992-02-03" &&
        container.textContent?.includes("Birth date: Feb 3, 1992")
      ) {
        break;
      }
    }

    expect(latestGraphProps?.people?.find((person) => person.id === "p1")?.birthDate).toBe("1992-02-03");
    expect(container.textContent).toContain("Birth date: Feb 3, 1992");

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

  it("renders Settings search preferences and disables planned workspaces", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(createElement(PeoplePage, { immichBaseUrl: null, currentUserName: null }));
    });

    const researchNav = container.querySelector('[data-workspace="research"]') as HTMLButtonElement | null;
    const reportsNav = container.querySelector('[data-workspace="reports"]') as HTMLButtonElement | null;
    const settingsNav = container.querySelector('[data-workspace="settings"]') as HTMLButtonElement | null;

    expect(researchNav?.disabled).toBe(true);
    expect(researchNav?.title).toBe("Planned for Phase C");
    expect(reportsNav?.disabled).toBe(true);
    expect(reportsNav?.title).toBe("Planned for Phase E");
    expect(settingsNav?.disabled).toBe(false);

    await act(async () => {
      settingsNav!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Search settings");
    expect(container.textContent).toContain("Match alternate Treemich names in relationship search");
    const checkbox = container.querySelector('.settings-toggle input[type="checkbox"]') as HTMLInputElement | null;
    expect(checkbox?.checked).toBe(true);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows a Settings skeleton while preferences are loading", async () => {
    preferencesGetNeverResolves = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(createElement(PeoplePage, { immichBaseUrl: null, currentUserName: null }));
    });

    const settingsNav = container.querySelector('[data-workspace="settings"]') as HTMLButtonElement | null;
    await act(async () => {
      settingsNav!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[aria-label="Loading search settings"]')).toBeTruthy();
    expect(container.querySelector(".settings-skeleton")).toBeTruthy();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("saves Settings alternate-name preference immediately", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(createElement(PeoplePage, { immichBaseUrl: null, currentUserName: null }));
    });

    const settingsNav = container.querySelector('[data-workspace="settings"]') as HTMLButtonElement | null;
    await act(async () => {
      settingsNav!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const checkbox = container.querySelector('.settings-toggle input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      checkbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const preferencePatch = vi.mocked(globalThis.fetch).mock.calls.find(
      (call) =>
        String(call[0]).endsWith("/user/preferences") &&
        call[1]?.method === "PATCH" &&
        String(call[1]?.body).includes("searchIncludeAlternateNames")
    );
    expect(preferencePatch?.[1]?.body).toBe(JSON.stringify({ searchIncludeAlternateNames: false }));
    expect(container.textContent).toContain("Alternate-name relationship search disabled.");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("rolls back Settings alternate-name preference when save fails", async () => {
    preferencePatchShouldFail = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(createElement(PeoplePage, { immichBaseUrl: null, currentUserName: null }));
    });

    const settingsNav = container.querySelector('[data-workspace="settings"]') as HTMLButtonElement | null;
    await act(async () => {
      settingsNav!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const checkbox = container.querySelector('.settings-toggle input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      checkbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const rolledBackCheckbox = container.querySelector(
      '.settings-toggle input[type="checkbox"]'
    ) as HTMLInputElement;
    expect(rolledBackCheckbox.checked).toBe(true);
    expect(container.textContent).toContain("Could not save search settings");

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
