import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaTransactionMock,
  txLifeEventFindFirstMock,
  txLifeEventUpdateMock,
  txLifeEventCreateMock,
  txPlaceFindUniqueMock,
  txPlaceUpdateMock,
  txPlaceCreateMock,
  prismaLifeEventFindFirstMock,
  prismaPlaceFindFirstMock,
  prismaPlaceUpdateMock,
  isProfilePlaceGeocodingEnabledMock
} = vi.hoisted(() => ({
  prismaTransactionMock: vi.fn(),
  txLifeEventFindFirstMock: vi.fn(),
  txLifeEventUpdateMock: vi.fn(),
  txLifeEventCreateMock: vi.fn(),
  txPlaceFindUniqueMock: vi.fn(),
  txPlaceUpdateMock: vi.fn(),
  txPlaceCreateMock: vi.fn(),
  prismaLifeEventFindFirstMock: vi.fn(),
  prismaPlaceFindFirstMock: vi.fn(),
  prismaPlaceUpdateMock: vi.fn(),
  isProfilePlaceGeocodingEnabledMock: vi.fn()
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    $transaction: prismaTransactionMock,
    lifeEvent: { findFirst: prismaLifeEventFindFirstMock },
    place: { findFirst: prismaPlaceFindFirstMock, update: prismaPlaceUpdateMock }
  }
}));

vi.mock("../config/env.js", () => ({
  isProfilePlaceGeocodingEnabled: isProfilePlaceGeocodingEnabledMock
}));

const mockResolver = { resolveProfile: vi.fn().mockResolvedValue({ id: "pp-1" }) };

describe("LifeEventService.syncPersonProfileFieldsToLifeEvents geocoding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isProfilePlaceGeocodingEnabledMock.mockReturnValue(true);
    prismaTransactionMock.mockImplementation(async (callback) =>
      callback({
        lifeEvent: {
          findFirst: txLifeEventFindFirstMock,
          update: txLifeEventUpdateMock,
          create: txLifeEventCreateMock
        },
        place: {
          findUnique: txPlaceFindUniqueMock,
          update: txPlaceUpdateMock,
          create: txPlaceCreateMock
        }
      })
    );
    txLifeEventFindFirstMock.mockResolvedValue({
      id: "birth-1",
      placeId: "place-1"
    });
    txLifeEventUpdateMock.mockResolvedValue({});
    txLifeEventCreateMock.mockResolvedValue({});
    txPlaceFindUniqueMock.mockResolvedValue({
      id: "place-1",
      locality: "Boston",
      countryCode: null,
      adminArea: null,
      name: "Boston, USA"
    });
    txPlaceUpdateMock.mockResolvedValue({});
    txPlaceCreateMock.mockResolvedValue({ id: "place-1" });
    prismaLifeEventFindFirstMock.mockResolvedValue({
      id: "birth-1",
      place: {
        id: "place-1",
        name: "Boston, USA",
        locality: "Boston",
        countryCode: null,
        latitude: null,
        longitude: null
      }
    });
    prismaPlaceFindFirstMock.mockResolvedValue(null);
    prismaPlaceUpdateMock.mockResolvedValue({});
  });

  it("geocodes birth city/country and writes coordinates onto BIRTH place", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "42.3601", lon: "-71.0589" }]
    });
    vi.stubGlobal("fetch", fetchMock);

    const { LifeEventService } = await import("./service.js");
    const service = new LifeEventService(mockResolver);
    await service.syncPersonProfileFieldsToLifeEvents("user-1", "pp-1", {
      birthCity: "Boston",
      birthCountry: "USA"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(prismaPlaceUpdateMock).toHaveBeenCalledWith({
      where: { id: "place-1" },
      data: { latitude: 42.3601, longitude: -71.0589 }
    });
    vi.unstubAllGlobals();
  });

  it("reuses coordinates from an existing matching place without external geocoding", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    prismaPlaceFindFirstMock.mockResolvedValueOnce({
      id: "place-known",
      latitude: 48.8566,
      longitude: 2.3522
    });

    const { LifeEventService } = await import("./service.js");
    const service = new LifeEventService(mockResolver);
    await service.syncPersonProfileFieldsToLifeEvents("user-1", "pp-1", {
      birthCity: "Paris",
      birthCountry: "FR"
    });

    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(prismaPlaceUpdateMock).toHaveBeenCalledWith({
      where: { id: "place-1" },
      data: { latitude: 48.8566, longitude: 2.3522 }
    });
    vi.unstubAllGlobals();
  });

  it("skips external geocoding when profile-place geocoding flag is disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    isProfilePlaceGeocodingEnabledMock.mockReturnValue(false);

    const { LifeEventService } = await import("./service.js");
    const service = new LifeEventService(mockResolver);
    await service.syncPersonProfileFieldsToLifeEvents("user-1", "pp-1", {
      birthCity: "Boston",
      birthCountry: "USA"
    });

    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(prismaPlaceUpdateMock.mock.calls.length).toBe(0);
    vi.unstubAllGlobals();
  });

  it("does not overwrite existing coordinates on the birth place", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    prismaLifeEventFindFirstMock.mockResolvedValueOnce({
      id: "birth-1",
      place: {
        id: "place-1",
        name: "Boston, USA",
        locality: "Boston",
        countryCode: null,
        latitude: 42.3601,
        longitude: -71.0589
      }
    });

    const { LifeEventService } = await import("./service.js");
    const service = new LifeEventService(mockResolver);
    await service.syncPersonProfileFieldsToLifeEvents("user-1", "pp-1", {
      birthCity: "Boston",
      birthCountry: "USA"
    });

    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(prismaPlaceUpdateMock.mock.calls.length).toBe(0);
    vi.unstubAllGlobals();
  });

  it("fails open when external geocoding returns no results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => []
    });
    vi.stubGlobal("fetch", fetchMock);

    const { LifeEventService } = await import("./service.js");
    const service = new LifeEventService(mockResolver);
    await expect(
      service.syncPersonProfileFieldsToLifeEvents("user-1", "pp-1", {
        birthCity: "Unknownville",
        birthCountry: "ZZ"
      })
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(prismaPlaceUpdateMock.mock.calls.length).toBe(0);
    vi.unstubAllGlobals();
  });
});
