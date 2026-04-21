import { describe, expect, it } from "vitest";
import { createLifeEventBodySchema } from "@treemich/shared";

/**
 * Shared-schema rules that drive LifeEventRichForm validation UX (place xor, BETWEEN end date).
 */
describe("createLifeEventBodySchema UX-related rules", () => {
  it("rejects both placeId and inline place", () => {
    const result = createLifeEventBodySchema.safeParse({
      eventType: "CUSTOM",
      placeId: "pl-1",
      place: { name: "Somewhere" }
    });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(
      result.error.issues.some((i) => i.message.includes("placeId") && i.message.includes("place"))
    ).toBe(true);
  });

  it("rejects BETWEEN without any end date component", () => {
    const result = createLifeEventBodySchema.safeParse({
      eventType: "CUSTOM",
      dateQualifier: "BETWEEN",
      year: 1900,
      month: 1,
      day: 1
    });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.error.issues.some((i) => i.message.includes("BETWEEN qualifier"))).toBe(true);
  });

  it("accepts BETWEEN when an end year is provided", () => {
    const result = createLifeEventBodySchema.safeParse({
      eventType: "CUSTOM",
      dateQualifier: "BETWEEN",
      year: 1900,
      month: 1,
      day: 1,
      endYear: 1910,
      endMonth: null,
      endDay: null
    });
    expect(result.success).toBe(true);
  });
});
