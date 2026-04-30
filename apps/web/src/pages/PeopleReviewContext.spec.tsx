import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeopleGraphDataProvider } from "./PeopleGraphDataContext";
import { PeopleReviewProvider, usePeopleReview } from "./PeopleReviewContext";
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

describe("PeopleReviewContext", () => {
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
      if (method === "GET" && url.includes("/tree/validation")) {
        return jsonResponse({ findings: [], engineDisabled: false, persist: false });
      }
      if (method === "GET" && url.includes("/research/tasks?personId=p1")) {
        return jsonResponse({
          tasks: [
            { id: "t1", personId: "p1", title: "Check census", status: "OPEN", dueDate: null, notes: null }
          ]
        });
      }
      if (method === "GET" && url.endsWith("/research/tasks")) {
        return jsonResponse({
          tasks: [
            { id: "t2", personId: null, title: "Global task", status: "OPEN", dueDate: null, notes: null }
          ]
        });
      }
      if (method === "GET" && url.includes("/validation/findings")) {
        return jsonResponse({ findings: [{ id: "vf1", status: "OPEN", severity: "warning", code: "TEST" }] });
      }
      if (method === "GET" && url.includes("/people/duplicates?")) {
        return jsonResponse({ candidates: [{ id: "dup1", status: "PENDING" }] });
      }
      if (method === "POST" && url.includes("/people/duplicates/dup1/merge")) {
        return jsonResponse({ canonicalPersonId: "p1", duplicatePersonId: "p2" });
      }
      return jsonResponse({ error: `unmocked ${method} ${url}` }, 404);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("loads selected-person research tasks in the page-scoped review provider", async () => {
    let taskCount = 0;
    const Probe = () => {
      const review = usePeopleReview();
      useEffect(() => {
        taskCount = review.researchTasksByPersonId.p1?.length ?? 0;
      }, [review.researchTasksByPersonId]);
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
            createElement(PeopleReviewProvider, null, createElement(Probe))
          )
        )
      );
    });
    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      if (taskCount > 0) {
        break;
      }
    }

    expect(taskCount).toBe(1);
    root.unmount();
  });

  it("owns duplicate merge workflow and triggers full graph refresh", async () => {
    let review: ReturnType<typeof usePeopleReview> | null = null;
    const Probe = () => {
      review = usePeopleReview();
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
            createElement(PeopleReviewProvider, null, createElement(Probe))
          )
        )
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.mocked(globalThis.fetch).mockClear();

    await act(async () => {
      await review?.handleDuplicateMerge("dup1", "p1", "p2");
      await Promise.resolve();
    });

    const calls = vi.mocked(globalThis.fetch).mock.calls.map(([input, init]) => ({
      url: typeof input === "string" ? input : input.toString(),
      method: init?.method ?? "GET"
    }));
    expect(
      calls.some((call) => call.method === "POST" && call.url.includes("/people/duplicates/dup1/merge"))
    ).toBe(true);
    expect(calls.some((call) => call.method === "GET" && /\/people$/.test(call.url))).toBe(true);
    expect(calls.some((call) => call.method === "POST" && call.url.includes("/graph/layout"))).toBe(true);

    root.unmount();
  });
});
