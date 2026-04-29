import { describe, expect, it } from "vitest";
import {
  descendantReportRequestSchema,
  familyGroupSheetResponseSchema,
  pedigreeReportRequestSchema,
  reportPersonSummarySchema
} from "../src/reports.js";

describe("report contracts", () => {
  it("parses depth requests and defaults redactLiving off", () => {
    expect(pedigreeReportRequestSchema.parse({ rootPersonId: "p1", depth: 4 })).toEqual({
      rootPersonId: "p1",
      depth: 4,
      redactLiving: false
    });
    expect(() => descendantReportRequestSchema.parse({ rootPersonId: "p1", depth: 0 })).toThrow();
  });

  it("requires explicit redaction state on person summaries", () => {
    const person = reportPersonSummarySchema.parse({
      id: "p1",
      displayName: "Living person",
      gender: "UNKNOWN",
      primaryName: null,
      alternateNames: [],
      isLiving: true,
      isRedacted: true,
      events: []
    });
    expect(person.isRedacted).toBe(true);
  });

  it("parses family group sheet report metadata", () => {
    const parsed = familyGroupSheetResponseSchema.parse({
      type: "family-group",
      generatedAt: "2026-04-29T00:00:00.000Z",
      parameters: { familyId: "fam1", redactLiving: false },
      warnings: [],
      family: {
        id: "fam1",
        notes: null,
        parents: [],
        children: [],
        events: [],
        citations: []
      }
    });
    expect(parsed.family.id).toBe("fam1");
  });
});
