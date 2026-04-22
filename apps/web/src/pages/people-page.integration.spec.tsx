import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeoplePage } from "./people";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../components/PeopleGraph3D", () => ({
  PeopleGraph3D: () => null
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

  beforeEach(() => {
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
        return jsonResponse({
          relationships: [{ id: "r1", fromPersonId: "p1", toPersonId: "p2", type: "PARENT_OF" }],
          nextCursor: null
        });
      }

      if (method === "GET" && url.endsWith("/user/preferences")) {
        return jsonResponse({});
      }

      if (method === "GET" && /\/people$/.test(url)) {
        return jsonResponse({
          people: [
            { id: "p1", name: "Alex", hasRelationship: true, birthDate: "1990-01-01" },
            { id: "p2", name: "Blair", hasRelationship: true, birthDate: null }
          ]
        });
      }

      if (method === "GET" && url.includes("/people/p1/life-events/validation")) {
        return jsonResponse({ findings: [] });
      }

      if (method === "GET" && url.includes("/people/p1/life-events")) {
        return jsonResponse({
          lifeEvents: [birthEventPayload]
        });
      }

      if (method === "PATCH" && /\/people\/p1$/.test(url) && !url.includes("life-events")) {
        return jsonResponse({
          immichPersonId: "p1",
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
});
