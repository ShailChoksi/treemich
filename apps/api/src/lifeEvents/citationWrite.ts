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
  for (const c of citations) {
    const sid = c.sourceId?.trim();
    if (sid) {
      const src = await tx.source.findFirst({ where: { id: sid, userId } });
      if (!src) {
        throw new HttpValidationError(`Unknown source id: ${sid}`);
      }
      await tx.citation.create({
        data: {
          userId,
          sourceId: src.id,
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
      const existingRepo = await tx.repository.findFirst({
        where: { userId, name: repoName }
      });
      const repo =
        existingRepo ??
        (await tx.repository.create({
          data: { userId, name: repoName }
        }));
      repositoryId = repo.id;
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
