import { describe, expect, it } from "vitest";
import {
  createLifeEventBodySchema,
  lifeEventTypeLabels,
  lifeEventTypePickerGroups,
  lifeEventTypeValues,
  personAttachableLifeEventTypeValues
} from "@treemich/shared";

/**
 * Shared-schema rules that drive LifeEventRichForm validation UX (place xor, BETWEEN end date).
 */
describe("createLifeEventBodySchema UX-related rules", () => {
  it("rejects both placeId and inline place", () => {
    const result = createLifeEventBodySchema.safeParse({
      eventType: "BIRTH",
      year: 1900,
      month: 1,
      day: 1,
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
      customLabel: "Military service",
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
      customLabel: "Military service",
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

  it("rejects CUSTOM create without customLabel", () => {
    const result = createLifeEventBodySchema.safeParse({
      eventType: "CUSTOM",
      year: 1900,
      month: 1,
      day: 1
    });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.error.issues.some((i) => i.path.includes("customLabel"))).toBe(true);
  });

  it("rejects CUSTOM create with blank or whitespace-only customLabel", () => {
    for (const customLabel of ["", "   ", null] as const) {
      const result = createLifeEventBodySchema.safeParse({
        eventType: "CUSTOM",
        customLabel,
        year: 1900,
        month: 1,
        day: 1
      });
      expect(result.success).toBe(false);
    }
  });

  it("accepts new Phase 1 person event types in the shared schema", () => {
    for (const eventType of ["BAPTISM", "CENSUS", "MILITARY"] as const) {
      const result = createLifeEventBodySchema.safeParse({
        eventType,
        year: 1920,
        month: 1,
        day: 1
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("life event type constants (Phase 1)", () => {
  it("excludes relationship-only types from person-attachable list", () => {
    expect(personAttachableLifeEventTypeValues.includes("MARRIAGE")).toBe(false);
    expect(personAttachableLifeEventTypeValues.includes("DIVORCE")).toBe(false);
  });

  it("includes new enum values in attachable and full lists", () => {
    for (const t of ["BAPTISM", "CENSUS", "MILITARY"] as const) {
      expect(lifeEventTypeValues).toContain(t);
      expect(personAttachableLifeEventTypeValues).toContain(t);
    }
  });

  it("defines a human label for every lifeEventTypeValues entry", () => {
    for (const t of lifeEventTypeValues) {
      expect(lifeEventTypeLabels[t]?.length).toBeGreaterThan(0);
    }
  });

  it("places every type in exactly one picker group (union matches full enum)", () => {
    const fromGroups = new Set<(typeof lifeEventTypeValues)[number]>();
    for (const g of lifeEventTypePickerGroups) {
      for (const t of g.types) {
        expect(fromGroups.has(t)).toBe(false);
        fromGroups.add(t);
      }
    }
    expect([...fromGroups].sort()).toEqual([...lifeEventTypeValues].sort());
  });
});
