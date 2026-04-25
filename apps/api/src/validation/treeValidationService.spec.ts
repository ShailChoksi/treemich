import { describe, expect, it, vi, beforeEach } from "vitest";
import { computeTreeValidationForUser, mergeTreeFindings } from "./treeValidationService.js";
import { env } from "../config/env.js";

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
  const originalTreeValidationMaxRows = env.TREEMICH_TREE_VALIDATION_MAX_ROWS;
  beforeEach(() => {
    vi.clearAllMocks();
    env.TREEMICH_TREE_VALIDATION_MAX_ROWS = originalTreeValidationMaxRows;
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

  it("rejects validation when row scan exceeds configured cap", async () => {
    env.TREEMICH_TREE_VALIDATION_MAX_ROWS = 1;
    dbMocks.personProfileFindMany.mockResolvedValue([{ id: "pp1", immichPersonId: "p1" }]);
    dbMocks.relationshipFindMany.mockResolvedValue([{ id: "r1", type: "SPOUSE_OF" }]);

    await expect(computeTreeValidationForUser("u1")).rejects.toMatchObject({
      statusCode: 413
    });
  });
});
