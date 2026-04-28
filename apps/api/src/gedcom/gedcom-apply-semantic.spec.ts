import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServices } from "../services.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const mocks = vi.hoisted(() => ({
  gedcomImportJobUpdateMany: vi.fn(),
  gedcomImportJobFindUnique: vi.fn(),
  gedcomImportJobUpdate: vi.fn(),
  personProfileFindFirst: vi.fn(),
  personProfileFindUnique: vi.fn(),
  familyFindFirst: vi.fn(),
  familyUpdate: vi.fn(),
  relationshipFindFirst: vi.fn()
}));

vi.mock("../config/env.js", () => ({
  env: { TREEMICH_GEDCOM_JOB_STALE_AFTER_MS: 60_000 },
  maxGedcomImportLines: () => 250_000,
  maxGedcomMediaFileBytes: () => 50_000_000
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    gedcomImportJob: {
      updateMany: mocks.gedcomImportJobUpdateMany,
      findUnique: mocks.gedcomImportJobFindUnique,
      update: mocks.gedcomImportJobUpdate
    },
    personProfile: {
      findFirst: mocks.personProfileFindFirst,
      findUnique: mocks.personProfileFindUnique,
      update: vi.fn()
    },
    family: {
      findFirst: mocks.familyFindFirst,
      update: mocks.familyUpdate
    },
    relationship: {
      findFirst: mocks.relationshipFindFirst
    }
  }
}));

describe("GEDCOM export/import semantic apply coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dry-runs a Gramps-style fixture through the apply pipeline and reports semantic entity counts", async () => {
    const gedcomUtf8 = readFileSync(join(__dirname, "fixtures", "gramps-style-phase5.ged"), "utf8");
    mocks.gedcomImportJobUpdateMany.mockResolvedValueOnce({ count: 1 });
    mocks.gedcomImportJobFindUnique.mockResolvedValueOnce({
      id: "job-1",
      userId: "user-1",
      status: "PENDING",
      gedcomUtf8,
      indiMatches: {},
      importOptions: { dryRun: true, unmatchedIndiPolicy: "MATCH_ONLY" },
      lineLog: []
    });
    mocks.familyFindFirst.mockResolvedValue(null);
    mocks.relationshipFindFirst.mockResolvedValue(null);
    const profileByImmichId = (immichId: string) => ({
      id: immichId === "immich-jose" ? "profile-jose" : "profile-ana",
      userId: "user-1",
      immichPersonId: immichId,
      externalIds: {}
    });
    mocks.personProfileFindFirst.mockImplementation(
      async ({ where }: { where: { OR?: Array<{ immichPersonId?: string }>; id?: string } }) => {
        // First call pattern: buildIndiPersonIdMap uses OR: [{id}, {immichPersonId}]
        const immichId = where.OR?.find((c) => c.immichPersonId != null)?.immichPersonId;
        if (immichId) return profileByImmichId(immichId);
        // Second call pattern: INDI loop resolves by canonical id
        if (where.id === "profile-jose") return profileByImmichId("immich-jose");
        if (where.id === "profile-ana") return profileByImmichId("immich-ana");
        return null;
      }
    );

    const services = {
      evidenceService: {
        createRepository: vi.fn(),
        createSource: vi.fn(),
        createMediaObject: vi.fn(),
        createMediaLink: vi.fn()
      },
      personService: {
        update: vi.fn().mockResolvedValue({ id: "profile-jose" })
      },
      lifeEventService: {
        createPersonLifeEvent: vi.fn(),
        createRelationshipLifeEvent: vi.fn(),
        createFamilyLifeEvent: vi.fn()
      },
      personNameService: {
        create: vi.fn()
      },
      familyService: {
        createFamily: vi.fn()
      }
    } as unknown as AppServices;

    const { processGedcomImportJob } = await import("./importRunner.js");
    await processGedcomImportJob("job-1", services);

    const completed = mocks.gedcomImportJobUpdate.mock.calls.at(-1)?.[0]?.data;
    expect(completed).toMatchObject({ status: "COMPLETED" });
    expect(completed.summary).toMatchObject({
      repositoriesCreated: 1,
      sourcesCreated: 1,
      mediaObjectsCreated: 1,
      mediaLinksCreated: 1,
      familiesCreated: 1,
      profilesUpdated: 2,
      personLifeEventsCreated: 1,
      dryRunDiff: {
        creates: expect.objectContaining({
          repositories: 1,
          sources: 1,
          mediaObjects: 1,
          families: 1,
          personLifeEvents: 1
        }),
        updates: expect.objectContaining({ profiles: 2 })
      }
    });
  });

  it("reuses and stamps an existing same-shape family when the GEDCOM FAM xref changed", async () => {
    const gedcomUtf8 = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Pat /Parent/
1 _TREEMICH_IMMICH_PERSON_ID parent-1
0 @I2@ INDI
1 NAME Kit /Child/
1 _TREEMICH_IMMICH_PERSON_ID child-1
0 @F99@ FAM
1 HUSB @I1@
1 CHIL @I2@
0 TRLR
`;
    mocks.gedcomImportJobUpdateMany.mockResolvedValueOnce({ count: 1 });
    mocks.gedcomImportJobFindUnique.mockResolvedValueOnce({
      id: "job-2",
      userId: "user-1",
      status: "PENDING",
      gedcomUtf8,
      indiMatches: {},
      importOptions: { unmatchedIndiPolicy: "MATCH_ONLY" },
      lineLog: []
    });
    mocks.familyFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "family-existing",
      parent1PersonId: "profile-parent-1",
      parent2PersonId: null,
      externalIds: {},
      children: [{ childPersonId: "profile-child-1" }]
    });
    mocks.familyUpdate.mockResolvedValueOnce({});
    mocks.relationshipFindFirst.mockResolvedValue(null);
    mocks.personProfileFindFirst.mockImplementation(
      async ({ where }: { where: { OR?: Array<{ immichPersonId?: string }>; id?: string } }) => {
        const immichId = where.OR?.find((c) => c.immichPersonId != null)?.immichPersonId;
        if (!immichId) return null;
        return {
          id: `profile-${immichId}`,
          userId: "user-1",
          immichPersonId: immichId,
          externalIds: {}
        };
      }
    );

    const createFamily = vi.fn();
    const services = {
      evidenceService: {
        createRepository: vi.fn(),
        createSource: vi.fn(),
        createMediaObject: vi.fn(),
        createMediaLink: vi.fn()
      },
      personService: {
        update: vi.fn().mockResolvedValue({ id: "profile-parent-1" })
      },
      lifeEventService: {
        createPersonLifeEvent: vi.fn(),
        createRelationshipLifeEvent: vi.fn(),
        createFamilyLifeEvent: vi.fn()
      },
      personNameService: {
        create: vi.fn()
      },
      familyService: {
        createFamily
      }
    } as unknown as AppServices;

    const { processGedcomImportJob } = await import("./importRunner.js");
    await processGedcomImportJob("job-2", services);

    expect(createFamily).not.toHaveBeenCalled();
    expect(mocks.familyUpdate).toHaveBeenCalledWith({
      where: { id: "family-existing" },
      data: { externalIds: { gedcomFam: "F99" } }
    });
    const completed = mocks.gedcomImportJobUpdate.mock.calls.at(-1)?.[0]?.data;
    expect(completed.summary).toMatchObject({ familiesReused: 1, familiesCreated: 0 });
  });

  it("keeps unmatched INDI rows match-only and records an explicit skip", async () => {
    mocks.gedcomImportJobUpdateMany.mockResolvedValueOnce({ count: 1 });
    mocks.gedcomImportJobFindUnique.mockResolvedValueOnce({
      id: "job-3",
      userId: "user-1",
      status: "PENDING",
      gedcomUtf8: "0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Unmatched /Person/\n0 TRLR\n",
      indiMatches: {},
      importOptions: { dryRun: true, allowPartialMatches: true, unmatchedIndiPolicy: "MATCH_ONLY" },
      lineLog: []
    });

    const services = {
      evidenceService: {
        createRepository: vi.fn(),
        createSource: vi.fn(),
        createMediaObject: vi.fn(),
        createMediaLink: vi.fn()
      },
      relationshipService: { upsertProfile: vi.fn() },
      lifeEventService: {
        createPersonLifeEvent: vi.fn(),
        createRelationshipLifeEvent: vi.fn(),
        createFamilyLifeEvent: vi.fn()
      },
      personNameService: { create: vi.fn() },
      familyService: { createFamily: vi.fn() }
    } as unknown as AppServices;

    const { processGedcomImportJob } = await import("./importRunner.js");
    await processGedcomImportJob("job-3", services);

    const completed = mocks.gedcomImportJobUpdate.mock.calls.at(-1)?.[0]?.data;
    expect(completed.summary).toMatchObject({ indisSkipped: 1 });
    expect(completed.lineLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("match-only")
        })
      ])
    );
    expect(services.relationshipService.upsertProfile).not.toHaveBeenCalled();
  });

  it("creates new people for unmatched INDI rows when unmatchedIndiPolicy is CREATE", async () => {
    const gedcomUtf8 = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Alice /Smith/
1 SEX F
0 @I2@ INDI
1 NAME Bob /Jones/
1 SEX M
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I1@
0 TRLR
`;
    mocks.gedcomImportJobUpdateMany.mockResolvedValueOnce({ count: 1 });
    mocks.gedcomImportJobFindUnique.mockResolvedValueOnce({
      id: "job-create",
      userId: "user-1",
      status: "PENDING",
      gedcomUtf8,
      indiMatches: {},
      importOptions: { dryRun: true, unmatchedIndiPolicy: "CREATE" },
      lineLog: []
    });

    const createPerson = vi
      .fn()
      .mockImplementation(async (_userId: string, body: { givenName?: string | null }) => ({
        id: `new-person-${body.givenName ?? "unknown"}`,
        name: body.givenName ?? "Unknown",
        profile: null
      }));

    const services = {
      evidenceService: {
        createRepository: vi.fn(),
        createSource: vi.fn(),
        createMediaObject: vi.fn(),
        createMediaLink: vi.fn()
      },
      personService: { update: vi.fn(), create: createPerson },
      lifeEventService: {
        createPersonLifeEvent: vi.fn(),
        createRelationshipLifeEvent: vi.fn(),
        createFamilyLifeEvent: vi.fn()
      },
      personNameService: { create: vi.fn() },
      familyService: { createFamily: vi.fn() }
    } as unknown as AppServices;

    const { processGedcomImportJob } = await import("./importRunner.js");
    await processGedcomImportJob("job-create", services);

    const completed = mocks.gedcomImportJobUpdate.mock.calls.at(-1)?.[0]?.data;
    expect(completed).toMatchObject({ status: "COMPLETED" });
    // Both unmatched INDIs were created in the preliminary pass (dry-run increments count)
    expect(completed.summary).toMatchObject({ indisCreated: 2, indisSkipped: 0 });
    // Family referencing both people should be created
    expect(completed.summary).toMatchObject({ familiesCreated: 1 });
    // Dry-run: personService.create is NOT called (uses placeholder ids)
    expect(createPerson).not.toHaveBeenCalled();
  });
});
