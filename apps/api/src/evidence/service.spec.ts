import { beforeEach, describe, expect, it, vi } from "vitest";

const repositoryFindManyMock = vi.fn();
const repositoryFindFirstMock = vi.fn();
const repositoryCreateMock = vi.fn();
const repositoryUpdateMock = vi.fn();
const repositoryDeleteManyMock = vi.fn();
const sourceFindManyMock = vi.fn();
const sourceFindFirstMock = vi.fn();
const sourceCreateMock = vi.fn();
const sourceUpdateMock = vi.fn();
const sourceDeleteMock = vi.fn();
const mediaObjectFindManyMock = vi.fn();
const mediaObjectFindFirstMock = vi.fn();
const mediaObjectCreateMock = vi.fn();
const mediaObjectUpdateMock = vi.fn();
const mediaObjectDeleteManyMock = vi.fn();
const mediaLinkFindManyMock = vi.fn();
const mediaLinkFindFirstMock = vi.fn();
const mediaLinkCreateMock = vi.fn();
const mediaLinkDeleteManyMock = vi.fn();
const personProfileFindFirstMock = vi.fn();
const lifeEventFindFirstMock = vi.fn();
const familyFindFirstMock = vi.fn();
const citationUpdateManyMock = vi.fn();
const prismaTransactionMock = vi.fn();

vi.mock("../db/client.js", () => ({
  prisma: {
    repository: {
      findMany: repositoryFindManyMock,
      findFirst: repositoryFindFirstMock,
      create: repositoryCreateMock,
      update: repositoryUpdateMock,
      deleteMany: repositoryDeleteManyMock
    },
    source: {
      findMany: sourceFindManyMock,
      findFirst: sourceFindFirstMock,
      create: sourceCreateMock,
      update: sourceUpdateMock,
      delete: sourceDeleteMock
    },
    mediaObject: {
      findMany: mediaObjectFindManyMock,
      findFirst: mediaObjectFindFirstMock,
      create: mediaObjectCreateMock,
      update: mediaObjectUpdateMock,
      deleteMany: mediaObjectDeleteManyMock
    },
    mediaLink: {
      findMany: mediaLinkFindManyMock,
      findFirst: mediaLinkFindFirstMock,
      create: mediaLinkCreateMock,
      deleteMany: mediaLinkDeleteManyMock
    },
    personProfile: { findFirst: personProfileFindFirstMock },
    lifeEvent: { findFirst: lifeEventFindFirstMock },
    family: { findFirst: familyFindFirstMock },
    citation: {
      updateMany: citationUpdateManyMock
    },
    $transaction: prismaTransactionMock
  }
}));

describe("EvidenceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({
        citation: { updateMany: citationUpdateManyMock },
        source: { delete: sourceDeleteMock }
      });
    });
  });

  it("lists repositories ordered by name", async () => {
    const createdAt = new Date("2024-01-01T00:00:00.000Z");
    repositoryFindManyMock.mockResolvedValueOnce([
      {
        id: "r1",
        userId: "u1",
        name: "Z Archive",
        addressLine1: null,
        url: null,
        notes: null,
        createdAt,
        updatedAt: createdAt
      }
    ]);

    const { EvidenceService } = await import("./service.js");
    const svc = new EvidenceService();
    const rows = await svc.listRepositories("u1");

    expect(repositoryFindManyMock).toHaveBeenCalledWith({
      where: { userId: "u1" },
      orderBy: { name: "asc" }
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("r1");
    expect(rows[0]?.name).toBe("Z Archive");
    expect(rows[0]?.createdAt).toMatch(/2024-01-01/);
  });

  it("creates a repository", async () => {
    const createdAt = new Date("2024-02-01T00:00:00.000Z");
    repositoryCreateMock.mockResolvedValueOnce({
      id: "r-new",
      userId: "u1",
      name: "State Library",
      addressLine1: "1 Main",
      url: "https://example.org",
      notes: null,
      createdAt,
      updatedAt: createdAt
    });

    const { EvidenceService } = await import("./service.js");
    const svc = new EvidenceService();
    const row = await svc.createRepository("u1", {
      name: "State Library",
      addressLine1: "1 Main",
      url: "https://example.org",
      notes: null
    });

    expect(repositoryCreateMock).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        name: "State Library",
        addressLine1: "1 Main",
        url: "https://example.org",
        notes: null
      }
    });
    expect(row.id).toBe("r-new");
  });

  it("lists sources with optional title filter", async () => {
    const createdAt = new Date("2024-03-01T00:00:00.000Z");
    sourceFindManyMock.mockResolvedValueOnce([
      {
        id: "s1",
        userId: "u1",
        repositoryId: null,
        title: "Census 1920",
        author: null,
        publication: null,
        url: null,
        notes: null,
        createdAt,
        updatedAt: createdAt,
        repository: null
      }
    ]);

    const { EvidenceService } = await import("./service.js");
    const svc = new EvidenceService();
    const rows = await svc.listSources("u1", "census");

    expect(sourceFindManyMock).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        title: { contains: "census", mode: "insensitive" }
      },
      orderBy: [{ title: "asc" }, { id: "asc" }],
      include: { repository: true },
      take: 200
    });
    expect(rows[0]?.title).toBe("Census 1920");
  });

  it("mergeSources rejects merging a source into itself", async () => {
    const { EvidenceService } = await import("./service.js");
    const svc = new EvidenceService();
    await expect(svc.mergeSources("u1", "s1", "s1")).rejects.toMatchObject({ statusCode: 400 });
    expect(sourceFindFirstMock).not.toHaveBeenCalled();
  });

  it("mergeSources returns 404 when the from source is missing", async () => {
    sourceFindFirstMock.mockResolvedValueOnce(null);
    const { EvidenceService } = await import("./service.js");
    const svc = new EvidenceService();
    await expect(svc.mergeSources("u1", "missing", "s2")).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaTransactionMock).not.toHaveBeenCalled();
  });

  it("mergeSources returns 404 when the into source is missing", async () => {
    sourceFindFirstMock
      .mockResolvedValueOnce({ id: "from", userId: "u1", title: "A" })
      .mockResolvedValueOnce(null);
    const { EvidenceService } = await import("./service.js");
    const svc = new EvidenceService();
    await expect(svc.mergeSources("u1", "from", "missing")).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaTransactionMock).not.toHaveBeenCalled();
  });

  it("mergeSources reassigns citations and deletes the duplicate source", async () => {
    sourceFindFirstMock
      .mockResolvedValueOnce({ id: "from", userId: "u1", title: "A" })
      .mockResolvedValueOnce({ id: "into", userId: "u1", title: "B" });
    citationUpdateManyMock.mockResolvedValueOnce({ count: 2 });
    sourceDeleteMock.mockResolvedValueOnce({ id: "from" });

    const { EvidenceService } = await import("./service.js");
    const svc = new EvidenceService();
    await svc.mergeSources("u1", "from", "into");

    expect(citationUpdateManyMock).toHaveBeenCalledWith({
      where: { userId: "u1", sourceId: "from" },
      data: { sourceId: "into" }
    });
    expect(sourceDeleteMock).toHaveBeenCalledWith({ where: { id: "from" } });
  });

  it("rejects createSource when repositoryId does not belong to user", async () => {
    repositoryFindFirstMock.mockResolvedValueOnce(null);

    const { EvidenceService } = await import("./service.js");
    const svc = new EvidenceService();

    await expect(
      svc.createSource("u1", {
        repositoryId: "missing-repo",
        title: "Book",
        author: null,
        publication: null,
        url: null,
        notes: null
      })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(sourceCreateMock).not.toHaveBeenCalled();
  });

  it("maps deleteSource P2003 to 409", async () => {
    sourceFindFirstMock.mockResolvedValueOnce({ id: "s1", userId: "u1" });
    const prismaError = Object.assign(new Error("FK"), { code: "P2003" });
    sourceDeleteMock.mockRejectedValueOnce(prismaError);

    const { EvidenceService } = await import("./service.js");
    const svc = new EvidenceService();

    await expect(svc.deleteSource("u1", "s1")).rejects.toMatchObject({
      statusCode: 409,
      message: "Source is still cited by one or more life events"
    });
  });

  it("creates media object and media link", async () => {
    const createdAt = new Date("2024-04-01T00:00:00.000Z");
    mediaObjectCreateMock.mockResolvedValueOnce({
      id: "m1",
      userId: "u1",
      storageUrl: "https://cdn.example/doc.pdf",
      mimeType: "application/pdf",
      checksum: null,
      immichAssetId: null,
      title: "Will",
      createdAt,
      updatedAt: createdAt
    });
    mediaObjectFindFirstMock.mockResolvedValueOnce({
      id: "m1",
      userId: "u1",
      storageUrl: "https://cdn.example/doc.pdf",
      mimeType: "application/pdf",
      checksum: null,
      immichAssetId: null,
      title: "Will",
      createdAt,
      updatedAt: createdAt
    });
    sourceFindFirstMock.mockResolvedValueOnce({ id: "s9", userId: "u1" });
    mediaLinkFindFirstMock.mockResolvedValueOnce(null);
    mediaLinkCreateMock.mockResolvedValueOnce({
      id: "lnk1",
      userId: "u1",
      mediaObjectId: "m1",
      targetType: "SOURCE",
      targetId: "s9",
      notes: null,
      createdAt
    });

    const { EvidenceService } = await import("./service.js");
    const svc = new EvidenceService();
    const media = await svc.createMediaObject("u1", {
      storageUrl: "https://cdn.example/doc.pdf",
      mimeType: "application/pdf",
      checksum: null,
      immichAssetId: null,
      title: "Will"
    });
    expect(media.id).toBe("m1");

    const link = await svc.createMediaLink("u1", "m1", {
      targetType: "SOURCE",
      targetId: "s9",
      notes: null
    });
    expect(link.targetType).toBe("SOURCE");
    expect(mediaLinkCreateMock).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        mediaObjectId: "m1",
        targetType: "SOURCE",
        targetId: "s9",
        notes: null
      }
    });
  });

  it("creates FAMILY media links only for owned families", async () => {
    const createdAt = new Date("2024-04-02T00:00:00.000Z");
    mediaObjectFindFirstMock.mockResolvedValueOnce({ id: "m1", userId: "u1" });
    familyFindFirstMock.mockResolvedValueOnce({ id: "fam1", userId: "u1" });
    mediaLinkFindFirstMock.mockResolvedValueOnce(null);
    mediaLinkCreateMock.mockResolvedValueOnce({
      id: "lnk-family",
      userId: "u1",
      mediaObjectId: "m1",
      targetType: "FAMILY",
      targetId: "fam1",
      notes: null,
      createdAt
    });

    const { EvidenceService } = await import("./service.js");
    const svc = new EvidenceService();
    const link = await svc.createMediaLink("u1", "m1", {
      targetType: "FAMILY",
      targetId: "fam1",
      notes: null
    });

    expect(link.targetType).toBe("FAMILY");
    expect(familyFindFirstMock).toHaveBeenCalledWith({
      where: { id: "fam1", userId: "u1" },
      select: { id: true }
    });
  });

  it("rejects media links to missing targets", async () => {
    mediaObjectFindFirstMock.mockResolvedValueOnce({ id: "m1", userId: "u1" });
    familyFindFirstMock.mockResolvedValueOnce(null);

    const { EvidenceService } = await import("./service.js");
    const svc = new EvidenceService();
    await expect(
      svc.createMediaLink("u1", "m1", {
        targetType: "FAMILY",
        targetId: "foreign-family",
        notes: null
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mediaLinkCreateMock).not.toHaveBeenCalled();
  });
});
