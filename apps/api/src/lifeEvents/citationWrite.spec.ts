import { describe, expect, it, vi } from "vitest";
import { HttpValidationError } from "./errors.js";
import { replaceLifeEventCitations } from "./citationWrite.js";

const buildTx = () => {
  const citationDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const citationCreate = vi.fn().mockResolvedValue({});
  const sourceFindFirst = vi.fn();
  const repositoryFindFirst = vi.fn();
  const repositoryCreate = vi.fn();
  const sourceCreate = vi.fn();

  return {
    citation: { deleteMany: citationDeleteMany, create: citationCreate },
    source: { findFirst: sourceFindFirst, create: sourceCreate },
    repository: { findFirst: repositoryFindFirst, create: repositoryCreate },
    _mocks: {
      citationDeleteMany,
      citationCreate,
      sourceFindFirst,
      repositoryFindFirst,
      repositoryCreate,
      sourceCreate
    }
  };
};

describe("replaceLifeEventCitations", () => {
  it("no-ops when citations is undefined", async () => {
    const tx = buildTx();
    await replaceLifeEventCitations(tx as never, "user-1", "le-1", undefined);
    expect(tx._mocks.citationDeleteMany).not.toHaveBeenCalled();
  });

  it("creates citation rows for an existing sourceId", async () => {
    const tx = buildTx();
    tx.source.findFirst.mockResolvedValueOnce({ id: "src-99", userId: "user-1" });

    await replaceLifeEventCitations(tx as never, "user-1", "le-1", [
      {
        sourceId: "src-99",
        title: null,
        repository: null,
        url: null,
        page: "12",
        notes: "see tab",
        citedAt: "2020"
      }
    ]);

    expect(tx._mocks.citationDeleteMany).toHaveBeenCalledWith({ where: { lifeEventId: "le-1" } });
    expect(tx._mocks.citationCreate).toHaveBeenCalledTimes(1);
    expect(tx._mocks.citationCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        sourceId: "src-99",
        lifeEventId: "le-1",
        page: "12",
        notes: "see tab",
        citedAt: "2020"
      }
    });
    expect(tx._mocks.sourceCreate).not.toHaveBeenCalled();
  });

  it("throws when sourceId is unknown for this user", async () => {
    const tx = buildTx();
    tx.source.findFirst.mockResolvedValueOnce(null);

    await expect(
      replaceLifeEventCitations(tx as never, "user-1", "le-1", [
        { sourceId: "nope", title: null, repository: null, url: null, page: null, notes: null, citedAt: null }
      ])
    ).rejects.toBeInstanceOf(HttpValidationError);

    expect(tx._mocks.citationCreate).not.toHaveBeenCalled();
  });

  it("creates repository+source+citation for inline citation", async () => {
    const tx = buildTx();
    tx.repository.findFirst.mockResolvedValueOnce(null);
    tx.repository.create.mockResolvedValueOnce({ id: "repo-1", userId: "user-1", name: "NARA" });
    tx.source.create.mockResolvedValueOnce({ id: "src-new", userId: "user-1" });

    await replaceLifeEventCitations(tx as never, "user-1", "le-2", [
      {
        sourceId: null,
        title: "1920 Census",
        repository: "NARA",
        url: "https://nara.gov",
        page: "3",
        notes: null,
        citedAt: null
      }
    ]);

    expect(tx.repository.create).toHaveBeenCalledWith({
      data: { userId: "user-1", name: "NARA" }
    });
    expect(tx.source.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        repositoryId: "repo-1",
        title: "1920 Census",
        author: null,
        publication: null,
        url: "https://nara.gov",
        notes: null
      }
    });
    expect(tx._mocks.citationCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        sourceId: "src-new",
        lifeEventId: "le-2",
        page: "3",
        notes: null,
        citedAt: null
      }
    });
  });

  it("reuses existing repository by name when present", async () => {
    const tx = buildTx();
    tx.repository.findFirst.mockResolvedValueOnce({ id: "repo-existing", name: "NARA" });
    tx.source.create.mockResolvedValueOnce({ id: "src-2" });

    await replaceLifeEventCitations(tx as never, "user-1", "le-3", [
      {
        sourceId: null,
        title: "Doc",
        repository: "NARA",
        url: null,
        page: null,
        notes: null,
        citedAt: null
      }
    ]);

    expect(tx.repository.create).not.toHaveBeenCalled();
    expect(tx.source.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ repositoryId: "repo-existing" })
      })
    );
  });
});
