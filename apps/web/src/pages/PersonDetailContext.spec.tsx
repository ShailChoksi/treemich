import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeopleGraphDataProvider, usePeopleGraphData } from "./PeopleGraphDataContext";
import { PersonDetailProvider, usePersonDetail } from "./PersonDetailContext";
import { ToastProvider } from "./ToastContext";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const birthEvent = {
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
  place: null,
  citations: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const jsonResponse = (data: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" }
    })
  );

describe("PersonDetailContext", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (method === "GET" && /\/people$/.test(url)) {
        return jsonResponse({
          people: [
            {
              id: "p1",
              name: "Alex Smith",
              hasRelationship: true,
              birthDate: null,
              profile: { id: "p1", gender: "MALE", givenName: "Alex", surname: "Smith", nicknames: "Al" }
            }
          ]
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
      if (method === "PATCH" && url.endsWith("/user/preferences")) {
        return jsonResponse({});
      }
      if (method === "POST" && url.includes("/graph/layout")) {
        return jsonResponse({ layoutRevision: "lr1", algorithmVersion: "alg1", positionsByPersonId: {} });
      }
      if (method === "GET" && url.includes("/people/p1/life-events")) {
        return jsonResponse({ lifeEvents: [birthEvent] });
      }
      if (method === "GET" && url.includes("/people/p1/timeline")) {
        return jsonResponse({ timeline: [] });
      }
      if (method === "GET" && url.includes("/people/p1/research-tasks")) {
        return jsonResponse({ researchTasks: [] });
      }
      if (method === "GET" && url.includes("/people/p1/families")) {
        return jsonResponse({ families: [] });
      }
      if (method === "GET" && url.includes("/media/objects")) {
        return jsonResponse({ mediaObjects: [] });
      }
      if (method === "GET" && url.includes("/tree/validation")) {
        return jsonResponse({ findings: [], engineDisabled: false, persist: false });
      }
      return jsonResponse({ error: `unmocked ${method} ${url}` }, 404);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("rebuilds draft fields from people and loads selected life events", async () => {
    let selectedPersonId: string | null = null;
    let givenName = "";
    let birthDate = "";
    const Probe = () => {
      const graph = usePeopleGraphData();
      const detail = usePersonDetail();
      useEffect(() => {
        selectedPersonId = graph.selectedPersonId;
        givenName = graph.selectedPerson ? (detail.givenNameByPersonId[graph.selectedPerson.id] ?? "") : "";
        birthDate = detail.selectedProfileEventFields.birthDate;
      }, [
        detail.givenNameByPersonId,
        detail.selectedProfileEventFields.birthDate,
        graph.selectedPerson,
        graph.selectedPersonId
      ]);
      return null;
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          ToastProvider,
          null,
          createElement(
            PeopleGraphDataProvider,
            { immichBaseUrl: null, currentUserName: null },
            createElement(PersonDetailProvider, null, createElement(Probe))
          )
        )
      );
    });
    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      if (birthDate) {
        break;
      }
    }

    expect(selectedPersonId).toBe("p1");
    expect(givenName).toBe("Alex");
    expect(birthDate).toBe("1991-05-06");
    root.unmount();
  });
});
