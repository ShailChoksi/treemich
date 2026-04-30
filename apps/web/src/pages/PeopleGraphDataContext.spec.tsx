import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonRecord, RelationshipRecord } from "../lib/api";
import { PeopleGraphDataProvider, samePeopleList, usePeopleGraphData } from "./PeopleGraphDataContext";
import { ToastProvider } from "./ToastContext";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const jsonResponse = (data: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" }
    })
  );

describe("PeopleGraphDataContext", () => {
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
              profile: { id: "p1", gender: "UNKNOWN", givenName: "Alex", surname: "Smith", nicknames: null }
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
      if (method === "POST" && url.includes("/people/p1/relationships")) {
        return jsonResponse({ id: "r2", fromPersonId: "p1", toPersonId: "p2", type: "SIBLING_OF" });
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

  it("loads graph data through the provider", async () => {
    let people: PersonRecord[] = [];
    const Probe = () => {
      const graph = usePeopleGraphData();
      useEffect(() => {
        people = graph.people;
      }, [graph.people]);
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
            createElement(Probe)
          )
        )
      );
    });
    for (let i = 0; i < 20; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      if (people.length > 0) {
        break;
      }
    }

    expect(people).toEqual([expect.objectContaining({ id: "p1", name: "Alex Smith" })]);
    root.unmount();
  });

  it("recognizes equivalent people lists", () => {
    const people: PersonRecord[] = [
      {
        id: "p1",
        name: "Alex Smith",
        hasRelationship: true,
        birthDate: null,
        profile: { id: "p1", gender: "UNKNOWN", givenName: "Alex", surname: "Smith", nicknames: null }
      }
    ];
    const relationships: RelationshipRecord[] = [];
    expect(
      samePeopleList(
        people,
        people.map((person) => ({ ...person }))
      )
    ).toBe(true);
    expect(relationships).toEqual([]);
  });

  it("refreshes only people for the people-only tier", async () => {
    let graph: ReturnType<typeof usePeopleGraphData> | null = null;
    const Probe = () => {
      graph = usePeopleGraphData();
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
            createElement(Probe)
          )
        )
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.mocked(globalThis.fetch).mockClear();

    await act(async () => {
      await graph?.refreshPeopleOnly();
    });

    const calls = vi.mocked(globalThis.fetch).mock.calls.map(([input, init]) => ({
      url: typeof input === "string" ? input : input.toString(),
      method: init?.method ?? "GET"
    }));
    expect(calls.some((call) => call.method === "GET" && /\/people$/.test(call.url))).toBe(true);
    expect(calls.some((call) => call.method === "GET" && call.url.includes("/relationships?"))).toBe(false);
    expect(calls.some((call) => call.method === "POST" && call.url.includes("/graph/layout"))).toBe(false);

    root.unmount();
  });

  it("refreshes only relationships for the metadata-only relationship tier", async () => {
    let graph: ReturnType<typeof usePeopleGraphData> | null = null;
    const Probe = () => {
      graph = usePeopleGraphData();
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
            createElement(Probe)
          )
        )
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.mocked(globalThis.fetch).mockClear();

    await act(async () => {
      await graph?.refreshRelationshipsOnly();
    });

    const calls = vi.mocked(globalThis.fetch).mock.calls.map(([input, init]) => ({
      url: typeof input === "string" ? input : input.toString(),
      method: init?.method ?? "GET"
    }));
    expect(calls.some((call) => call.method === "GET" && call.url.includes("/relationships?"))).toBe(true);
    expect(calls.some((call) => call.method === "GET" && /\/people$/.test(call.url))).toBe(false);
    expect(calls.some((call) => call.method === "POST" && call.url.includes("/graph/layout"))).toBe(false);

    root.unmount();
  });

  it("uses full layout refresh for structural relationship creation", async () => {
    let graph: ReturnType<typeof usePeopleGraphData> | null = null;
    const Probe = () => {
      graph = usePeopleGraphData();
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
            createElement(Probe)
          )
        )
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.mocked(globalThis.fetch).mockClear();

    await act(async () => {
      await graph?.onCreateRelationship("p1", "p2", "SIBLING_OF");
      await Promise.resolve();
    });

    const calls = vi.mocked(globalThis.fetch).mock.calls.map(([input, init]) => ({
      url: typeof input === "string" ? input : input.toString(),
      method: init?.method ?? "GET"
    }));
    expect(calls.some((call) => call.method === "GET" && /\/people$/.test(call.url))).toBe(true);
    expect(calls.some((call) => call.method === "GET" && call.url.includes("/relationships?"))).toBe(true);
    expect(calls.some((call) => call.method === "POST" && call.url.includes("/graph/layout"))).toBe(true);

    root.unmount();
  });
});
