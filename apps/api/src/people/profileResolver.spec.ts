import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  personProfileFindFirst: vi.fn(),
  personExternalIdentityFindFirst: vi.fn()
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    personProfile: { findFirst: mocks.personProfileFindFirst },
    personExternalIdentity: { findFirst: mocks.personExternalIdentityFindFirst }
  }
}));

describe("CanonicalProfileResolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves when person exists by canonical id", async () => {
    mocks.personProfileFindFirst.mockResolvedValue({ id: "pp-1" });

    const { CanonicalProfileResolver } = await import("./profileResolver.js");
    const resolver = new CanonicalProfileResolver((await import("../db/client.js")).prisma as never);
    const result = await resolver.resolveProfile("user-1", "pp-1");

    expect(result.id).toBe("pp-1");
    expect(mocks.personProfileFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pp-1", userId: "user-1" } })
    );
    expect(mocks.personExternalIdentityFindFirst).not.toHaveBeenCalled();
  });

  it("throws HttpNotFoundError when person does not exist", async () => {
    mocks.personProfileFindFirst.mockResolvedValue(null);

    const { CanonicalProfileResolver } = await import("./profileResolver.js");
    const resolver = new CanonicalProfileResolver((await import("../db/client.js")).prisma as never);

    await expect(resolver.resolveProfile("user-1", "missing-id")).rejects.toThrow("Person not found");
  });

  it("does not fall back to external identity when provider id is passed", async () => {
    mocks.personProfileFindFirst.mockResolvedValue(null);

    const { CanonicalProfileResolver } = await import("./profileResolver.js");
    const resolver = new CanonicalProfileResolver((await import("../db/client.js")).prisma as never);

    await expect(resolver.resolveProfile("user-1", "immich-abc")).rejects.toThrow("Person not found");
    expect(mocks.personExternalIdentityFindFirst).not.toHaveBeenCalled();
  });
});
