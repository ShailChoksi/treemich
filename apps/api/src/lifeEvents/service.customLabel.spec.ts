import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpValidationError } from "./errors.js";

const {
  relationshipFindFirstMock,
  prismaTransactionMock,
  prismaLifeEventFindFirstMock,
  txLifeEventCreateMock,
  txLifeEventUpdateMock,
  txLifeEventFindFirstOrThrowMock,
  txCitationDeleteManyMock
} = vi.hoisted(() => ({
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
    relationship: { findFirst: relationshipFindFirstMock },
    $transaction: prismaTransactionMock,
    lifeEvent: { findFirst: prismaLifeEventFindFirstMock },
    place: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() }
  }
}));

const mockProfileResolver = {
  resolveProfile: vi.fn().mockResolvedValue({ id: "pp-1" })
};

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
    mockProfileResolver.resolveProfile.mockResolvedValue({ id: "pp-1" });
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
      const service = new LifeEventService(mockProfileResolver);

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
      const service = new LifeEventService(mockProfileResolver);

      await expect(
        service.createPersonLifeEvent("u1", "p1", {
          eventType: "CUSTOM",
          customLabel: "   ",
          year: 1920
        })
      ).rejects.toBeInstanceOf(HttpValidationError);
    });

    it("stores customLabel for CUSTOM events", async () => {
      const { LifeEventService } = await import("./service.js");
      const service = new LifeEventService(mockProfileResolver);
      await service.createPersonLifeEvent("u1", "p1", {
        eventType: "CUSTOM",
        customLabel: "My Event",
        year: 1920,
        month: 1,
        day: 1
      });

      expect(txLifeEventCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ customLabel: "My Event", eventType: "CUSTOM" })
        })
      );
    });
  });

  describe("updatePersonLifeEvent", () => {
    it("preserves existing customLabel when updating non-label fields without providing label", async () => {
      const { LifeEventService } = await import("./service.js");
      const service = new LifeEventService(mockProfileResolver);
      prismaLifeEventFindFirstMock.mockResolvedValueOnce(
        fullEventRow({ id: "le-existing", eventType: "CUSTOM", customLabel: "Existing" })
      );

      await service.updatePersonLifeEvent("u1", "p1", "le-existing", {
        year: 2000
      });

      expect(txLifeEventUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ year: 2000 })
        })
      );
      expect(txLifeEventUpdateMock.mock.calls[0]?.[0]?.data?.customLabel).toBeUndefined();
    });

    it("rejects CUSTOM with whitespace-only customLabel during update", async () => {
      const { LifeEventService } = await import("./service.js");
      const service = new LifeEventService(mockProfileResolver);
      prismaLifeEventFindFirstMock.mockResolvedValueOnce(
        fullEventRow({ id: "le-existing", eventType: "CUSTOM", customLabel: "Original" })
      );

      await expect(
        service.updatePersonLifeEvent("u1", "p1", "le-existing", { customLabel: "   " })
      ).rejects.toBeInstanceOf(HttpValidationError);
    });

    it("clears customLabel when switching from CUSTOM to RESIDENCE", async () => {
      const { LifeEventService } = await import("./service.js");
      const service = new LifeEventService(mockProfileResolver);
      prismaLifeEventFindFirstMock.mockResolvedValueOnce(
        fullEventRow({ id: "le-existing", eventType: "CUSTOM", customLabel: "Old" })
      );

      await service.updatePersonLifeEvent("u1", "p1", "le-existing", {
        eventType: "RESIDENCE"
      });

      expect(txLifeEventUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: "RESIDENCE", customLabel: null })
        })
      );
    });

    it("keeps existing customLabel when updating year without changing type", async () => {
      const { LifeEventService } = await import("./service.js");
      const service = new LifeEventService(mockProfileResolver);
      prismaLifeEventFindFirstMock.mockResolvedValueOnce(
        fullEventRow({ id: "le-existing", eventType: "CUSTOM", customLabel: "Keep" })
      );

      await service.updatePersonLifeEvent("u1", "p1", "le-existing", { year: 2000 });

      expect(txLifeEventUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            year: 2000,
            month: 1,
            day: 1
          })
        })
      );
      expect(txLifeEventUpdateMock.mock.calls[0]?.[0]?.data?.customLabel).toBeUndefined();
    });
  });
});
