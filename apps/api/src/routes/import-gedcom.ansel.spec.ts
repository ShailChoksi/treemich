import Fastify from "fastify";
import multipart from "@fastify/multipart";
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

const gedcomImportPreviewSessionCreate = vi.fn(async ({ data }: { data: { id: string } }) => ({
  ...data,
  createdAt: new Date("2026-01-01T00:00:00.000Z")
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    gedcomImportPreviewSession: {
      create: gedcomImportPreviewSessionCreate,
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 })
    }
  }
}));

describe("import GEDCOM ANSEL route handling", () => {
  it("previews ANSEL-declared GEDCOM after parser transcoding", async () => {
    const { registerImportGedcomRoutes } = await import("./import-gedcom.js");
    const app = Fastify();
    (app as unknown as { services: unknown }).services = {};
    await app.register(multipart);
    await app.register(registerImportGedcomRoutes);
    await app.ready();

    const ged = "0 HEAD\n1 CHAR ANSEL\n0 @I1@ INDI\n1 NAME Jos\xC2e /Nu\xC4nez/\n0 TRLR\n";
    const boundary = "----treemich-ansel";
    const payload = Buffer.from(
      [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="tree.ged"',
        "Content-Type: text/plain",
        "",
        ged,
        `--${boundary}--`,
        ""
      ].join("\r\n")
    );

    const res = await app.inject({
      method: "POST",
      url: "/import/gedcom/previews",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      page: { rows: { displayName: string | null }[] };
      lineLog: { message: string }[];
    };
    expect(body.page.rows[0]?.displayName).toBe("José Nuñez");
    expect(body.lineLog.some((entry) => entry.message.includes("ANSEL"))).toBe(true);
    await app.close();
  });
});
