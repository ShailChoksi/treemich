import type { CreateResearchTaskBody, PatchResearchTaskBody, ResearchTaskRecord } from "@treemich/shared";
import { prisma } from "../db/client.js";
import type { ProfileResolver } from "../people/profileResolver.js";

const toJson = (row: {
  id: string;
  title: string;
  status: "OPEN" | "IN_PROGRESS" | "DONE";
  personId: string | null;
  dueDate: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ResearchTaskRecord => ({
  id: row.id,
  title: row.title,
  status: row.status,
  personId: row.personId,
  dueDate: row.dueDate,
  notes: row.notes,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

export class ResearchTaskService {
  constructor(private readonly profileResolver: ProfileResolver = /* unused default */ null as never) {}

  async list(userId: string, personId?: string): Promise<ResearchTaskRecord[]> {
    const resolvedPersonId = personId
      ? await this.profileResolver.resolveProfile(userId, personId)
      : undefined;
    const rows = await prisma.researchTask.findMany({
      where: {
        userId,
        ...(resolvedPersonId ? { OR: [{ personId: resolvedPersonId }, { personId: null }] } : {})
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }]
    });
    return rows.map(toJson);
  }

  async create(userId: string, body: CreateResearchTaskBody): Promise<ResearchTaskRecord> {
    const personId = body.personId ? await this.profileResolver.resolveProfile(userId, body.personId) : null;
    const created = await prisma.researchTask.create({
      data: {
        userId,
        title: body.title,
        status: body.status ?? "OPEN",
        personId,
        dueDate: body.dueDate ?? null,
        notes: body.notes ?? null
      }
    });
    return toJson(created);
  }

  async update(userId: string, taskId: string, body: PatchResearchTaskBody): Promise<ResearchTaskRecord> {
    const existing = await prisma.researchTask.findFirst({
      where: { id: taskId, userId }
    });
    if (!existing) {
      const error = new Error("Research task not found");
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }
    const personId =
      body.personId !== undefined && body.personId !== null
        ? await this.profileResolver.resolveProfile(userId, body.personId)
        : body.personId;
    const updated = await prisma.researchTask.update({
      where: { id: taskId },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.personId !== undefined ? { personId } : {}),
        ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {})
      }
    });
    return toJson(updated);
  }

  async delete(userId: string, taskId: string): Promise<void> {
    const deleted = await prisma.researchTask.deleteMany({
      where: { id: taskId, userId }
    });
    if (deleted.count === 0) {
      const error = new Error("Research task not found");
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }
  }
}
