import { describe, expect, it, vi, beforeEach } from "vitest";
import { computeTreeValidationForUser, mergeTreeFindings } from "./treeValidationService.js";

const dbMocks = vi.hoisted(() => ({
  personProfileFindMany: vi.fn(),
  relationshipFindMany: vi.fn(),
  lifeEventFindMany: vi.fn()
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    personProfile: { findMany: dbMocks.personProfileFindMany },
    relationship: { findMany: dbMocks.relationshipFindMany },
    lifeEvent: { findMany: dbMocks.lifeEventFindMany }
  }
}));

describe("mergeTreeFindings", () => {
  it("flattens batches", () => {
    const a = [{ code: "a", severity: "error" as const, message: "m" }];
    const b = [{ code: "b", severity: "warning" as const, message: "n" }];
    expect(mergeTreeFindings(a, b)).toEqual([a[0], b[0]]);
  });
});

describe("computeTreeValidationForUser", () => {
  const listPersonLifeEvents = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.personProfileFindMany.mockResolvedValue([]);
    dbMocks.relationshipFindMany.mockResolvedValue([]);
    dbMocks.lifeEventFindMany.mockResolvedValue([]);
    listPersonLifeEvents.mockResolvedValue([]);
  });

  it("returns empty when there are no profiles or relationships", async () => {
    const out = await computeTreeValidationForUser("u1");
    expect(out).toEqual([]);
  });

  it("aggregates per-person life-event findings (e.g. birth after death)", async () => {
    dbMocks.personProfileFindMany.mockResolvedValue([{ id: "pp1", immichPersonId: "p1" }]);
    dbMocks.lifeEventFindMany
      .mockResolvedValueOnce([
        { personProfileId: "pp1", eventType: "BIRTH", year: 2010, month: null, day: null },
        { personProfileId: "pp1", eventType: "DEATH", year: 2000, month: null, day: null }
      ])
      .mockResolvedValueOnce([]);

    const out = await computeTreeValidationForUser("u1");
    expect(out.some((f) => f.code === "birth_after_death")).toBe(true);
    expect(listPersonLifeEvents).not.toHaveBeenCalled();
  });
});
