import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  treemichUserFindFirst: vi.fn(),
  treemichUserFindUnique: vi.fn(),
  treemichUserFindMany: vi.fn(),
  treemichUserCount: vi.fn(),
  treemichUserCreate: vi.fn(),
  treemichUserUpdate: vi.fn(),
  treemichSessionCreate: vi.fn(),
  treemichSessionFindUnique: vi.fn(),
  treemichSessionDelete: vi.fn(),
  linkedImmichAccountFindUnique: vi.fn(),
  linkedImmichAccountUpsert: vi.fn(),
  linkedImmichAccountDeleteMany: vi.fn(),
  personProfileCount: vi.fn(),
  relationshipCount: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    treemichUser: {
      findFirst: mocks.treemichUserFindFirst,
      findUnique: mocks.treemichUserFindUnique,
      findMany: mocks.treemichUserFindMany,
      count: mocks.treemichUserCount,
      create: mocks.treemichUserCreate,
      update: mocks.treemichUserUpdate
    },
    treemichSession: {
      create: mocks.treemichSessionCreate,
      findUnique: mocks.treemichSessionFindUnique,
      delete: mocks.treemichSessionDelete
    },
    linkedImmichAccount: {
      findUnique: mocks.linkedImmichAccountFindUnique,
      upsert: mocks.linkedImmichAccountUpsert,
      deleteMany: mocks.linkedImmichAccountDeleteMany
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
  ImmichAuthenticationError: class ImmichAuthenticationError extends Error {
    readonly statusCode = 401;
  },
  ImmichClient: vi.fn(),
  loginToImmich: vi.fn()
}));

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: "user-1",
  email: "alice@example.com",
  name: "alice@example.com",
  passwordHash: null,
  _count: { profiles: 0 },
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
    mocks.treemichUserFindMany.mockResolvedValue([]); // no existing user
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
    mocks.treemichUserFindMany.mockResolvedValue([]);
    mocks.treemichUserCount.mockResolvedValue(1);

    const { AuthService, TreemichAuthError } = await import("./service.js");
    await expect(new AuthService().loginWithPassword("unknown@example.com", "pw")).rejects.toBeInstanceOf(
      TreemichAuthError
    );
    expect(mocks.treemichUserCreate).not.toHaveBeenCalled();
  });

  it("normalizes email to lowercase before lookup", async () => {
    mocks.treemichUserFindMany.mockResolvedValue([]);
    mocks.treemichUserCount.mockResolvedValue(0);
    mocks.treemichUserCreate.mockResolvedValue(makeUser({ email: "alice@example.com" }));

    const { AuthService } = await import("./service.js");
    await new AuthService().loginWithPassword("ALICE@Example.COM", "pw");

    expect(mocks.treemichUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "alice@example.com" } })
    );
  });

  it("sets password on existing user that has no passwordHash yet", async () => {
    const user = makeUser({ passwordHash: null, email: "alice@example.com" });
    mocks.treemichUserFindMany.mockResolvedValue([user]);
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
    mocks.treemichUserFindMany.mockResolvedValue([user]);
    mocks.treemichUserCount.mockResolvedValue(1);

    const { AuthService, TreemichAuthError } = await import("./service.js");
    await expect(
      new AuthService().loginWithPassword("alice@example.com", "wrongpass")
    ).rejects.toBeInstanceOf(TreemichAuthError);
    expect(mocks.treemichSessionCreate).not.toHaveBeenCalled();
  });

  it("accepts correct password and creates a session", async () => {
    const { hashPassword } = await import("./crypto.js");
    const user = makeUser({ passwordHash: hashPassword("correctpass"), email: "alice@example.com" });
    mocks.treemichUserFindMany.mockResolvedValue([user]);
    mocks.treemichUserCount.mockResolvedValue(1);

    const { AuthService } = await import("./service.js");
    const result = await new AuthService().loginWithPassword("alice@example.com", "correctpass");

    expect(mocks.treemichSessionCreate).toHaveBeenCalledTimes(1);
    expect(result.sessionToken).toBeTruthy();
    expect(result.state.user?.id).toBe("user-1");
    expect(result.state.linkStatus).toEqual({ linked: false });
  });

  it("chooses the matching duplicate email account with the most people", async () => {
    const { hashPassword } = await import("./crypto.js");
    const oldDuplicate = makeUser({
      id: "user-old",
      passwordHash: hashPassword("correctpass"),
      _count: { profiles: 253 },
      updatedAt: new Date("2025-01-01")
    });
    const primaryAccount = makeUser({
      id: "user-primary",
      passwordHash: hashPassword("correctpass"),
      _count: { profiles: 646 },
      updatedAt: new Date("2025-01-02")
    });
    mocks.treemichUserFindMany.mockResolvedValue([oldDuplicate, primaryAccount]);
    mocks.treemichUserCount.mockResolvedValue(2);

    const { AuthService } = await import("./service.js");
    const result = await new AuthService().loginWithPassword("alice@example.com", "correctpass");

    expect(mocks.treemichSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-primary" })
      })
    );
    expect(result.state.user?.id).toBe("user-primary");
  });

  it("returns a standalone auth state with only Treemich-owned user identity", async () => {
    const { hashPassword } = await import("./crypto.js");
    const user = makeUser({ passwordHash: hashPassword("pw") });
    mocks.treemichUserFindMany.mockResolvedValue([user]);
    mocks.treemichUserCount.mockResolvedValue(1);

    const { AuthService } = await import("./service.js");
    const { state } = await new AuthService().loginWithPassword("alice@example.com", "pw");

    expect(state.user).toEqual({ id: "user-1", email: "alice@example.com", name: "alice@example.com" });
  });

  it("reflects passwordChangeRequired flag from the user record", async () => {
    const { hashPassword } = await import("./crypto.js");
    const user = makeUser({
      passwordHash: hashPassword("pw"),
      passwordChangeRequired: true
    });
    mocks.treemichUserFindMany.mockResolvedValue([user]);
    mocks.treemichUserCount.mockResolvedValue(1);

    const { AuthService } = await import("./service.js");
    const { state } = await new AuthService().loginWithPassword("alice@example.com", "pw");

    expect(state.user!.passwordChangeRequired).toBe(true);
  });
});

describe("AuthService.loginWithImmich", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.treemichSessionCreate.mockResolvedValue({ id: "session-1" });
    mocks.linkedImmichAccountFindUnique.mockResolvedValue(null);
    mocks.treemichUserCreate.mockResolvedValue(
      makeUser({ id: "user-1", email: "alice@example.com", name: "Alice" })
    );
    mocks.linkedImmichAccountUpsert.mockResolvedValue({ id: "linked-1" });
    mocks.personProfileCount.mockResolvedValue(1);
    mocks.relationshipCount.mockResolvedValue(0);
  });

  it("stores linked Immich credentials and creates a session without server-side people sync", async () => {
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

    const { AuthService } = await import("./service.js");
    const result = await new AuthService().loginWithImmich("alice@example.com", "password");

    expect(mocks.linkedImmichAccountUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.treemichSessionCreate).toHaveBeenCalledTimes(1);
    expect(result.state.authenticated).toBe(true);
    expect(result.state.linkStatus).toEqual(
      expect.objectContaining({ linked: true, immichEmail: "alice@example.com" })
    );
  });
});

describe("AuthService.linkImmichAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.linkedImmichAccountFindUnique.mockResolvedValue(null);
    mocks.linkedImmichAccountUpsert.mockResolvedValue({ id: "linked-1" });
  });

  it("links Immich credentials to the current Treemich user (client syncs people separately)", async () => {
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

    const { AuthService } = await import("./service.js");
    const result = await new AuthService().linkImmichAccount("user-1", "alice@example.com", "password");

    expect(result).toEqual({
      linked: true,
      immichBaseUrl: "https://immich.example",
      immichEmail: "alice@example.com",
      immichName: "Alice"
    });
    expect(mocks.linkedImmichAccountUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        update: expect.objectContaining({ immichUserId: "immich-user-1" })
      })
    );
  });

  it("rejects an Immich account that is already linked to another Treemich user", async () => {
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
    mocks.linkedImmichAccountFindUnique.mockResolvedValue({ id: "linked-1", userId: "other-user" });

    const { AuthService, TreemichConflictError } = await import("./service.js");
    await expect(
      new AuthService().linkImmichAccount("user-1", "alice@example.com", "password")
    ).rejects.toBeInstanceOf(TreemichConflictError);
    expect(mocks.linkedImmichAccountUpsert).not.toHaveBeenCalled();
  });

  it("unlinks Immich credentials without touching imported provider data", async () => {
    mocks.linkedImmichAccountDeleteMany.mockResolvedValue({ count: 1 });

    const { AuthService } = await import("./service.js");
    const result = await new AuthService().unlinkImmichAccount("user-1");

    expect(result).toEqual({ linked: false });
    expect(mocks.linkedImmichAccountDeleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });
});

describe("AuthService.changePassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates passwordHash and clears passwordChangeRequired on success", async () => {
    const { hashPassword } = await import("./crypto.js");
    const user = makeUser({ passwordHash: hashPassword("old-pass"), passwordChangeRequired: true });
    mocks.treemichUserFindUnique.mockResolvedValue(user);
    mocks.treemichUserUpdate.mockResolvedValue({
      ...user,
      passwordHash: "new-hash",
      passwordChangeRequired: false
    });

    const { AuthService } = await import("./service.js");
    await new AuthService().changePassword("user-1", "old-pass", "new-password-123");

    expect(mocks.treemichUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({
          passwordHash: expect.any(String),
          passwordChangeRequired: false
        })
      })
    );
  });

  it("throws TreemichAuthError when current password is wrong", async () => {
    const { hashPassword } = await import("./crypto.js");
    const user = makeUser({ passwordHash: hashPassword("correct-pass") });
    mocks.treemichUserFindUnique.mockResolvedValue(user);

    const { AuthService, TreemichAuthError } = await import("./service.js");
    await expect(
      new AuthService().changePassword("user-1", "wrong-pass", "new-password-123")
    ).rejects.toBeInstanceOf(TreemichAuthError);
    expect(mocks.treemichUserUpdate).not.toHaveBeenCalled();
  });

  it("throws TreemichAuthError when user does not exist", async () => {
    mocks.treemichUserFindUnique.mockResolvedValue(null);

    const { AuthService, TreemichAuthError } = await import("./service.js");
    await expect(
      new AuthService().changePassword("nonexistent", "pass", "new-pass-123")
    ).rejects.toBeInstanceOf(TreemichAuthError);
    expect(mocks.treemichUserUpdate).not.toHaveBeenCalled();
  });

  it("throws TreemichAuthError when user has no passwordHash", async () => {
    const user = makeUser({ passwordHash: null });
    mocks.treemichUserFindUnique.mockResolvedValue(user);

    const { AuthService, TreemichAuthError } = await import("./service.js");
    await expect(new AuthService().changePassword("user-1", "pass", "new-pass-123")).rejects.toBeInstanceOf(
      TreemichAuthError
    );
    expect(mocks.treemichUserUpdate).not.toHaveBeenCalled();
  });
});
