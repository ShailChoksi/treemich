/**
 * Default `fetch` for Vitest: avoid real TCP when components call relative `/api/*` URLs.
 *
 * Happy DOM's default document URL is `http://localhost:3000/`. With
 * `import.meta.env.VITE_TREEMICH_API_URL ?? "/api"`, requests become
 * `http://localhost:3000/api/...`. Tests that render panels but do not assign
 * `globalThis.fetch` (e.g. PersonDetailPanel) would otherwise hit Node's native
 * `fetch`, attempt `::1:3000` and `127.0.0.1:3000`, and print `AggregateError: ECONNREFUSED`
 * noise without failing assertions.
 */
import { vi } from "vitest";

const unmockedResponse = (url: string) =>
  new Response(JSON.stringify({ error: `unmocked fetch in test: ${url}` }), {
    status: 404,
    headers: { "content-type": "application/json" }
  });

globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return unmockedResponse(url);
}) as typeof fetch;
