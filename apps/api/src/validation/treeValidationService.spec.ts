import { describe, expect, it, vi, beforeEach } from "vitest";
import { computeTreeValidationForUser, mergeTreeFindings } from "./treeValidationService.js";
import type { LifeEventService } from "../lifeEvents/service.js";

const dbMocks = vi.hoisted(() => ({
  personProfileFindMany: vi.fn(),
  relationshipFindMany: vi.fn()
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    personProfile: { findMany: dbMocks.personProfileFindMany },
    relationship: { findMany: dbMocks.relationshipFindMany }
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
  const listRelationshipLifeEvents = vi.fn();
  const lifeEventService = {
    listPersonLifeEvents,
    listRelationshipLifeEvents
  } as unknown as LifeEventService;

  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.personProfileFindMany.mockResolvedValue([]);
    dbMocks.relationshipFindMany.mockResolvedValue([]);
    listPersonLifeEvents.mockResolvedValue([]);
    listRelationshipLifeEvents.mockResolvedValue([]);
  });

  it("returns empty when there are no profiles or relationships", async () => {
    const out = await computeTreeValidationForUser("u1", lifeEventService);
    expect(out).toEqual([]);
  });

  it("aggregates per-person life-event findings (e.g. birth after death)", async () => {
    dbMocks.personProfileFindMany.mockResolvedValue([{ id: "pp1", immichPersonId: "p1" }]);
    listPersonLifeEvents.mockImplementation((_uid: string, personId: string) => {
      if (personId === "p1") {
        return Promise.resolve([
          { eventType: "BIRTH", year: 2010, month: null, day: null },
          { eventType: "DEATH", year: 2000, month: null, day: null }
        ]);
      }
      return Promise.resolve([]);
    });

    const out = await computeTreeValidationForUser("u1", lifeEventService);
    expect(out.some((f) => f.code === "birth_after_death")).toBe(true);
  });
});
