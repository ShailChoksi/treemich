import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IMMICH_PEOPLE_SYNCED_EVENT, type PersonRecord, type RelationshipRecord } from "../lib/api";
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
    act(() => {
      root.unmount();
    });
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

  it("treats thumbnail and provider identity revisions as people list changes", () => {
    const people: PersonRecord[] = [
      {
        id: "p1",
        name: "Alex Smith",
        hasRelationship: true,
        birthDate: null,
        profile: { id: "p1", gender: "UNKNOWN", givenName: "Alex", surname: "Smith", nicknames: null },
        thumbnail: null,
        thumbnailPath: null,
        externalIdentities: []
      }
    ];

    expect(
      samePeopleList(people, [
        {
          ...people[0]!,
          thumbnail: {
            id: "thumb-1",
            personId: "p1",
            source: "UPLOADED",
            sourceExternalIdentityId: null,
            storageUrl: "treemich://thumb-1.jpg",
            mimeType: "image/jpeg",
            checksum: "checksum-1",
            importedAt: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          },
          thumbnailPath: "treemich://thumb-1.jpg"
        }
      ])
    ).toBe(false);

    expect(
      samePeopleList(people, [
        {
          ...people[0]!,
          externalIdentities: [
            {
              id: "identity-1",
              personId: "p1",
              provider: "IMMICH",
              providerPersonId: "immich-person-1",
              providerBaseUrl: "https://immich.example",
              displayName: "Alex in Immich",
              thumbnailImportedAt: "2026-01-02T00:00:00.000Z",
              lastSeenAt: null,
              metadata: {},
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-02T00:00:00.000Z"
            }
          ]
        }
      ])
    ).toBe(false);
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

    act(() => {
      root.unmount();
    });
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

    act(() => {
      root.unmount();
    });
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

    act(() => {
      root.unmount();
    });
  });

  it("exposes retryGraphData that runs the same fetches as a full graph refresh", async () => {
    const graphBox: { current: ReturnType<typeof usePeopleGraphData> | null } = { current: null };
    const Probe = () => {
      graphBox.current = usePeopleGraphData();
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
    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      if (graphBox.current && graphBox.current.people.length > 0 && !graphBox.current.isLoading) {
        break;
      }
    }
    expect(graphBox.current?.people.length).toBeGreaterThan(0);

    vi.mocked(globalThis.fetch).mockClear();

    await act(async () => {
      graphBox.current?.retryGraphData();
      for (let i = 0; i < 25; i += 1) {
        await Promise.resolve();
      }
    });

    const calls = vi.mocked(globalThis.fetch).mock.calls.map(([input, init]) => ({
      url: typeof input === "string" ? input : input.toString(),
      method: init?.method ?? "GET"
    }));
    expect(calls.some((call) => call.method === "GET" && /\/people$/.test(call.url))).toBe(true);
    expect(calls.some((call) => call.method === "GET" && call.url.includes("/relationships?"))).toBe(true);
    expect(calls.some((call) => call.method === "POST" && call.url.includes("/graph/layout"))).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  it("refetches people when the Immich labelled-people sync event fires", async () => {
    const graphBox: { current: ReturnType<typeof usePeopleGraphData> | null } = { current: null };
    const Probe = () => {
      graphBox.current = usePeopleGraphData();
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
    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      if (graphBox.current && graphBox.current.people.length > 0 && !graphBox.current.isLoading) {
        break;
      }
    }

    vi.mocked(globalThis.fetch).mockClear();

    await act(async () => {
      window.dispatchEvent(new Event(IMMICH_PEOPLE_SYNCED_EVENT));
      await Promise.resolve();
      await Promise.resolve();
    });

    const peopleCalls = vi.mocked(globalThis.fetch).mock.calls.filter(([input, init]) => {
      const url = typeof input === "string" ? input : input.toString();
      return (init?.method ?? "GET") === "GET" && /\/people$/.test(url);
    });
    expect(peopleCalls.length).toBeGreaterThanOrEqual(1);

    act(() => {
      root.unmount();
    });
  });
});
