import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileResolver } from "../people/profileResolver.js";

const mocks = vi.hoisted(() => ({
  personNameFindFirst: vi.fn(),
  personNameUpdate: vi.fn(),
  personNameCreate: vi.fn(),
  personNameUpdateMany: vi.fn(),
  personNameFindMany: vi.fn(),
  personNameFindFirstOrThrow: vi.fn(),
  personNameDelete: vi.fn(),
  personNameCount: vi.fn(),
  personProfileUpdate: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    personName: {
      findFirst: mocks.personNameFindFirst,
      findMany: mocks.personNameFindMany,
      findFirstOrThrow: mocks.personNameFindFirstOrThrow,
      update: mocks.personNameUpdate,
      updateMany: mocks.personNameUpdateMany,
      create: mocks.personNameCreate,
      delete: mocks.personNameDelete,
      count: mocks.personNameCount
    },
    personProfile: {
      update: mocks.personProfileUpdate
    },
    $transaction: (ops: unknown) => {
      mocks.transaction(ops);
      if (typeof ops === "function") {
        return ops({
          personName: {
            findFirst: mocks.personNameFindFirst,
            update: mocks.personNameUpdate,
            updateMany: mocks.personNameUpdateMany,
            create: mocks.personNameCreate
          },
          personProfile: { update: mocks.personProfileUpdate }
        });
      }
      return Promise.all(ops as Promise<unknown>[]);
    }
  }
}));

import { PersonNameService } from "./service.js";

const resolver: ProfileResolver = {
  resolveProfile: vi.fn(async (_userId, personId) => personId)
};

describe("PersonNameService primary/profile sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the primary PersonName when profile given/surname change", async () => {
    mocks.personNameFindFirst.mockResolvedValue({
      id: "pn-1",
      personProfileId: "pp-1",
      userId: "user-1",
      type: "BIRTH",
      givenName: "Alice",
      surname: "Smith",
      isPrimary: true
    });
    mocks.personNameUpdate.mockResolvedValue({});

    const service = new PersonNameService(resolver);
    await service.syncPrimaryFromProfile("user-1", "pp-1", {
      givenName: "Alexandra",
      surname: "Smithson"
    });

    expect(mocks.personNameUpdate).toHaveBeenCalledWith({
      where: { id: "pn-1" },
      data: { givenName: "Alexandra", surname: "Smithson" }
    });
    expect(mocks.personNameCreate).not.toHaveBeenCalled();
  });

  it("creates a primary BIRTH PersonName when profile has names but no primary row", async () => {
    mocks.personNameFindFirst.mockResolvedValue(null);
    mocks.personNameCreate.mockResolvedValue({
      id: "pn-new",
      type: "BIRTH",
      givenName: "Pat",
      surname: "Lee",
      prefix: null,
      suffix: null,
      isPrimary: true,
      notes: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z")
    });

    const service = new PersonNameService(resolver);
    await service.syncPrimaryFromProfile("user-1", "pp-1", {
      givenName: "Pat",
      surname: "Lee"
    });

    expect(mocks.personNameCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        personProfileId: "pp-1",
        type: "BIRTH",
        givenName: "Pat",
        surname: "Lee",
        isPrimary: true
      })
    });
  });

  it("copies primary PersonName parts onto the profile when set as primary", async () => {
    mocks.personNameFindFirst.mockResolvedValue({
      id: "pn-aka",
      personProfileId: "pp-1",
      userId: "user-1",
      type: "AKA",
      givenName: "Ally",
      surname: "S",
      prefix: null,
      suffix: null,
      isPrimary: false,
      notes: null
    });
    mocks.personNameFindFirstOrThrow.mockResolvedValue({
      id: "pn-aka",
      type: "AKA",
      givenName: "Ally",
      surname: "S",
      prefix: null,
      suffix: null,
      isPrimary: true,
      notes: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z")
    });
    mocks.personProfileUpdate.mockResolvedValue({});

    const service = new PersonNameService(resolver);
    await service.setPrimary("user-1", "pp-1", "pn-aka");

    expect(mocks.personProfileUpdate).toHaveBeenCalledWith({
      where: { id: "pp-1" },
      data: { givenName: "Ally", surname: "S" }
    });
  });
});
