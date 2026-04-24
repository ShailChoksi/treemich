import { describe, expect, it } from "vitest";
import { createFamilyLifeEventBodySchema } from "@treemich/shared";

describe("createFamilyLifeEventBodySchema", () => {
  it("accepts RESIDENCE with a year", () => {
    const parsed = createFamilyLifeEventBodySchema.safeParse({
      eventType: "RESIDENCE",
      year: 1920
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects MARRIAGE (relationship-only type)", () => {
    const parsed = createFamilyLifeEventBodySchema.safeParse({
      eventType: "MARRIAGE",
      year: 1910
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects BIRTH (person-only type)", () => {
    const parsed = createFamilyLifeEventBodySchema.safeParse({
      eventType: "BIRTH",
      year: 1900
    });
    expect(parsed.success).toBe(false);
  });
});
