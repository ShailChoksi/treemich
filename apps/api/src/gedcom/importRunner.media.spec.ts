import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServices } from "../services.js";

const mocks = vi.hoisted(() => ({
  gedcomImportJobUpdateMany: vi.fn(),
  gedcomImportJobFindUnique: vi.fn(),
  gedcomImportJobUpdate: vi.fn(),
  personProfileFindUnique: vi.fn(),
  personProfileUpdate: vi.fn()
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
      findUnique: mocks.personProfileFindUnique,
      update: mocks.personProfileUpdate
    },
    family: {
      findFirst: vi.fn()
    },
    relationship: {
      findFirst: vi.fn()
    }
  }
}));

describe("processGedcomImportJob media import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates media objects and links top-level OBJE pointers to person profiles and life events", async () => {
    const gedcomUtf8 = `0 HEAD
1 CHAR UTF-8
0 @O1@ OBJE
1 FILE https://example.test/person.jpg
1 FORM image/jpeg
1 TITL Portrait
0 @O2@ OBJE
1 FILE https://example.test/birth.pdf
1 FORM application/pdf
1 TITL Birth record
0 @I1@ INDI
1 NAME Ann /Smith/
1 SEX F
1 OBJE @O1@
1 BIRT
2 DATE 1 JAN 1900
2 OBJE @O2@
0 TRLR
`;
    mocks.gedcomImportJobUpdateMany.mockResolvedValueOnce({ count: 1 });
    mocks.gedcomImportJobFindUnique.mockResolvedValueOnce({
      id: "job-1",
      userId: "user-1",
      status: "PENDING",
      gedcomUtf8,
      indiMatches: { "@I1@": "immich-1" },
      importOptions: {},
      lineLog: []
    });
    mocks.personProfileFindUnique.mockResolvedValueOnce({
      id: "profile-1",
      userId: "user-1",
      immichPersonId: "immich-1",
      externalIds: {}
    });
    mocks.personProfileUpdate.mockResolvedValueOnce({});

    const createMediaObject = vi
      .fn()
      .mockResolvedValueOnce({ id: "media-1" })
      .mockResolvedValueOnce({ id: "media-2" });
    const createMediaLink = vi.fn().mockResolvedValue({});
    const createPersonLifeEvent = vi.fn().mockResolvedValue({ id: "life-event-1" });

    const services = {
      evidenceService: {
        createMediaObject,
        createMediaLink
      },
      relationshipService: {
        upsertProfile: vi.fn()
      },
      lifeEventService: {
        createPersonLifeEvent
      },
      personNameService: {
        create: vi.fn()
      },
      familyService: {}
    } as unknown as AppServices;

    const { processGedcomImportJob } = await import("./importRunner.js");
    await processGedcomImportJob("job-1", services);

    expect(createMediaObject).toHaveBeenNthCalledWith(
      1,
      "user-1",
      expect.objectContaining({
        storageUrl: "https://example.test/person.jpg",
        mimeType: "image/jpeg",
        title: "Portrait"
      })
    );
    expect(createMediaObject).toHaveBeenNthCalledWith(
      2,
      "user-1",
      expect.objectContaining({
        storageUrl: "https://example.test/birth.pdf",
        mimeType: "application/pdf",
        title: "Birth record"
      })
    );
    expect(createMediaLink).toHaveBeenCalledWith("user-1", "media-1", {
      targetType: "PERSON_PROFILE",
      targetId: "profile-1"
    });
    expect(createMediaLink).toHaveBeenCalledWith("user-1", "media-2", {
      targetType: "LIFE_EVENT",
      targetId: "life-event-1"
    });
    expect(mocks.gedcomImportJobUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          summary: expect.objectContaining({
            mediaObjectsCreated: 2,
            mediaLinksCreated: 2
          })
        })
      })
    );
  });
});
