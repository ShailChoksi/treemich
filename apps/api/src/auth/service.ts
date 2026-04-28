import type { Prisma } from "@prisma/client";
import type { AuthState } from "@treemich/shared";
import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import { createOpaqueToken, encryptSecret, hashPassword, hashToken, verifyPassword } from "./crypto.js";
import { ImmichClient, loginToImmich } from "../integrations/immich/client.js";
import { PersonService } from "../people/service.js";

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

const legacySharedUserId = "legacy-shared-user";

export class TreemichAuthError extends Error {
  readonly statusCode = 401;

  constructor(message: string) {
    super(message);
    this.name = "TreemichAuthError";
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

type ImmichPeopleClient = Pick<ImmichClient, "listPeople" | "dispose">;

type AuthServiceOptions = {
  personService?: Pick<PersonService, "syncImmichExternalIdentityNames">;
  createImmichClientFromToken?: (accessToken: string) => ImmichPeopleClient;
};

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

export class AuthService {
  private readonly sessionCacheTtlMs = 30_000;
  private readonly maxSessionCacheEntries = 500;
  private readonly sessionCache = new SessionContextCache(
    this.sessionCacheTtlMs,
    this.maxSessionCacheEntries
  );
  private readonly personService: Pick<PersonService, "syncImmichExternalIdentityNames">;

  constructor(private readonly options: AuthServiceOptions = {}) {
    this.personService = options.personService ?? new PersonService();
  }

  async loginWithPassword(
    email: string,
    password: string
  ): Promise<{
    sessionToken: string;
    state: AuthState;
  }> {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await prisma.treemichUser.findFirst({
      where: { email: normalizedEmail }
    });
    const nativeUserCount = await prisma.treemichUser.count({
      where: { passwordHash: { not: null } }
    });

    if (!existing && nativeUserCount > 0) {
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
          name: user.name ?? user.immichName ?? normalizedEmail
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
      state: {
        authenticated: true,
        user: {
          id: user.id,
          immichUserId: user.immichUserId ?? undefined,
          email: user.email ?? user.immichEmail ?? normalizedEmail,
          name: user.name ?? user.immichName ?? normalizedEmail
        },
        linkStatus: {
          linked: false
        }
      }
    };
  }

  async loginWithImmich(
    email: string,
    password: string
  ): Promise<{
    sessionToken: string;
    state: AuthState;
  }> {
    const login = await loginToImmich({
      baseUrl: env.IMMICH_BASE_URL,
      email,
      password,
      timeoutMs: env.IMMICH_HTTP_TIMEOUT_MS
    });

    const encryptedToken = encryptSecret(login.accessToken);
    const user = await prisma.treemichUser.upsert({
      where: {
        immichBaseUrl_immichUserId: {
          immichBaseUrl: env.IMMICH_BASE_URL,
          immichUserId: login.userId
        }
      },
      update: {
        immichEmail: login.userEmail,
        immichName: login.name
      },
      create: {
        immichBaseUrl: env.IMMICH_BASE_URL,
        immichUserId: login.userId,
        immichEmail: login.userEmail,
        immichName: login.name
      }
    });

    await this.claimLegacyData(user.id);

    await prisma.linkedImmichAccount.upsert({
      where: {
        userId: user.id
      },
      update: {
        immichBaseUrl: env.IMMICH_BASE_URL,
        immichUserId: login.userId,
        immichEmail: login.userEmail,
        immichName: login.name,
        encryptedAccessToken: encryptedToken.encryptedValue,
        accessTokenIv: encryptedToken.iv,
        accessTokenTag: encryptedToken.authTag,
        lastValidatedAt: new Date()
      },
      create: {
        userId: user.id,
        immichBaseUrl: env.IMMICH_BASE_URL,
        immichUserId: login.userId,
        immichEmail: login.userEmail,
        immichName: login.name,
        encryptedAccessToken: encryptedToken.encryptedValue,
        accessTokenIv: encryptedToken.iv,
        accessTokenTag: encryptedToken.authTag,
        lastValidatedAt: new Date()
      }
    });

    await this.syncImmichPersonNamesAfterLogin(user.id, login.accessToken);

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
      state: {
        authenticated: true,
        user: {
          id: user.id,
          immichUserId: user.immichUserId ?? undefined,
          email: user.email ?? user.immichEmail ?? login.userEmail,
          name: user.name ?? user.immichName ?? login.name
        },
        linkStatus: {
          linked: true,
          immichBaseUrl: user.immichBaseUrl ?? undefined,
          immichEmail: user.immichEmail ?? undefined,
          immichName: user.immichName ?? undefined
        }
      }
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

    return {
      authenticated: true,
      user: {
        id: context.user.id,
        immichUserId: context.user.immichUserId ?? undefined,
        email: context.user.email ?? context.user.immichEmail ?? context.user.id,
        name: context.user.name ?? context.user.immichName ?? context.user.id
      },
      linkStatus: linkedAccount
        ? {
            linked: true,
            immichBaseUrl: linkedAccount.immichBaseUrl,
            immichEmail: linkedAccount.immichEmail,
            immichName: linkedAccount.immichName
          }
        : { linked: false }
    };
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

  private createImmichClientFromToken(accessToken: string): ImmichPeopleClient {
    return (
      this.options.createImmichClientFromToken?.(accessToken) ??
      new ImmichClient({
        baseUrl: env.IMMICH_BASE_URL,
        accessToken,
        peoplePageSize: env.IMMICH_PEOPLE_PAGE_SIZE,
        timeoutMs: env.IMMICH_HTTP_TIMEOUT_MS,
        maxRetries: env.IMMICH_HTTP_MAX_RETRIES,
        retryBaseDelayMs: env.IMMICH_HTTP_RETRY_BASE_DELAY_MS
      })
    );
  }

  private async syncImmichPersonNamesAfterLogin(userId: string, accessToken: string) {
    const client = this.createImmichClientFromToken(accessToken);
    try {
      const people = await client.listPeople();
      await this.personService.syncImmichExternalIdentityNames(userId, people);
    } catch {
      // Name recovery should not prevent a successful Immich login.
    } finally {
      client.dispose();
    }
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
      throw new TreemichAuthError("Immich account is not linked");
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
