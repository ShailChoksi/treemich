import type { Prisma } from "@prisma/client";
import type { CreateLifeEventBody } from "@treemich/shared";
import { HttpValidationError } from "./errors.js";

export type CitationInput = NonNullable<CreateLifeEventBody["citations"]>[number];

/**
 * Replaces all citations for a life event: deletes existing rows, then creates from payload.
 * Call inside a transaction with the same `tx` that owns the life event row.
 */
export async function replaceLifeEventCitations(
  tx: Prisma.TransactionClient,
  userId: string,
  lifeEventId: string,
  citations: CitationInput[] | undefined
): Promise<void> {
  if (citations === undefined) {
    return;
  }
  await tx.citation.deleteMany({ where: { lifeEventId } });
  const sourceIds = [
    ...new Set(
      citations
        .map((citation) => citation.sourceId?.trim() ?? "")
        .filter((sourceId): sourceId is string => sourceId.length > 0)
    )
  ];
  const existingSources =
    sourceIds.length > 0
      ? await tx.source.findMany({
          where: {
            userId,
            id: { in: sourceIds }
          },
          select: { id: true }
        })
      : [];
  const existingSourceIds = new Set(existingSources.map((source) => source.id));
  for (const sourceId of sourceIds) {
    if (!existingSourceIds.has(sourceId)) {
      throw new HttpValidationError(`Unknown source id: ${sourceId}`);
    }
  }

  const repositoryNames = [
    ...new Set(
      citations
        .map((citation) => citation.repository?.trim() ?? "")
        .filter((repositoryName): repositoryName is string => repositoryName.length > 0)
    )
  ];
  const existingRepositories =
    repositoryNames.length > 0
      ? await tx.repository.findMany({
          where: {
            userId,
            name: { in: repositoryNames }
          },
          select: {
            id: true,
            name: true
          }
        })
      : [];
  const repositoryIdByName = new Map(
    existingRepositories.map((repository) => [repository.name, repository.id])
  );

  for (const c of citations) {
    const sid = c.sourceId?.trim();
    if (sid) {
      await tx.citation.create({
        data: {
          userId,
          sourceId: sid,
          lifeEventId,
          page: c.page?.trim() ? c.page.trim() : null,
          notes: c.notes?.trim() ? c.notes.trim() : null,
          citedAt: c.citedAt?.trim() ? c.citedAt.trim() : null
        }
      });
      continue;
    }
    const repoName = c.repository?.trim();
    let repositoryId: string | null = null;
    if (repoName) {
      let mappedRepositoryId = repositoryIdByName.get(repoName);
      if (!mappedRepositoryId) {
        const created = await tx.repository.create({
          data: { userId, name: repoName }
        });
        mappedRepositoryId = created.id;
        repositoryIdByName.set(repoName, created.id);
      }
      repositoryId = mappedRepositoryId;
    }
    const title = c.title?.trim() || "Citation";
    const source = await tx.source.create({
      data: {
        userId,
        repositoryId,
        title,
        author: null,
        publication: null,
        url: c.url?.trim() ? c.url.trim() : null,
        notes: null
      }
    });
    await tx.citation.create({
      data: {
        userId,
        sourceId: source.id,
        lifeEventId,
        page: c.page?.trim() ? c.page.trim() : null,
        notes: c.notes?.trim() ? c.notes.trim() : null,
        citedAt: c.citedAt?.trim() ? c.citedAt.trim() : null
      }
    });
  }
}
