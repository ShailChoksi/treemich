import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_ONBOARDING_TUTORIAL_VERSION } from "./components/OnboardingTutorialDialog";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./pages/people", () => ({
  PeoplePage: () => createElement("div", { "data-testid": "people-stub" }, "People stub")
}));

import { App } from "./App";

const jsonResponse = (data: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" }
    })
  );

describe("App onboarding tutorial (integration)", () => {
  const originalFetch = globalThis.fetch;
  let preferencesBody: Record<string, unknown>;

  beforeEach(() => {
    preferencesBody = {};
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const method = init?.method ?? "GET";

      if (method === "GET" && url.includes("/auth/me")) {
        return jsonResponse({
          authenticated: true,
          user: { id: "user-1", email: "a@example.com", name: "Alex" },
          linkStatus: { linked: false }
        });
      }

      if (method === "GET" && url.includes("/auth/link-status")) {
        return jsonResponse({ linked: false });
      }

      if (method === "GET" && url.includes("/user/preferences")) {
        return jsonResponse({
          graphRenderLimit: 120,
          showSingleFamilyTree: false,
          primaryFamilyUnitByPersonId: {},
          cooccurrence: { refreshEnabled: true, refreshIntervalDays: 7 },
          searchIncludeAlternateNames: true,
          ...preferencesBody
        });
      }

      if (method === "PATCH" && url.includes("/user/preferences")) {
        const raw = init?.body ? String(init.body) : "{}";
        const patch = JSON.parse(raw) as Record<string, unknown>;
        const merged = {
          graphRenderLimit: 120,
          showSingleFamilyTree: false,
          primaryFamilyUnitByPersonId: {},
          cooccurrence: { refreshEnabled: true, refreshIntervalDays: 7 },
          searchIncludeAlternateNames: true,
          ...preferencesBody,
          ...patch
        };
        preferencesBody = merged;
        return jsonResponse(merged);
      }

      return Promise.resolve(
        new Response(JSON.stringify({ error: `unmocked: ${method} ${url}` }), { status: 404 })
      );
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.innerHTML = "";
  });

  const flushEffects = async () => {
    await act(async () => {
      await new Promise<void>((r) => {
        window.setTimeout(r, 0);
      });
    });
  };

  it("opens the onboarding tutorial when preferences omit the current dismissed version", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });
    await flushEffects();
    await act(async () => {
      await new Promise<void>((r) => {
        window.setTimeout(r, 0);
      });
    });

    expect(document.body.textContent).toContain("Welcome to Treemich");
    expect(document.body.textContent).toContain("Step 1 of 5");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not open the tutorial when preferences already dismissed the current version", async () => {
    preferencesBody = {
      onboardingTutorial: {
        dismissedVersion: CURRENT_ONBOARDING_TUTORIAL_VERSION,
        dismissedAt: "2025-05-01T12:00:00.000Z"
      }
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });
    await flushEffects();
    await act(async () => {
      await new Promise<void>((r) => {
        window.setTimeout(r, 0);
      });
    });

    expect(document.body.textContent).not.toContain("Welcome to Treemich");
    expect(container.textContent).toContain("People stub");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("PATCHes dismissal when Skip tutorial is used", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });
    await flushEffects();
    await act(async () => {
      await new Promise<void>((r) => {
        window.setTimeout(r, 0);
      });
    });

    const skip = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Skip tutorial");
    await act(async () => {
      skip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await new Promise<void>((r) => {
        window.setTimeout(r, 0);
      });
    });

    const patchCalls = vi
      .mocked(globalThis.fetch)
      .mock.calls.filter(
        (call) => call[1]?.method === "PATCH" && String(call[0]).includes("/user/preferences")
      );
    expect(patchCalls.length).toBeGreaterThanOrEqual(1);
    const lastPatch = patchCalls[patchCalls.length - 1]!;
    const body = JSON.parse(String(lastPatch[1]?.body));
    expect(body.onboardingTutorial.dismissedVersion).toBe(CURRENT_ONBOARDING_TUTORIAL_VERSION);
    expect(typeof body.onboardingTutorial.dismissedAt).toBe("string");

    expect(document.body.textContent).not.toContain("Welcome to Treemich");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not block the app when onboarding preferences GET fails", async () => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const method = init?.method ?? "GET";

      if (method === "GET" && url.includes("/auth/me")) {
        return jsonResponse({
          authenticated: true,
          user: { id: "user-1", email: "a@example.com", name: "Alex" },
          linkStatus: { linked: false }
        });
      }
      if (method === "GET" && url.includes("/auth/link-status")) {
        return jsonResponse({ linked: false });
      }
      if (method === "GET" && url.includes("/user/preferences")) {
        return jsonResponse({ error: "preferences unavailable" }, 400);
      }
      return Promise.resolve(new Response("{}", { status: 404 }));
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });
    await flushEffects();
    await act(async () => {
      await new Promise<void>((r) => {
        window.setTimeout(r, 0);
      });
    });

    expect(document.body.textContent).not.toContain("Welcome to Treemich");
    expect(container.textContent).toContain("People stub");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows an inline error when dismissal PATCH fails and keeps the tutorial open", async () => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const method = init?.method ?? "GET";

      if (method === "GET" && url.includes("/auth/me")) {
        return jsonResponse({
          authenticated: true,
          user: { id: "user-1", email: "a@example.com", name: "Alex" },
          linkStatus: { linked: false }
        });
      }
      if (method === "GET" && url.includes("/auth/link-status")) {
        return jsonResponse({ linked: false });
      }
      if (method === "GET" && url.includes("/user/preferences")) {
        return jsonResponse({
          graphRenderLimit: 120,
          showSingleFamilyTree: false,
          primaryFamilyUnitByPersonId: {},
          cooccurrence: { refreshEnabled: true, refreshIntervalDays: 7 },
          searchIncludeAlternateNames: true
        });
      }
      if (method === "PATCH" && url.includes("/user/preferences")) {
        return jsonResponse({ error: "save failed" }, 500);
      }
      return Promise.resolve(new Response("{}", { status: 404 }));
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });
    await flushEffects();
    await act(async () => {
      await new Promise<void>((r) => {
        window.setTimeout(r, 0);
      });
    });

    const skip = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Skip tutorial");
    await act(async () => {
      skip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await new Promise<void>((r) => {
        window.setTimeout(r, 0);
      });
    });

    expect(document.body.textContent).toContain("Welcome to Treemich");
    expect(document.body.textContent).toContain("save failed");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

const setInputValue = (element: HTMLInputElement, value: string) => {
  const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
  proto?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("App Immich post-login sync (integration)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.innerHTML = "";
  });

  const prefsDismissedTutorial = {
    graphRenderLimit: 120,
    showSingleFamilyTree: false,
    primaryFamilyUnitByPersonId: {},
    cooccurrence: { refreshEnabled: true, refreshIntervalDays: 7 },
    searchIncludeAlternateNames: true,
    onboardingTutorial: {
      dismissedVersion: CURRENT_ONBOARDING_TUTORIAL_VERSION,
      dismissedAt: "2026-05-01T12:00:00.000Z"
    }
  };

  it("POSTs Immich labelled-people sync after Immich login when linked, then shows created-count notice", async () => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const method = init?.method ?? "GET";

      if (method === "GET" && url.includes("/auth/me")) {
        return jsonResponse({ authenticated: false, linkStatus: { linked: false } });
      }
      if (method === "POST" && url.includes("/auth/login")) {
        return jsonResponse({
          authenticated: true,
          user: { id: "user-1", email: "a@example.com", name: "Alex" },
          linkStatus: {
            linked: true,
            immichBaseUrl: "http://immich.local/api",
            immichEmail: "a@example.com",
            immichName: "Alex"
          }
        });
      }
      if (method === "GET" && url.includes("/auth/link-status")) {
        return jsonResponse({
          linked: true,
          immichBaseUrl: "http://immich.local/api",
          immichEmail: "a@example.com",
          immichName: "Alex"
        });
      }
      if (method === "POST" && url.includes("/providers/immich/people/sync")) {
        return jsonResponse({
          created: 2,
          updated: 0,
          alreadyLinked: 0,
          skippedUnnamed: 0,
          duplicateRecompute: { status: "skipped" }
        });
      }
      if (method === "GET" && url.includes("/user/preferences")) {
        return jsonResponse(prefsDismissedTutorial);
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: `unmocked ${method} ${url}` }), { status: 404 })
      );
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });
    await act(async () => {
      await new Promise<void>((r) => {
        window.setTimeout(r, 0);
      });
    });

    const providerSelect = document.querySelector("select") as HTMLSelectElement;
    expect(providerSelect).toBeTruthy();
    await act(async () => {
      providerSelect.value = "immich";
      providerSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(emailInput, "a@example.com");
      setInputValue(passwordInput, "secret");
    });

    await act(async () => {
      document.querySelector("form")?.requestSubmit();
    });
    for (let i = 0; i < 50; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      if (document.body.textContent?.includes("new Immich people added to your tree")) {
        break;
      }
    }

    const fetchMock = vi.mocked(globalThis.fetch);
    const loginCall = fetchMock.mock.calls.find(
      ([u, init]) => String(u).includes("/auth/login") && init?.method === "POST"
    );
    expect(loginCall).toBeTruthy();
    expect(JSON.parse(String(loginCall?.[1]?.body ?? "{}")).provider).toBe("immich");
    expect(
      fetchMock.mock.calls.some(
        ([u, init]) => String(u).includes("/providers/immich/people/sync") && init?.method === "POST"
      )
    ).toBe(true);
    expect(document.body.textContent).toContain("2 new Immich people added to your tree");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps Immich login successful when labelled-people sync fails", async () => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const method = init?.method ?? "GET";

      if (method === "GET" && url.includes("/auth/me")) {
        return jsonResponse({ authenticated: false, linkStatus: { linked: false } });
      }
      if (method === "POST" && url.includes("/auth/login")) {
        return jsonResponse({
          authenticated: true,
          user: { id: "user-1", email: "a@example.com", name: "Alex" },
          linkStatus: {
            linked: true,
            immichBaseUrl: "http://immich.local/api",
            immichEmail: "a@example.com",
            immichName: "Alex"
          }
        });
      }
      if (method === "GET" && url.includes("/auth/link-status")) {
        return jsonResponse({
          linked: true,
          immichBaseUrl: "http://immich.local/api",
          immichEmail: "a@example.com",
          immichName: "Alex"
        });
      }
      if (method === "POST" && url.includes("/providers/immich/people/sync")) {
        return Promise.resolve(new Response(JSON.stringify({ error: "sync down" }), { status: 500 }));
      }
      if (method === "GET" && url.includes("/user/preferences")) {
        return jsonResponse(prefsDismissedTutorial);
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: `unmocked ${method} ${url}` }), { status: 404 })
      );
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });
    await act(async () => {
      await new Promise<void>((r) => {
        window.setTimeout(r, 0);
      });
    });

    const providerSelect = document.querySelector("select") as HTMLSelectElement;
    await act(async () => {
      providerSelect.value = "immich";
      providerSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(emailInput, "a@example.com");
      setInputValue(passwordInput, "secret");
    });
    await act(async () => {
      document.querySelector("form")?.requestSubmit();
    });
    for (let i = 0; i < 50; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      if (document.body.textContent?.includes("People stub")) {
        break;
      }
    }

    expect(document.body.textContent).toContain("People stub");
    expect(document.body.textContent).not.toContain("Login failed");
    expect(document.body.textContent).not.toContain("new Immich people added to your tree");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("POSTs labelled-people sync after linking Immich from the session bar when created > 0", async () => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const method = init?.method ?? "GET";

      if (method === "GET" && url.includes("/auth/me")) {
        return jsonResponse({
          authenticated: true,
          user: { id: "user-1", email: "a@example.com", name: "Alex" },
          linkStatus: { linked: false }
        });
      }
      if (method === "GET" && url.includes("/auth/link-status")) {
        return jsonResponse({ linked: false });
      }
      if (method === "GET" && url.includes("/user/preferences")) {
        return jsonResponse(prefsDismissedTutorial);
      }
      if (method === "POST" && url.includes("/auth/immich/link")) {
        return jsonResponse({
          linked: true,
          immichBaseUrl: "http://immich.local/api",
          immichEmail: "imm@example.com",
          immichName: "Imm User"
        });
      }
      if (method === "POST" && url.includes("/providers/immich/people/sync")) {
        return jsonResponse({
          created: 1,
          updated: 0,
          alreadyLinked: 0,
          skippedUnnamed: 0,
          duplicateRecompute: { status: "skipped" }
        });
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: `unmocked ${method} ${url}` }), { status: 404 })
      );
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });
    await act(async () => {
      await new Promise<void>((r) => {
        window.setTimeout(r, 0);
      });
    });

    const summary = document.querySelector(".account-provider-panel summary") as HTMLElement;
    await act(async () => {
      summary?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const panel = document.querySelector(".account-provider-panel") as HTMLElement;
    const emailInput = panel?.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = panel?.querySelector('input[type="password"]') as HTMLInputElement;
    expect(emailInput).toBeTruthy();
    expect(passwordInput).toBeTruthy();
    await act(async () => {
      setInputValue(emailInput, "imm@example.com");
      setInputValue(passwordInput, "secret");
    });

    const linkButton = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Link Immich account")
    );
    await act(async () => {
      linkButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    for (let i = 0; i < 50; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      if (document.body.textContent?.includes("new Immich person added to your tree")) {
        break;
      }
    }

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(
      fetchMock.mock.calls.some(
        ([u, init]) => String(u).includes("/auth/immich/link") && init?.method === "POST"
      )
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        ([u, init]) => String(u).includes("/providers/immich/people/sync") && init?.method === "POST"
      )
    ).toBe(true);
    expect(document.body.textContent).toContain("1 new Immich person added to your tree");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("still links Immich when post-link sync fails", async () => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const method = init?.method ?? "GET";

      if (method === "GET" && url.includes("/auth/me")) {
        return jsonResponse({
          authenticated: true,
          user: { id: "user-1", email: "a@example.com", name: "Alex" },
          linkStatus: { linked: false }
        });
      }
      if (method === "GET" && url.includes("/auth/link-status")) {
        return jsonResponse({ linked: false });
      }
      if (method === "GET" && url.includes("/user/preferences")) {
        return jsonResponse(prefsDismissedTutorial);
      }
      if (method === "POST" && url.includes("/auth/immich/link")) {
        return jsonResponse({
          linked: true,
          immichBaseUrl: "http://immich.local/api",
          immichEmail: "imm@example.com",
          immichName: "Imm User"
        });
      }
      if (method === "POST" && url.includes("/providers/immich/people/sync")) {
        return Promise.resolve(new Response(JSON.stringify({ error: "down" }), { status: 503 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: `unmocked ${method} ${url}` }), { status: 404 })
      );
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });
    await act(async () => {
      await new Promise<void>((r) => {
        window.setTimeout(r, 0);
      });
    });

    (document.querySelector(".account-provider-panel summary") as HTMLElement)?.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
    const panel = document.querySelector(".account-provider-panel") as HTMLElement;
    const emailInput = panel?.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = panel?.querySelector('input[type="password"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(emailInput, "imm@example.com");
      setInputValue(passwordInput, "secret");
    });
    await act(async () => {
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent?.includes("Link Immich account"))
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    for (let i = 0; i < 50; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      if (document.body.textContent?.includes("Immich account linked")) {
        break;
      }
    }

    expect(document.body.textContent).toContain("Immich account linked");
    expect(document.body.textContent).not.toContain("new Immich person added to your tree");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("re-links Immich when user confirms replace on an already-linked account", async () => {
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmMock);
    try {
      globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
        const method = init?.method ?? "GET";

        if (method === "GET" && url.includes("/auth/me")) {
          return jsonResponse({
            authenticated: true,
            user: { id: "user-1", email: "a@example.com", name: "Alex" },
            linkStatus: {
              linked: true,
              immichBaseUrl: "http://old.local/api",
              immichEmail: "old@example.com",
              immichName: "Old"
            }
          });
        }
        if (method === "GET" && url.includes("/auth/link-status")) {
          return jsonResponse({
            linked: true,
            immichBaseUrl: "http://old.local/api",
            immichEmail: "old@example.com",
            immichName: "Old"
          });
        }
        if (method === "GET" && url.includes("/user/preferences")) {
          return jsonResponse(prefsDismissedTutorial);
        }
        if (method === "POST" && url.includes("/auth/immich/link")) {
          return jsonResponse({
            linked: true,
            immichBaseUrl: "http://immich.local/api",
            immichEmail: "new@example.com",
            immichName: "New"
          });
        }
        if (method === "POST" && url.includes("/providers/immich/people/sync")) {
          return jsonResponse({
            created: 0,
            updated: 0,
            alreadyLinked: 1,
            skippedUnnamed: 0,
            duplicateRecompute: { status: "skipped" }
          });
        }
        return Promise.resolve(
          new Response(JSON.stringify({ error: `unmocked ${method} ${url}` }), { status: 404 })
        );
      });

      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(createElement(App));
      });
      await act(async () => {
        await new Promise<void>((r) => {
          window.setTimeout(r, 0);
        });
      });

      (document.querySelector(".account-provider-panel summary") as HTMLElement)?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
      const panel = document.querySelector(".account-provider-panel") as HTMLElement;
      const emailInput = panel?.querySelector('input[type="email"]') as HTMLInputElement;
      const passwordInput = panel?.querySelector('input[type="password"]') as HTMLInputElement;
      await act(async () => {
        setInputValue(emailInput, "new@example.com");
        setInputValue(passwordInput, "newsecret");
      });
      await act(async () => {
        [...document.querySelectorAll("button")]
          .find((b) => b.textContent?.includes("Replace linked Immich account"))
          ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      for (let i = 0; i < 50; i += 1) {
        await act(async () => {
          await Promise.resolve();
        });
        if (vi.mocked(globalThis.fetch).mock.calls.some(([u]) => String(u).includes("/auth/immich/link"))) {
          break;
        }
      }

      expect(confirmMock).toHaveBeenCalled();
      expect(
        vi
          .mocked(globalThis.fetch)
          .mock.calls.some(([u, init]) => String(u).includes("/auth/immich/link") && init?.method === "POST")
      ).toBe(true);
      expect(
        vi
          .mocked(globalThis.fetch)
          .mock.calls.some(
            ([u, init]) => String(u).includes("/providers/immich/people/sync") && init?.method === "POST"
          )
      ).toBe(true);

      act(() => {
        root.unmount();
      });
      container.remove();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
