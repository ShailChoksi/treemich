import { describe, expect, it } from "vitest";
import {
  patchMediaObjectBodySchema,
  patchRepositoryBodySchema,
  patchSourceBodySchema
} from "../src/evidence.js";

describe("patchRepositoryBodySchema", () => {
  it("allows empty patch", () => {
    expect(patchRepositoryBodySchema.parse({})).toEqual({});
  });

  it("rejects empty name when provided", () => {
    expect(() => patchRepositoryBodySchema.parse({ name: "" })).toThrow();
    expect(patchRepositoryBodySchema.parse({ name: "New name" })).toEqual({ name: "New name" });
  });
});

describe("patchSourceBodySchema", () => {
  it("allows clearing repository with null", () => {
    expect(patchSourceBodySchema.parse({ repositoryId: null, title: "Only title" })).toEqual({
      repositoryId: null,
      title: "Only title"
    });
  });
});

describe("patchMediaObjectBodySchema", () => {
  it("allows partial media updates", () => {
    expect(patchMediaObjectBodySchema.parse({ title: null })).toEqual({ title: null });
  });
});
