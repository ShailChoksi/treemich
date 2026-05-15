/**
 * @packageDocumentation
 * Unit tests for isCookieSecure() pure function and env.ts feature flag helpers.
 */

import { describe, expect, it } from "vitest";

describe("isCookieSecure", () => {
  it("defaults to true when NODE_ENV=production and cookieSecure is unset", async () => {
    const { isCookieSecure } = await import("./env.js");
    // Use "" (empty) to simulate "not set" — undefined would fall through to env singleton
    expect(isCookieSecure("", "production")).toBe(true);
  });

  it("defaults to false when NODE_ENV=test and cookieSecure is unset", async () => {
    const { isCookieSecure } = await import("./env.js");
    expect(isCookieSecure("", "test")).toBe(false);
  });

  it("defaults to false when NODE_ENV=development and cookieSecure is unset", async () => {
    const { isCookieSecure } = await import("./env.js");
    expect(isCookieSecure("", "development")).toBe(false);
  });

  it("returns true when TREEMICH_COOKIE_SECURE=true even in development", async () => {
    const { isCookieSecure } = await import("./env.js");
    expect(isCookieSecure("true", "development")).toBe(true);
  });

  it("returns true when TREEMICH_COOKIE_SECURE=1", async () => {
    const { isCookieSecure } = await import("./env.js");
    expect(isCookieSecure("1", "development")).toBe(true);
  });

  it("returns true when TREEMICH_COOKIE_SECURE=yes", async () => {
    const { isCookieSecure } = await import("./env.js");
    expect(isCookieSecure("yes", "development")).toBe(true);
  });

  it("returns true when TREEMICH_COOKIE_SECURE=on", async () => {
    const { isCookieSecure } = await import("./env.js");
    expect(isCookieSecure("on", "development")).toBe(true);
  });

  it("returns false when TREEMICH_COOKIE_SECURE=false in production", async () => {
    const { isCookieSecure } = await import("./env.js");
    expect(isCookieSecure("false", "production")).toBe(false);
  });

  it("returns false when TREEMICH_COOKIE_SECURE=0 in production", async () => {
    const { isCookieSecure } = await import("./env.js");
    expect(isCookieSecure("0", "production")).toBe(false);
  });

  it("returns false when TREEMICH_COOKIE_SECURE=no", async () => {
    const { isCookieSecure } = await import("./env.js");
    expect(isCookieSecure("no", "production")).toBe(false);
  });

  it("returns false when TREEMICH_COOKIE_SECURE=off", async () => {
    const { isCookieSecure } = await import("./env.js");
    expect(isCookieSecure("off", "production")).toBe(false);
  });
});
