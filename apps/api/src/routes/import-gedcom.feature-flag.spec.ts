import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/env.js")>();
  return {
    ...actual,
    isGedcomImportEnabled: () => false
  };
});

describe("GEDCOM import when TREEMICH_GEDCOM_IMPORT_ENABLED is off", () => {
  it("does not register import routes", async () => {
    const { registerImportGedcomRoutes } = await import("./import-gedcom.js");
    const app = Fastify();
    await app.register(registerImportGedcomRoutes);
    await app.ready();

    const preview = await app.inject({
      method: "POST",
      url: "/import/gedcom/preview",
      payload: { gedcomUtf8: "0 HEAD\n0 TRLR\n" }
    });
    expect(preview.statusCode).toBe(404);

    await app.close();
  });
});
