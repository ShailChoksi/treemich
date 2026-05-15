/**
 * @file Integration tests for the App login flow — auth screen, errors, passwordChangeRequired redirect.
 */

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const setInputValue = (element: HTMLInputElement, value: string) => {
  const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
  proto?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
};

const flushEffects = async () => {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await new Promise<void>((r) => window.setTimeout(r, 0));
    });
  }
};

const setupFetch = (handlers: Record<string, (method: string) => ReturnType<typeof jsonResponse>>) => {
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
    const method = init?.method ?? "GET";
    const handler = Object.entries(handlers).find(([pattern]) => url.includes(pattern));
    if (handler) {
      return handler[1](method);
    }
    return jsonResponse({ error: `unmocked ${method} ${url}` }, 404);
  }) as unknown as typeof globalThis.fetch;
};

describe("App login flow (integration)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // /auth/me returns unauthenticated on first call (boot)
  });

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
      dismissedVersion: 99_999,
      dismissedAt: "2026-05-01T12:00:00.000Z"
    }
  };

  it("shows the auth screen when unauthenticated", async () => {
    setupFetch({
      "/auth/me": () => jsonResponse({ authenticated: false, linkStatus: { linked: false } })
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });
    await flushEffects();

    expect(document.body.textContent).toContain("Sign in to Treemich");
    expect(document.querySelector('input[type="email"]')).toBeTruthy();
    expect(document.querySelector('input[type="password"]')).toBeTruthy();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("displays an error message when login returns an error", async () => {
    setupFetch({
      "/auth/me": () => jsonResponse({ authenticated: false, linkStatus: { linked: false } }),
      "/auth/login": () => jsonResponse({ statusCode: 401, error: "Invalid email or password" }, 401)
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });
    await flushEffects();

    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;

    await act(async () => {
      setInputValue(emailInput, "admin@treemich.local");
      setInputValue(passwordInput, "wrongpass");
    });

    await act(async () => {
      document.querySelector("form")?.requestSubmit();
    });
    await flushEffects();

    expect(document.body.textContent).toContain("Invalid email or password");
    // Should still show the auth screen (not navigate away)
    expect(document.body.textContent).toContain("Sign in");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("navigates to the set-password screen when passwordChangeRequired is true", async () => {
    setupFetch({
      "/auth/me": () => jsonResponse({ authenticated: false, linkStatus: { linked: false } }),
      "/auth/login": () =>
        jsonResponse({
          authenticated: true,
          user: {
            id: "user-1",
            email: "admin@treemich.local",
            name: "Admin",
            isAdmin: true,
            passwordChangeRequired: true
          },
          linkStatus: { linked: false }
        }),
      "/auth/link-status": () => jsonResponse({ linked: false }),
      "/user/preferences": () => jsonResponse(prefsDismissedTutorial)
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });
    await flushEffects();

    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;

    await act(async () => {
      setInputValue(emailInput, "admin@treemich.local");
      setInputValue(passwordInput, "treemich-pass!");
    });

    await act(async () => {
      document.querySelector("form")?.requestSubmit();
    });
    await flushEffects();

    // Should now show the set-password screen instead of the main app
    expect(document.body.textContent).toContain("Set a new password");
    expect(document.body.textContent).toContain("Current password");
    expect(document.body.textContent).toContain("New password");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("successfully logs in and shows the people page when credentials are correct", async () => {
    setupFetch({
      "/auth/me": () => jsonResponse({ authenticated: false, linkStatus: { linked: false } }),
      "/auth/login": () =>
        jsonResponse({
          authenticated: true,
          user: {
            id: "user-1",
            email: "alice@example.com",
            name: "Alice",
            isAdmin: false,
            passwordChangeRequired: false
          },
          linkStatus: { linked: false }
        }),
      "/auth/link-status": () => jsonResponse({ linked: false }),
      "/user/preferences": () => jsonResponse(prefsDismissedTutorial)
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });
    await flushEffects();

    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;

    await act(async () => {
      setInputValue(emailInput, "alice@example.com");
      setInputValue(passwordInput, "correctpass");
    });

    await act(async () => {
      document.querySelector("form")?.requestSubmit();
    });
    await flushEffects();

    // Should now show the people page
    expect(document.body.textContent).toContain("People stub");
    expect(document.body.textContent).toContain("Alice");
    expect(document.body.textContent).toContain("Sign out");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("logs out when the sign out button is clicked", async () => {
    let authState: "unauthenticated" | "authenticated" = "unauthenticated";
    setupFetch({
      "/auth/me": () => {
        if (authState === "authenticated") {
          return jsonResponse({
            authenticated: true,
            user: {
              id: "user-1",
              email: "alice@example.com",
              name: "Alice",
              isAdmin: false,
              passwordChangeRequired: false
            },
            linkStatus: { linked: false }
          });
        }
        return jsonResponse({ authenticated: false, linkStatus: { linked: false } });
      },
      "/auth/login": () => {
        authState = "authenticated";
        return jsonResponse({
          authenticated: true,
          user: {
            id: "user-1",
            email: "alice@example.com",
            name: "Alice",
            isAdmin: false,
            passwordChangeRequired: false
          },
          linkStatus: { linked: false }
        });
      },
      "/auth/link-status": () => jsonResponse({ linked: false }),
      "/user/preferences": () => jsonResponse(prefsDismissedTutorial),
      "/auth/logout": () => {
        authState = "unauthenticated";
        return jsonResponse({ success: true });
      }
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });
    await flushEffects();

    // Login
    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(emailInput, "alice@example.com");
      setInputValue(passwordInput, "correctpass");
    });
    await act(async () => {
      document.querySelector("form")?.requestSubmit();
    });
    await flushEffects();

    expect(document.body.textContent).toContain("People stub");

    // Sign out
    const signOutButton = [...document.querySelectorAll("button")].find((b) => b.textContent === "Sign out");
    await act(async () => {
      signOutButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushEffects();

    expect(document.body.textContent).toContain("Sign in to Treemich");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows an error when login network fails", async () => {
    setupFetch({
      "/auth/me": () => jsonResponse({ authenticated: false, linkStatus: { linked: false } }),
      // Return status 500 to simulate an API failure
      "/auth/login": () => jsonResponse({ statusCode: 500, error: "Login failed" }, 500)
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });
    await flushEffects();

    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(emailInput, "alice@example.com");
      setInputValue(passwordInput, "somepass");
    });
    await act(async () => {
      document.querySelector("form")?.requestSubmit();
    });
    await flushEffects();

    expect(document.body.textContent).toContain("Login failed");
    expect(document.body.textContent).toContain("Sign in");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
