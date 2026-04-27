import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/env.js")>();
  return {
    ...actual,
    isGedcomImportEnabled: () => true,
    maxGedcomImportBytes: () => 3_000_000,
    maxGedcomImportLineLogEntries: () => 2000,
    maxGedcomMediaArchiveBytes: () => 100_000_000,
    maxGedcomImportLines: () => 250_000
  };
});

vi.mock("../auth/request.js", () => ({
  getRequiredAuth: () => ({ user: { id: "user-1" } })
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    gedcomImportJob: {
      create: vi.fn(),
      update: vi.fn()
    }
  }
}));

describe("import GEDCOM ANSEL route handling", () => {
  it("previews ANSEL-declared GEDCOM after parser transcoding", async () => {
    const { registerImportGedcomRoutes } = await import("./import-gedcom.js");
    const app = Fastify();
    (app as unknown as { services: unknown }).services = {};
    await app.register(registerImportGedcomRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/import/gedcom/preview",
      payload: {
        gedcomUtf8: "0 HEAD\n1 CHAR ANSEL\n0 @I1@ INDI\n1 NAME Jos\xC2e /Nu\xC4nez/\n0 TRLR\n"
      }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { indis: { displayName: string | null }[]; lineLog: { message: string }[] };
    expect(body.indis[0]?.displayName).toBe("José Nuñez");
    expect(body.lineLog.some((entry) => entry.message.includes("ANSEL"))).toBe(true);
    await app.close();
  });
});
