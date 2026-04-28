import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  treemichUserFindFirst: vi.fn(),
  treemichUserCount: vi.fn(),
  treemichUserCreate: vi.fn(),
  treemichUserUpdate: vi.fn(),
  treemichUserUpsert: vi.fn(),
  treemichSessionCreate: vi.fn(),
  treemichSessionFindFirst: vi.fn(),
  treemichSessionDelete: vi.fn(),
  linkedImmichAccountUpsert: vi.fn(),
  personProfileCount: vi.fn(),
  relationshipCount: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    treemichUser: {
      findFirst: mocks.treemichUserFindFirst,
      count: mocks.treemichUserCount,
      create: mocks.treemichUserCreate,
      update: mocks.treemichUserUpdate,
      upsert: mocks.treemichUserUpsert
    },
    treemichSession: {
      create: mocks.treemichSessionCreate,
      findFirst: mocks.treemichSessionFindFirst,
      delete: mocks.treemichSessionDelete
    },
    linkedImmichAccount: {
      upsert: mocks.linkedImmichAccountUpsert
    },
    personProfile: {
      count: mocks.personProfileCount
    },
    relationship: {
      count: mocks.relationshipCount
    },
    $transaction: mocks.transaction
  }
}));

vi.mock("../config/env.js", () => ({
  env: {
    TREEMICH_SESSION_TTL_MS: 2_592_000_000,
    TREEMICH_ENCRYPTION_KEY: "a".repeat(64),
    IMMICH_BASE_URL: "https://immich.example",
    IMMICH_HTTP_TIMEOUT_MS: 5000,
    IMMICH_PEOPLE_PAGE_SIZE: 1000,
    IMMICH_HTTP_MAX_RETRIES: 2,
    IMMICH_HTTP_RETRY_BASE_DELAY_MS: 200
  }
}));

vi.mock("../integrations/immich/client.js", () => ({
  ImmichClient: vi.fn(),
  loginToImmich: vi.fn()
}));

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: "user-1",
  email: "alice@example.com",
  name: "alice@example.com",
  passwordHash: null,
  immichUserId: null,
  immichBaseUrl: null,
  immichEmail: null,
  immichName: null,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
  ...overrides
});

describe("AuthService.loginWithPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.treemichSessionCreate.mockResolvedValue({ id: "session-1" });
  });

  it("creates a new user and session when no users exist yet (first-user bootstrap)", async () => {
    mocks.treemichUserFindFirst.mockResolvedValue(null); // no existing user
    mocks.treemichUserCount.mockResolvedValue(0); // no native users
    const newUser = makeUser({ id: "user-new", email: "alice@example.com" });
    mocks.treemichUserCreate.mockResolvedValue(newUser);

    const { AuthService } = await import("./service.js");
    const result = await new AuthService().loginWithPassword("alice@example.com", "secret");

    expect(mocks.treemichUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "alice@example.com" })
      })
    );
    expect(result.sessionToken).toBeTruthy();
    expect(result.state.authenticated).toBe(true);
    expect(result.state.user?.email).toBe("alice@example.com");
  });

  it("rejects when user does not exist but other native users do", async () => {
    mocks.treemichUserFindFirst.mockResolvedValue(null);
    mocks.treemichUserCount.mockResolvedValue(1);

    const { AuthService, TreemichAuthError } = await import("./service.js");
    await expect(new AuthService().loginWithPassword("unknown@example.com", "pw")).rejects.toBeInstanceOf(
      TreemichAuthError
    );
    expect(mocks.treemichUserCreate).not.toHaveBeenCalled();
  });

  it("normalizes email to lowercase before lookup", async () => {
    mocks.treemichUserFindFirst.mockResolvedValue(null);
    mocks.treemichUserCount.mockResolvedValue(0);
    mocks.treemichUserCreate.mockResolvedValue(makeUser({ email: "alice@example.com" }));

    const { AuthService } = await import("./service.js");
    await new AuthService().loginWithPassword("ALICE@Example.COM", "pw");

    expect(mocks.treemichUserFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "alice@example.com" } })
    );
  });

  it("sets password on existing user that has no passwordHash yet", async () => {
    const user = makeUser({ passwordHash: null, email: "alice@example.com" });
    mocks.treemichUserFindFirst.mockResolvedValue(user);
    mocks.treemichUserCount.mockResolvedValue(1);
    mocks.treemichUserUpdate.mockResolvedValue({ ...user, passwordHash: "hashed" });

    const { AuthService } = await import("./service.js");
    await new AuthService().loginWithPassword("alice@example.com", "newpassword");

    expect(mocks.treemichUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ passwordHash: expect.any(String) })
      })
    );
    expect(mocks.treemichSessionCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects with TreemichAuthError when password is wrong", async () => {
    // Import the real hashPassword to set a known hash
    const { hashPassword } = await import("./crypto.js");
    const user = makeUser({ passwordHash: hashPassword("correctpass") });
    mocks.treemichUserFindFirst.mockResolvedValue(user);
    mocks.treemichUserCount.mockResolvedValue(1);

    const { AuthService, TreemichAuthError } = await import("./service.js");
    await expect(new AuthService().loginWithPassword("alice@example.com", "wrongpass")).rejects.toBeInstanceOf(
      TreemichAuthError
    );
    expect(mocks.treemichSessionCreate).not.toHaveBeenCalled();
  });

  it("accepts correct password and creates a session", async () => {
    const { hashPassword } = await import("./crypto.js");
    const user = makeUser({ passwordHash: hashPassword("correctpass"), email: "alice@example.com" });
    mocks.treemichUserFindFirst.mockResolvedValue(user);
    mocks.treemichUserCount.mockResolvedValue(1);

    const { AuthService } = await import("./service.js");
    const result = await new AuthService().loginWithPassword("alice@example.com", "correctpass");

    expect(mocks.treemichSessionCreate).toHaveBeenCalledTimes(1);
    expect(result.sessionToken).toBeTruthy();
    expect(result.state.user?.id).toBe("user-1");
    expect(result.state.linkStatus).toEqual({ linked: false });
  });

  it("returns a standalone auth state without immichUserId when user has none", async () => {
    const { hashPassword } = await import("./crypto.js");
    const user = makeUser({ passwordHash: hashPassword("pw"), immichUserId: null });
    mocks.treemichUserFindFirst.mockResolvedValue(user);
    mocks.treemichUserCount.mockResolvedValue(1);

    const { AuthService } = await import("./service.js");
    const { state } = await new AuthService().loginWithPassword("alice@example.com", "pw");

    expect(state.user?.immichUserId).toBeUndefined();
  });
});

describe("AuthService.loginWithImmich", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.treemichSessionCreate.mockResolvedValue({ id: "session-1" });
    mocks.treemichUserUpsert.mockResolvedValue(
      makeUser({
        id: "user-1",
        immichBaseUrl: "https://immich.example",
        immichUserId: "immich-user-1",
        immichEmail: "alice@example.com",
        immichName: "Alice"
      })
    );
    mocks.linkedImmichAccountUpsert.mockResolvedValue({ id: "linked-1" });
    mocks.personProfileCount.mockResolvedValue(1);
    mocks.relationshipCount.mockResolvedValue(0);
  });

  it("syncs Immich person names after storing a fresh linked account token", async () => {
    const { loginToImmich } = await import("../integrations/immich/client.js");
    vi.mocked(loginToImmich).mockResolvedValue({
      accessToken: "fresh-token",
      userId: "immich-user-1",
      userEmail: "alice@example.com",
      name: "Alice",
      isAdmin: false,
      shouldChangePassword: false,
      isOnboarded: true
    });
    const listPeople = vi.fn().mockResolvedValue([{ id: "immich-person-1", name: "Alice Smith" }]);
    const dispose = vi.fn();
    const syncImmichExternalIdentityNames = vi.fn().mockResolvedValue({
      matched: 1,
      updated: 1,
      skippedUnnamed: 0
    });

    const { AuthService } = await import("./service.js");
    await new AuthService({
      personService: { syncImmichExternalIdentityNames },
      createImmichClientFromToken: () => ({ listPeople, dispose })
    }).loginWithImmich("alice@example.com", "password");

    expect(mocks.linkedImmichAccountUpsert).toHaveBeenCalledTimes(1);
    expect(listPeople).toHaveBeenCalledTimes(1);
    expect(syncImmichExternalIdentityNames).toHaveBeenCalledWith("user-1", [
      { id: "immich-person-1", name: "Alice Smith" }
    ]);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(mocks.treemichSessionCreate).toHaveBeenCalledTimes(1);
  });

  it("does not fail login when the post-login name sync fails", async () => {
    const { loginToImmich } = await import("../integrations/immich/client.js");
    vi.mocked(loginToImmich).mockResolvedValue({
      accessToken: "fresh-token",
      userId: "immich-user-1",
      userEmail: "alice@example.com",
      name: "Alice",
      isAdmin: false,
      shouldChangePassword: false,
      isOnboarded: true
    });
    const dispose = vi.fn();
    const syncImmichExternalIdentityNames = vi.fn();

    const { AuthService } = await import("./service.js");
    const result = await new AuthService({
      personService: { syncImmichExternalIdentityNames },
      createImmichClientFromToken: () => ({
        listPeople: vi.fn().mockRejectedValue(new Error("Immich list failed")),
        dispose
      })
    }).loginWithImmich("alice@example.com", "password");

    expect(result.state.authenticated).toBe(true);
    expect(syncImmichExternalIdentityNames).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(mocks.treemichSessionCreate).toHaveBeenCalledTimes(1);
  });
});
