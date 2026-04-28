import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpValidationError } from "./errors.js";

const {
  personProfileFindFirstMock,
  personProfileFindUniqueMock,
  personExternalIdentityFindFirstMock,
  relationshipFindFirstMock,
  prismaTransactionMock,
  prismaLifeEventFindFirstMock,
  txLifeEventCreateMock,
  txLifeEventUpdateMock,
  txLifeEventFindFirstOrThrowMock,
  txCitationDeleteManyMock
} = vi.hoisted(() => ({
  personProfileFindFirstMock: vi.fn(),
  personProfileFindUniqueMock: vi.fn(),
  personExternalIdentityFindFirstMock: vi.fn().mockResolvedValue(null),
  relationshipFindFirstMock: vi.fn(),
  prismaTransactionMock: vi.fn(),
  prismaLifeEventFindFirstMock: vi.fn(),
  txLifeEventCreateMock: vi.fn(),
  txLifeEventUpdateMock: vi.fn(),
  txLifeEventFindFirstOrThrowMock: vi.fn(),
  txCitationDeleteManyMock: vi.fn()
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    personProfile: { findFirst: personProfileFindFirstMock, findUnique: personProfileFindUniqueMock },
    personExternalIdentity: { findFirst: personExternalIdentityFindFirstMock },
    relationship: { findFirst: relationshipFindFirstMock },
    $transaction: prismaTransactionMock,
    lifeEvent: { findFirst: prismaLifeEventFindFirstMock },
    place: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() }
  }
}));

const fullEventRow = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "le-1",
    userId: "u1",
    eventType: "CUSTOM",
    customLabel: "Original",
    dateQualifier: "EXACT",
    year: 1900,
    month: 1,
    day: 1,
    endYear: null,
    endMonth: null,
    endDay: null,
    personProfileId: "pp-1",
    relationshipId: null,
    placeId: null,
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    place: null,
    citations: [],
    ...overrides
  }) as Record<string, unknown>;

describe("LifeEventService CUSTOM customLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    personProfileFindFirstMock.mockResolvedValue({ id: "pp-1" });
    personProfileFindUniqueMock.mockResolvedValue({ id: "pp-1" });
    personExternalIdentityFindFirstMock.mockResolvedValue(null);
    relationshipFindFirstMock.mockResolvedValue({ id: "rel-1", userId: "u1" });
    prismaLifeEventFindFirstMock.mockReset();
    prismaLifeEventFindFirstMock.mockResolvedValue(null);
    txLifeEventCreateMock.mockResolvedValue({ id: "le-new" });
    txLifeEventFindFirstOrThrowMock.mockImplementation(() =>
      Promise.resolve(fullEventRow({ id: "le-new" }) as never)
    );
    txLifeEventUpdateMock.mockResolvedValue({});
    txCitationDeleteManyMock.mockResolvedValue({ count: 0 });

    prismaTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        lifeEvent: {
          create: txLifeEventCreateMock,
          update: txLifeEventUpdateMock,
          findFirstOrThrow: txLifeEventFindFirstOrThrowMock
        },
        citation: {
          deleteMany: txCitationDeleteManyMock,
          create: vi.fn().mockResolvedValue({})
        },
        source: { findFirst: vi.fn(), create: vi.fn() },
        repository: { findFirst: vi.fn(), create: vi.fn() }
      };
      return fn(tx);
    });
  });

  describe("createPersonLifeEvent", () => {
    it("throws HttpValidationError when CUSTOM has no customLabel", async () => {
      const { LifeEventService } = await import("./service.js");
      const service = new LifeEventService();

      await expect(
        service.createPersonLifeEvent("u1", "p1", {
          eventType: "CUSTOM",
          year: 1920,
          month: 1,
          day: 1
        })
      ).rejects.toBeInstanceOf(HttpValidationError);

      expect(prismaTransactionMock).not.toHaveBeenCalled();
    });

    it("throws HttpValidationError when CUSTOM has whitespace-only customLabel", async () => {
      const { LifeEventService } = await import("./service.js");
      const service = new LifeEventService();

      await expect(
        service.createPersonLifeEvent("u1", "p1", {
          eventType: "CUSTOM",
          customLabel: "   ",
          year: 1920,
          month: 1,
          day: 1
        })
      ).rejects.toBeInstanceOf(HttpValidationError);
    });

    it("persists trimmed customLabel for CUSTOM", async () => {
      const { LifeEventService } = await import("./service.js");
      const service = new LifeEventService();

      await service.createPersonLifeEvent("u1", "p1", {
        eventType: "CUSTOM",
        customLabel: "  Discharge  ",
        year: 1920,
        month: 1,
        day: 1
      });

      expect(txLifeEventCreateMock).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: "CUSTOM",
          customLabel: "Discharge",
          personProfileId: "pp-1"
        })
      });
    });
  });

  describe("updatePersonLifeEvent", () => {
    beforeEach(() => {
      prismaLifeEventFindFirstMock.mockReset();
    });

    it("throws when patching CUSTOM to clear an existing label with empty string", async () => {
      prismaLifeEventFindFirstMock.mockResolvedValueOnce(fullEventRow() as never);

      const { LifeEventService } = await import("./service.js");
      const service = new LifeEventService();

      await expect(
        service.updatePersonLifeEvent("u1", "p1", "le-1", {
          customLabel: ""
        })
      ).rejects.toBeInstanceOf(HttpValidationError);
    });

    it("clears customLabel when changing CUSTOM to RESIDENCE", async () => {
      prismaLifeEventFindFirstMock.mockResolvedValueOnce(fullEventRow() as never).mockResolvedValueOnce(null);

      const { LifeEventService } = await import("./service.js");
      const service = new LifeEventService();

      await service.updatePersonLifeEvent("u1", "p1", "le-1", {
        eventType: "RESIDENCE"
      });

      expect(txLifeEventUpdateMock).toHaveBeenCalledWith({
        where: { id: "le-1" },
        data: expect.objectContaining({
          eventType: "RESIDENCE",
          customLabel: null
        })
      });
    });

    it("throws when changing RESIDENCE to CUSTOM without a label", async () => {
      prismaLifeEventFindFirstMock.mockResolvedValueOnce(
        fullEventRow({
          eventType: "RESIDENCE",
          customLabel: null
        }) as never
      );

      const { LifeEventService } = await import("./service.js");
      const service = new LifeEventService();

      await expect(
        service.updatePersonLifeEvent("u1", "p1", "le-1", {
          eventType: "CUSTOM"
        })
      ).rejects.toBeInstanceOf(HttpValidationError);
    });
  });

  describe("createRelationshipLifeEvent", () => {
    it("throws HttpValidationError when CUSTOM has no customLabel", async () => {
      const { LifeEventService } = await import("./service.js");
      const service = new LifeEventService();

      await expect(
        service.createRelationshipLifeEvent("u1", "rel-1", {
          eventType: "CUSTOM",
          year: 1920,
          month: 1,
          day: 1
        })
      ).rejects.toBeInstanceOf(HttpValidationError);

      expect(prismaTransactionMock).not.toHaveBeenCalled();
    });
  });
});
