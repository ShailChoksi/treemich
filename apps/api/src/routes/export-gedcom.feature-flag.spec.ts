import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/env.js")>();
  return {
    ...actual,
    isGedcomExportEnabled: () => false
  };
});

describe("GEDCOM export when TREEMICH_GEDCOM_EXPORT_ENABLED is off", () => {
  it("does not register GET /export/gedcom", async () => {
    const { registerExportGedcomGetRoute } = await import("./export-gedcom.get.js");
    const app = Fastify();
    await app.register(registerExportGedcomGetRoute);
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/export/gedcom" });
    expect(res.statusCode).toBe(404);

    await app.close();
  });
});
