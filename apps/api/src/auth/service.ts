import type { Prisma } from "@prisma/client";
import type { AuthState } from "@treemich/shared";
import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import { createOpaqueToken, encryptSecret, hashPassword, hashToken, verifyPassword } from "./crypto.js";
import { ImmichAuthenticationError, loginToImmich } from "../integrations/immich/client.js";

const authSessionIncludeLight = {
  user: true
} as const satisfies Prisma.TreemichSessionInclude;

const authSessionIncludeFull = {
  user: {
    include: {
      linkedAccount: true
    }
  }
} as const satisfies Prisma.TreemichSessionInclude;

type SessionWithUserLight = Prisma.TreemichSessionGetPayload<{
  include: typeof authSessionIncludeLight;
}>;

type SessionWithUserFull = Prisma.TreemichSessionGetPayload<{
  include: typeof authSessionIncludeFull;
}>;

const passwordLoginUserInclude = {
  _count: {
    select: {
      profiles: true
    }
  }
} as const satisfies Prisma.TreemichUserInclude;

type PasswordLoginUser = Prisma.TreemichUserGetPayload<{
  include: typeof passwordLoginUserInclude;
}>;

const legacySharedUserId = "legacy-shared-user";

export class TreemichAuthError extends Error {
  readonly statusCode = 401;

  constructor(message: string) {
    super(message);
    this.name = "TreemichAuthError";
  }
}

export class TreemichConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = "TreemichConflictError";
  }
}

export type AuthenticatedRequestContext = {
  user: SessionWithUserLight["user"];
  session: SessionWithUserLight;
};

export type LinkedAuthenticatedRequestContext = AuthenticatedRequestContext & {
  linkedAccount: NonNullable<SessionWithUserFull["user"]["linkedAccount"]>;
};

type SessionResolutionOptions = {
  includeLinkedAccount?: boolean;
};

type ResolvedSessionContext<TOptions extends SessionResolutionOptions | undefined> = TOptions extends {
  includeLinkedAccount: true;
}
  ? LinkedAuthenticatedRequestContext
  : AuthenticatedRequestContext;

type CachedContext = AuthenticatedRequestContext | LinkedAuthenticatedRequestContext | null;

type ImmichLoginResult = Awaited<ReturnType<typeof loginToImmich>>;

class SessionContextCache {
  private readonly cache = new Map<string, { expiresAt: number; context: CachedContext }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number
  ) {}

  private key(tokenHash: string, includeLinkedAccount: boolean) {
    return `${includeLinkedAccount ? "full" : "light"}:${tokenHash}`;
  }

  get(tokenHash: string, includeLinkedAccount: boolean) {
    const cacheKey = this.key(tokenHash, includeLinkedAccount);
    const cached = this.cache.get(cacheKey);
    if (!cached) {
      return undefined;
    }
    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(cacheKey);
      return undefined;
    }
    this.cache.delete(cacheKey);
    this.cache.set(cacheKey, cached);
    return cached.context;
  }

  set(tokenHash: string, includeLinkedAccount: boolean, context: CachedContext) {
    const cacheKey = this.key(tokenHash, includeLinkedAccount);
    this.cache.set(cacheKey, {
      expiresAt: Date.now() + this.ttlMs,
      context
    });
    while (this.cache.size > this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.cache.delete(oldestKey);
    }
  }

  clearByTokenHash(tokenHash: string) {
    this.cache.delete(this.key(tokenHash, false));
    this.cache.delete(this.key(tokenHash, true));
  }
}

const comparePasswordLoginUsers = (left: PasswordLoginUser, right: PasswordLoginUser) => {
  const profileDelta = right._count.profiles - left._count.profiles;
  if (profileDelta !== 0) {
    return profileDelta;
  }
  const updatedDelta = right.updatedAt.getTime() - left.updatedAt.getTime();
  if (updatedDelta !== 0) {
    return updatedDelta;
  }
  return left.id.localeCompare(right.id);
};

const pickPasswordLoginUser = (candidates: PasswordLoginUser[], password: string) => {
  const candidatesWithPassword = candidates.filter((user) => user.passwordHash);
  if (candidatesWithPassword.length > 0) {
    return (
      candidatesWithPassword
        .filter((user) => user.passwordHash && verifyPassword(password, user.passwordHash))
        .sort(comparePasswordLoginUsers)[0] ?? null
    );
  }
  return [...candidates].sort(comparePasswordLoginUsers)[0] ?? null;
};

export class AuthService {
  private readonly sessionCacheTtlMs = 30_000;
  private readonly maxSessionCacheEntries = 500;
  private readonly sessionCache = new SessionContextCache(
    this.sessionCacheTtlMs,
    this.maxSessionCacheEntries
  );

  constructor() {}

  private userState(
    user: Pick<SessionWithUserLight["user"], "id" | "email" | "name">,
    linkStatus?: AuthState["linkStatus"]
  ): AuthState {
    return {
      authenticated: true,
      user: {
        id: user.id,
        email: user.email ?? user.id,
        name: user.name ?? user.email ?? user.id
      },
      linkStatus: linkStatus ?? { linked: false }
    };
  }

  async loginWithPassword(
    email: string,
    password: string
  ): Promise<{
    sessionToken: string;
    state: AuthState;
  }> {
    const normalizedEmail = email.trim().toLowerCase();
    const existingCandidates = await prisma.treemichUser.findMany({
      where: { email: normalizedEmail },
      include: passwordLoginUserInclude
    });
    const nativeUserCount = await prisma.treemichUser.count({
      where: { passwordHash: { not: null } }
    });

    if (existingCandidates.length === 0 && nativeUserCount > 0) {
      throw new TreemichAuthError("Invalid email or password");
    }

    const existing = pickPasswordLoginUser(existingCandidates, password);
    if (existingCandidates.some((user) => user.passwordHash) && !existing) {
      throw new TreemichAuthError("Invalid email or password");
    }

    const user =
      existing ??
      (await prisma.treemichUser.create({
        data: {
          email: normalizedEmail,
          name: normalizedEmail,
          passwordHash: hashPassword(password)
        }
      }));

    if (!user.passwordHash) {
      await prisma.treemichUser.update({
        where: { id: user.id },
        data: {
          passwordHash: hashPassword(password),
          email: normalizedEmail,
          name: user.name ?? normalizedEmail
        }
      });
    } else if (!verifyPassword(password, user.passwordHash)) {
      throw new TreemichAuthError("Invalid email or password");
    }

    const sessionToken = createOpaqueToken();
    await prisma.treemichSession.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(sessionToken),
        expiresAt: new Date(Date.now() + env.TREEMICH_SESSION_TTL_MS)
      }
    });

    return {
      sessionToken,
      state: this.userState(user)
    };
  }

  async loginWithImmich(
    email: string,
    password: string
  ): Promise<{
    sessionToken: string;
    state: AuthState;
  }> {
    const immichBaseUrl = this.requireConfiguredImmichBaseUrl();
    const login = await this.loginToImmichWithGenericAuthError(email, password);

    const existingLink = await prisma.linkedImmichAccount.findUnique({
      where: {
        immichBaseUrl_immichUserId: {
          immichBaseUrl,
          immichUserId: login.userId
        }
      },
      include: { user: true }
    });
    const user =
      existingLink?.user ??
      (await prisma.treemichUser.create({
        data: {
          email: login.userEmail.trim().toLowerCase(),
          name: login.name || login.userEmail
        }
      }));

    await this.claimLegacyData(user.id);

    await this.storeLinkedImmichAccount(user.id, login);

    const sessionToken = createOpaqueToken();
    await prisma.treemichSession.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(sessionToken),
        expiresAt: new Date(Date.now() + env.TREEMICH_SESSION_TTL_MS)
      }
    });

    return {
      sessionToken,
      state: this.userState(user, {
        linked: true,
        immichBaseUrl,
        immichEmail: login.userEmail,
        immichName: login.name
      })
    };
  }

  async getAuthState(sessionToken?: string | null): Promise<AuthState> {
    const context = await this.resolveSession(sessionToken);
    if (!context) {
      return {
        authenticated: false,
        linkStatus: {
          linked: false
        }
      };
    }

    const linkedAccount = await prisma.linkedImmichAccount.findUnique({
      where: { userId: context.user.id }
    });

    return this.userState(
      context.user,
      linkedAccount
        ? {
            linked: true,
            immichBaseUrl: linkedAccount.immichBaseUrl,
            immichEmail: linkedAccount.immichEmail,
            immichName: linkedAccount.immichName
          }
        : { linked: false }
    );
  }

  async linkImmichAccount(userId: string, email: string, password: string) {
    const immichBaseUrl = this.requireConfiguredImmichBaseUrl();
    const login = await this.loginToImmichWithGenericAuthError(email, password);
    const existingLink = await prisma.linkedImmichAccount.findUnique({
      where: {
        immichBaseUrl_immichUserId: {
          immichBaseUrl,
          immichUserId: login.userId
        }
      }
    });
    if (existingLink && existingLink.userId !== userId) {
      throw new TreemichConflictError("Immich account is already linked to another Treemich user");
    }

    await this.storeLinkedImmichAccount(userId, login);
    return {
      linked: true,
      immichBaseUrl,
      immichEmail: login.userEmail,
      immichName: login.name
    } satisfies NonNullable<AuthState["linkStatus"]>;
  }

  async unlinkImmichAccount(userId: string) {
    await prisma.linkedImmichAccount.deleteMany({
      where: { userId }
    });
    return { linked: false } satisfies NonNullable<AuthState["linkStatus"]>;
  }

  clearSessionCacheForToken(sessionToken?: string | null) {
    if (!sessionToken) {
      return;
    }
    this.sessionCache.clearByTokenHash(hashToken(sessionToken));
  }

  async requireSession<TOptions extends SessionResolutionOptions | undefined = undefined>(
    sessionToken?: string | null,
    options?: TOptions
  ): Promise<ResolvedSessionContext<TOptions>> {
    const context = await this.resolveSession(sessionToken, options);
    if (!context) {
      throw new TreemichAuthError("Unauthorized");
    }
    return context as ResolvedSessionContext<TOptions>;
  }

  async requireLinkedSession(sessionToken?: string | null): Promise<LinkedAuthenticatedRequestContext> {
    return this.requireSession(sessionToken, { includeLinkedAccount: true });
  }

  async logout(sessionToken?: string | null) {
    if (!sessionToken) {
      return;
    }

    const tokenHash = hashToken(sessionToken);
    this.sessionCache.clearByTokenHash(tokenHash);
    await prisma.treemichSession.deleteMany({
      where: {
        tokenHash
      }
    });
  }

  async cleanupExpiredSessions(referenceTime = new Date()) {
    const result = await prisma.treemichSession.deleteMany({
      where: {
        expiresAt: {
          lte: referenceTime
        }
      }
    });

    return result.count;
  }

  private async loginToImmichWithGenericAuthError(email: string, password: string) {
    const immichBaseUrl = this.requireConfiguredImmichBaseUrl();
    try {
      return await loginToImmich({
        baseUrl: immichBaseUrl,
        email,
        password,
        timeoutMs: env.IMMICH_HTTP_TIMEOUT_MS
      });
    } catch (error) {
      if (error instanceof ImmichAuthenticationError) {
        throw new TreemichAuthError("Invalid Immich email or password");
      }
      throw error;
    }
  }

  private async storeLinkedImmichAccount(userId: string, login: ImmichLoginResult) {
    const immichBaseUrl = this.requireConfiguredImmichBaseUrl();
    const encryptedToken = encryptSecret(login.accessToken);
    return prisma.linkedImmichAccount.upsert({
      where: {
        userId
      },
      update: {
        immichBaseUrl,
        immichUserId: login.userId,
        immichEmail: login.userEmail,
        immichName: login.name,
        encryptedAccessToken: encryptedToken.encryptedValue,
        accessTokenIv: encryptedToken.iv,
        accessTokenTag: encryptedToken.authTag,
        lastValidatedAt: new Date()
      },
      create: {
        userId,
        immichBaseUrl,
        immichUserId: login.userId,
        immichEmail: login.userEmail,
        immichName: login.name,
        encryptedAccessToken: encryptedToken.encryptedValue,
        accessTokenIv: encryptedToken.iv,
        accessTokenTag: encryptedToken.authTag,
        lastValidatedAt: new Date()
      }
    });
  }

  private requireConfiguredImmichBaseUrl() {
    if (!env.IMMICH_BASE_URL) {
      throw new TreemichConflictError("Immich provider is not configured");
    }
    return env.IMMICH_BASE_URL;
  }

  private async resolveSession<TOptions extends SessionResolutionOptions | undefined = undefined>(
    sessionToken?: string | null,
    options?: TOptions
  ): Promise<ResolvedSessionContext<TOptions> | null> {
    if (!sessionToken) {
      return null;
    }

    const tokenHash = hashToken(sessionToken);
    const includeLinkedAccount = options?.includeLinkedAccount ?? false;
    const cached = this.sessionCache.get(tokenHash, includeLinkedAccount);
    if (cached !== undefined) {
      return cached as ResolvedSessionContext<TOptions> | null;
    }

    const session = await prisma.treemichSession.findUnique({
      where: {
        tokenHash
      },
      include: includeLinkedAccount ? authSessionIncludeFull : authSessionIncludeLight
    });

    if (!session) {
      this.sessionCache.set(tokenHash, includeLinkedAccount, null);
      return null;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      this.sessionCache.clearByTokenHash(tokenHash);
      await prisma.treemichSession.delete({
        where: {
          id: session.id
        }
      });
      return null;
    }

    const linkedAccount = "linkedAccount" in session.user ? session.user.linkedAccount : undefined;
    if (includeLinkedAccount && !linkedAccount) {
      throw new TreemichConflictError("Immich account is not linked");
    }

    const baseContext: AuthenticatedRequestContext = {
      user: session.user,
      session
    };
    const context = includeLinkedAccount
      ? ({ ...baseContext, linkedAccount: linkedAccount! } as LinkedAuthenticatedRequestContext)
      : baseContext;
    this.sessionCache.set(tokenHash, includeLinkedAccount, context);
    return context as ResolvedSessionContext<TOptions>;
  }

  private async claimLegacyData(userId: string) {
    if (userId === legacySharedUserId) {
      return;
    }

    const [existingProfileCount, existingRelationshipCount, legacyProfileCount, legacyRelationshipCount] =
      await Promise.all([
        prisma.personProfile.count({ where: { userId } }),
        prisma.relationship.count({ where: { userId } }),
        prisma.personProfile.count({ where: { userId: legacySharedUserId } }),
        prisma.relationship.count({ where: { userId: legacySharedUserId } })
      ]);

    if (existingProfileCount > 0 || existingRelationshipCount > 0) {
      return;
    }

    if (legacyProfileCount === 0 && legacyRelationshipCount === 0) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.personProfile.updateMany({
        where: { userId: legacySharedUserId },
        data: { userId }
      });
      await tx.relationship.updateMany({
        where: { userId: legacySharedUserId },
        data: { userId }
      });
      await tx.treemichUser.deleteMany({
        where: {
          id: legacySharedUserId,
          profiles: { none: {} },
          relationships: { none: {} },
          sessions: { none: {} },
          linkedAccount: null
        }
      });
    });
  }
}
