import { describe, expect, it } from "vitest";
import {
  createMediaLinkBodySchema,
  createMediaObjectBodySchema,
  createRepositoryBodySchema,
  createSourceBodySchema,
  mergeSourcesBodySchema,
  sourceListQuerySchema
} from "../src/evidence.js";

describe("evidence Zod schemas", () => {
  it("createRepositoryBodySchema requires a non-empty name", () => {
    expect(() => createRepositoryBodySchema.parse({ name: "" })).toThrow();
    expect(
      createRepositoryBodySchema.parse({
        name: "County Courthouse",
        addressLine1: null,
        url: null,
        notes: null
      })
    ).toMatchObject({ name: "County Courthouse" });
  });

  it("createSourceBodySchema requires title", () => {
    expect(() => createSourceBodySchema.parse({ title: "", repositoryId: null })).toThrow();
    expect(
      createSourceBodySchema.parse({
        repositoryId: null,
        title: "1920 U.S. Census",
        author: null,
        publication: null,
        url: null,
        notes: null
      })
    ).toMatchObject({ title: "1920 U.S. Census" });
  });

  it("sourceListQuerySchema accepts optional q", () => {
    expect(sourceListQuerySchema.parse({})).toEqual({});
    expect(sourceListQuerySchema.parse({ q: "census" })).toEqual({ q: "census" });
  });

  it("createMediaObjectBodySchema requires storageUrl", () => {
    expect(() => createMediaObjectBodySchema.parse({ storageUrl: "" })).toThrow();
    expect(
      createMediaObjectBodySchema.parse({
        storageUrl: "https://cdn.example/file.pdf",
        mimeType: "application/pdf",
        checksum: null,
        immichAssetId: null,
        title: null
      })
    ).toMatchObject({ storageUrl: "https://cdn.example/file.pdf" });
  });

  it("mergeSourcesBodySchema requires two different source ids", () => {
    expect(
      mergeSourcesBodySchema.parse({
        fromSourceId: "a",
        intoSourceId: "b"
      })
    ).toEqual({ fromSourceId: "a", intoSourceId: "b" });

    const same = mergeSourcesBodySchema.safeParse({
      fromSourceId: "x",
      intoSourceId: "x"
    });
    expect(same.success).toBe(false);
    if (same.success) {
      return;
    }
    expect(same.error.issues.some((i) => i.path.includes("intoSourceId"))).toBe(true);
  });

  it("createMediaLinkBodySchema restricts targetType", () => {
    expect(() =>
      createMediaLinkBodySchema.parse({ targetType: "INVALID", targetId: "x", notes: null })
    ).toThrow();
    expect(
      createMediaLinkBodySchema.parse({
        targetType: "SOURCE",
        targetId: "src-1",
        notes: null
      })
    ).toEqual({ targetType: "SOURCE", targetId: "src-1", notes: null });
  });
});
