import { describe, expect, it } from "vitest";
import {
  createPersonNameBodySchema,
  formatPersonNameDisplay,
  patchPersonNameBodySchema,
  personNameTypeSchema
} from "../src/personNames.js";

describe("personNameTypeSchema", () => {
  it("accepts known name types", () => {
    expect(personNameTypeSchema.parse("MAIDEN")).toBe("MAIDEN");
    expect(() => personNameTypeSchema.parse("UNKNOWN")).toThrow();
  });
});

describe("createPersonNameBodySchema", () => {
  it("requires type and accepts optional string fields", () => {
    expect(
      createPersonNameBodySchema.parse({
        type: "BIRTH",
        givenName: "Ann",
        surname: "Smith",
        isPrimary: true
      })
    ).toMatchObject({ type: "BIRTH", givenName: "Ann", isPrimary: true });
  });

  it("rejects string fields over 500 characters", () => {
    const long = "x".repeat(501);
    expect(() =>
      createPersonNameBodySchema.parse({
        type: "OTHER",
        notes: long
      })
    ).toThrow();
  });
});

describe("patchPersonNameBodySchema", () => {
  it("allows partial updates", () => {
    expect(patchPersonNameBodySchema.parse({ surname: "Jones" })).toEqual({ surname: "Jones" });
  });
});

describe("formatPersonNameDisplay", () => {
  it("joins non-empty parts and collapses whitespace", () => {
    expect(
      formatPersonNameDisplay({
        prefix: "Dr.",
        givenName: "Jane",
        surname: "Doe",
        suffix: "Jr."
      })
    ).toBe("Dr. Jane Doe Jr.");
  });

  it("skips null and blank segments", () => {
    expect(
      formatPersonNameDisplay({
        prefix: "  ",
        givenName: "Single",
        surname: null,
        suffix: undefined
      })
    ).toBe("Single");
  });
});
