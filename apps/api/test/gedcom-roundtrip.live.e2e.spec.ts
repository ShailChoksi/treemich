import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:54321/treemich_test";
process.env.IMMICH_BASE_URL ??= "http://localhost:2283/api";
process.env.TREEMICH_ENCRYPTION_KEY ??= "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.TREEMICH_SESSION_COOKIE_NAME ??= "treemich_session";
process.env.TREEMICH_GEDCOM_EXPORT_ENABLED = "true";
process.env.TREEMICH_GEDCOM_IMPORT_ENABLED = "true";
process.env.TREEMICH_FAMILY_MODEL_ENABLED = "true";

type PrismaSingleton = (typeof import("../src/db/client.js"))["prisma"];
type HashToken = (typeof import("../src/auth/crypto.js"))["hashToken"];
type ExportJobStatus = {
  status: string;
  downloadUrl: string | null;
};
type ImportJobStatus = {
  status: string;
  summary: { created: { indis: number } };
  lineLog: Array<{ message: string }>;
};

const TEST_EMAIL_PREFIX = "phase-b-gedcom-roundtrip+";
const JOB_TIMEOUT_MS = 10_000;

let app: FastifyInstance | null = null;
let prisma: PrismaSingleton | null = null;
let hashToken: HashToken | null = null;
let dbUnavailableReason: string | null = null;

const makeId = (runId: string, suffix: string) => `phaseb-${runId}-${suffix}`;

const cleanupTestUsers = async () => {
  if (!prisma) return;
  try {
    await prisma.treemichUser.deleteMany({
      where: {
        email: {
          startsWith: TEST_EMAIL_PREFIX
        }
      }
    });
  } catch (error) {
    if (!dbUnavailableReason) {
      throw error;
    }
  }
};

const seedSession = async (userId: string, token: string) => {
  if (!prisma || !hashToken) throw new Error("Test DB is not initialized");
  await prisma.treemichSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60_000)
    }
  });
};

const authCookie = (token: string) =>
  `${process.env.TREEMICH_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;

const pollJob = async <T extends { status: string }>(
  request: () => Promise<{ statusCode: number; json: () => T }>,
  terminalStatuses = new Set(["COMPLETED", "FAILED"])
): Promise<T> => {
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  let last: T | null = null;
  while (Date.now() < deadline) {
    const response = await request();
    expect(response.statusCode).toBe(200);
    last = response.json();
    if (terminalStatuses.has(last.status)) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for job; last status=${last?.status ?? "none"}`);
};

const normalizeUserSnapshot = async (userId: string) => {
  if (!prisma) throw new Error("Test DB is not initialized");
  const [people, names, families, lifeEvents, repositories, sources, mediaObjects, mediaLinks] =
    await Promise.all([
      prisma.personProfile.findMany({
        where: { userId },
        select: { givenName: true, surname: true, gender: true },
        orderBy: [{ surname: "asc" }, { givenName: "asc" }]
      }),
      prisma.personName.findMany({
        where: { userId },
        select: { givenName: true, surname: true, type: true, isPrimary: true },
        orderBy: [{ surname: "asc" }, { givenName: "asc" }, { type: "asc" }]
      }),
      prisma.family.findMany({
        where: { userId },
        include: {
          parent1: { select: { givenName: true, surname: true } },
          parent2: { select: { givenName: true, surname: true } },
          children: {
            include: { child: { select: { givenName: true, surname: true } } },
            orderBy: { pedigree: "asc" }
          }
        },
        orderBy: { id: "asc" }
      }),
      prisma.lifeEvent.findMany({
        where: { userId },
        include: {
          personProfile: { select: { givenName: true, surname: true } },
          family: true,
          place: { select: { name: true } },
          citations: { include: { source: { select: { title: true } } } }
        },
        orderBy: [{ eventType: "asc" }, { year: "asc" }]
      }),
      prisma.repository.findMany({
        where: { userId },
        select: { name: true, url: true },
        orderBy: { name: "asc" }
      }),
      prisma.source.findMany({
        where: { userId },
        select: { title: true, url: true },
        orderBy: { title: "asc" }
      }),
      prisma.mediaObject.findMany({
        where: { userId },
        select: { storageUrl: true, mimeType: true, title: true },
        orderBy: { storageUrl: "asc" }
      }),
      prisma.mediaLink.findMany({
        where: { userId },
        select: { targetType: true },
        orderBy: { targetType: "asc" }
      })
    ]);

  return {
    people,
    alternateNames: names.map((name) => ({
      givenName: name.givenName,
      surname: name.surname,
      type: name.type,
      isPrimary: name.isPrimary
    })),
    families: families.map((family) => ({
      parents: [family.parent1, family.parent2]
        .filter(Boolean)
        .map((person) => `${person!.givenName} ${person!.surname}`)
        .sort(),
      children: family.children.map((child) => ({
        name: child.child ? `${child.child.givenName} ${child.child.surname}` : null,
        pedigree: child.pedigree
      }))
    })),
    lifeEvents: lifeEvents.map((event) => ({
      eventType: event.eventType,
      customLabel: event.customLabel,
      dateQualifier: event.dateQualifier,
      year: event.year,
      month: event.month,
      day: event.day,
      endYear: event.endYear,
      placeName: event.place?.name ?? null,
      personName: event.personProfile
        ? `${event.personProfile.givenName} ${event.personProfile.surname}`
        : null,
      citationTitles: event.citations.map((citation) => citation.source.title).sort()
    })),
    repositories,
    sources,
    mediaObjects,
    mediaLinks
  };
};

describe("GEDCOM live DB round-trip", () => {
  beforeAll(async () => {
    try {
      const db = await import("../src/db/client.js");
      const crypto = await import("../src/auth/crypto.js");
      const appModule = await import("../src/app.js");
      prisma = db.prisma;
      hashToken = crypto.hashToken;
      await prisma.$queryRaw`SELECT 1`;
      await cleanupTestUsers();
      app = appModule.buildApp();
    } catch (error) {
      dbUnavailableReason = error instanceof Error ? error.message : String(error);
    }
  });

  afterAll(async () => {
    await cleanupTestUsers();
    if (app) {
      await app.close();
    }
    await (prisma as PrismaClient | null)?.$disconnect();
  });

  it("round-trips async GEDCOM export into a second user with semantic assertions", async () => {
    if (dbUnavailableReason) {
      console.warn(`Skipping live GEDCOM round-trip: ${dbUnavailableReason}`);
      return;
    }
    if (!app || !prisma) throw new Error("Test app is not initialized");

    const runId = Date.now().toString(36);
    const sourceUserId = makeId(runId, "source-user");
    const targetUserId = makeId(runId, "target-user");
    const sourceToken = makeId(runId, "source-token");
    const targetToken = makeId(runId, "target-token");

    await prisma.treemichUser.createMany({
      data: [
        {
          id: sourceUserId,
          email: `${TEST_EMAIL_PREFIX}${runId}-source@example.test`,
          name: "Round Trip Source"
        },
        {
          id: targetUserId,
          email: `${TEST_EMAIL_PREFIX}${runId}-target@example.test`,
          name: "Round Trip Target"
        }
      ]
    });
    await seedSession(sourceUserId, sourceToken);
    await seedSession(targetUserId, targetToken);

    const parent1Id = makeId(runId, "pat");
    const parent2Id = makeId(runId, "alex");
    const childId = makeId(runId, "casey");
    const familyId = makeId(runId, "fam");
    const spouseRelId = makeId(runId, "spouse");
    const sourceId = makeId(runId, "source");
    const repoId = makeId(runId, "repo");
    const mediaId = makeId(runId, "media");

    await prisma.personProfile.createMany({
      data: [
        { id: parent1Id, userId: sourceUserId, givenName: "Pat", surname: "Taylor", gender: "MALE" },
        { id: parent2Id, userId: sourceUserId, givenName: "Alex", surname: "Morgan", gender: "FEMALE" },
        { id: childId, userId: sourceUserId, givenName: "Casey", surname: "Taylor", gender: "UNKNOWN" }
      ]
    });
    await prisma.personName.create({
      data: {
        userId: sourceUserId,
        personProfileId: parent2Id,
        type: "AKA",
        givenName: "Lex",
        surname: "Morgan",
        isPrimary: false
      }
    });
    await prisma.repository.create({
      data: { id: repoId, userId: sourceUserId, name: "County Archive", url: "https://archive.example.test" }
    });
    await prisma.source.create({
      data: {
        id: sourceId,
        userId: sourceUserId,
        repositoryId: repoId,
        title: "Taylor Family Register",
        url: "https://source.example.test/register"
      }
    });
    await prisma.family.create({
      data: {
        id: familyId,
        userId: sourceUserId,
        parent1PersonId: parent1Id,
        parent2PersonId: parent2Id,
        externalIds: { gedcomFam: "F777" },
        children: { create: [{ childPersonId: childId, pedigree: "ADOPTED" }] }
      }
    });
    await prisma.relationship.createMany({
      data: [
        {
          id: spouseRelId,
          userId: sourceUserId,
          fromPersonId: parent2Id,
          toPersonId: parent1Id,
          type: "SPOUSE_OF"
        },
        { userId: sourceUserId, fromPersonId: parent1Id, toPersonId: childId, type: "PARENT_OF", familyId },
        { userId: sourceUserId, fromPersonId: childId, toPersonId: parent1Id, type: "CHILD_OF", familyId },
        { userId: sourceUserId, fromPersonId: parent2Id, toPersonId: childId, type: "PARENT_OF", familyId },
        { userId: sourceUserId, fromPersonId: childId, toPersonId: parent2Id, type: "CHILD_OF", familyId }
      ]
    });
    const birthEvent = await prisma.lifeEvent.create({
      data: {
        userId: sourceUserId,
        personProfileId: childId,
        eventType: "BIRTH",
        dateQualifier: "ABOUT",
        year: 2010,
        month: 5,
        notes: "Round-trip child birth",
        citations: { create: [{ userId: sourceUserId, sourceId, page: "p. 12" }] }
      }
    });
    await prisma.lifeEvent.createMany({
      data: [
        {
          userId: sourceUserId,
          relationshipId: spouseRelId,
          eventType: "MARRIAGE",
          year: 2009,
          month: 8,
          day: 14
        },
        {
          userId: sourceUserId,
          familyId,
          eventType: "CUSTOM",
          customLabel: "Family Reunion",
          dateQualifier: "BETWEEN",
          year: 2015,
          endYear: 2016
        }
      ]
    });
    await prisma.mediaObject.create({
      data: {
        id: mediaId,
        userId: sourceUserId,
        storageUrl: "https://media.example.test/family.jpg",
        mimeType: "image/jpeg",
        title: "Family photo"
      }
    });
    await prisma.mediaLink.createMany({
      data: [
        { userId: sourceUserId, mediaObjectId: mediaId, targetType: "LIFE_EVENT", targetId: birthEvent.id },
        { userId: sourceUserId, mediaObjectId: mediaId, targetType: "SOURCE", targetId: sourceId }
      ]
    });

    const exportCreate = await app.inject({
      method: "POST",
      url: "/export/gedcom/jobs",
      headers: { cookie: authCookie(sourceToken) },
      payload: { includeTreemichCustomTags: true }
    });
    expect(exportCreate.statusCode).toBe(200);
    const exportJobId = exportCreate.json<{ id: string }>().id;
    const exportJob = await pollJob<ExportJobStatus>(() =>
      app!.inject({
        method: "GET",
        url: `/export/gedcom/jobs/${exportJobId}`,
        headers: { cookie: authCookie(sourceToken) }
      })
    );
    expect(exportJob.status).toBe("COMPLETED");
    expect(exportJob.downloadUrl).toMatch(new RegExp(`/export/gedcom/jobs/${exportJobId}/ged/.+`));
    expect(exportJob.downloadUrl).not.toBeNull();

    const download = await app.inject({
      method: "GET",
      url: exportJob.downloadUrl!,
      headers: { cookie: authCookie(sourceToken) }
    });
    expect(download.statusCode).toBe(200);
    const gedcomUtf8 = download.body;
    expect(gedcomUtf8).toContain("1 _TREEMICH_PERSON_ID");
    expect(gedcomUtf8).toContain("1 PEDI adopted");

    const importCreate = await app.inject({
      method: "POST",
      url: "/import/gedcom/jobs",
      headers: { cookie: authCookie(targetToken) },
      payload: {
        fileName: "phase-b-roundtrip.ged",
        gedcomUtf8,
        indiMatches: {},
        importOptions: { unmatchedIndiPolicy: "CREATE" }
      }
    });
    expect(importCreate.statusCode).toBe(200);
    const importJobId = importCreate.json<{ id: string }>().id;
    const importJob = await pollJob<ImportJobStatus>(() =>
      app!.inject({
        method: "GET",
        url: `/import/gedcom/jobs/${importJobId}`,
        headers: { cookie: authCookie(targetToken) }
      })
    );
    expect(importJob.status).toBe("COMPLETED");
    expect(importJob.summary.created.indis).toBe(3);
    expect(
      importJob.lineLog.some((entry: { message: string }) => entry.message.includes("Created new person"))
    ).toBe(true);

    const targetSnapshot = await normalizeUserSnapshot(targetUserId);
    expect(targetSnapshot.people).toEqual([
      { givenName: "Alex", surname: "Morgan", gender: "FEMALE" },
      { givenName: "Casey", surname: "Taylor", gender: "UNKNOWN" },
      { givenName: "Pat", surname: "Taylor", gender: "MALE" }
    ]);
    expect(targetSnapshot.alternateNames).toContainEqual({
      givenName: "Lex",
      surname: "Morgan",
      type: "AKA",
      isPrimary: false
    });
    expect(targetSnapshot.families).toEqual([
      {
        parents: ["Alex Morgan", "Pat Taylor"],
        children: [{ name: "Casey Taylor", pedigree: "ADOPTED" }]
      }
    ]);
    expect(targetSnapshot.lifeEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "BIRTH", dateQualifier: "ABOUT", year: 2010, month: 5 }),
        expect.objectContaining({
          eventType: "CUSTOM",
          customLabel: "Family Reunion",
          dateQualifier: "BETWEEN",
          year: 2015,
          endYear: 2016
        }),
        expect.objectContaining({ eventType: "MARRIAGE", year: 2009, month: 8, day: 14 })
      ])
    );
    expect(targetSnapshot.repositories).toEqual([
      { name: "County Archive", url: "https://archive.example.test" }
    ]);
    expect(targetSnapshot.sources).toEqual([
      { title: "Taylor Family Register", url: "https://source.example.test/register" }
    ]);
    expect(targetSnapshot.mediaObjects).toEqual([
      { storageUrl: "https://media.example.test/family.jpg", mimeType: "image/jpeg", title: "Family photo" }
    ]);
    expect(targetSnapshot.mediaLinks).toEqual([{ targetType: "LIFE_EVENT" }, { targetType: "SOURCE" }]);

    const otherUserVisibility = await app.inject({
      method: "GET",
      url: `/import/gedcom/jobs/${importJobId}`,
      headers: { cookie: authCookie(sourceToken) }
    });
    expect(otherUserVisibility.statusCode).toBe(404);
  });
});
