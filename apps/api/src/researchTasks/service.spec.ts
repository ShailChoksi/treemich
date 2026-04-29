import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchTaskService } from "./service.js";

const mocks = vi.hoisted(() => ({
  researchTaskFindMany: vi.fn(),
  researchTaskCreate: vi.fn(),
  researchTaskFindFirst: vi.fn(),
  researchTaskUpdate: vi.fn(),
  researchTaskDeleteMany: vi.fn()
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    researchTask: {
      findMany: mocks.researchTaskFindMany,
      create: mocks.researchTaskCreate,
      findFirst: mocks.researchTaskFindFirst,
      update: mocks.researchTaskUpdate,
      deleteMany: mocks.researchTaskDeleteMany
    }
  }
}));

describe("ResearchTaskService", () => {
  const personService = {
    resolvePersonId: vi.fn()
  };
  const service = new ResearchTaskService(personService as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves Treemich person ids before listing scoped tasks", async () => {
    personService.resolvePersonId.mockResolvedValue("person-profile-1");
    mocks.researchTaskFindMany.mockResolvedValue([]);

    await service.list("user-1", "person-profile-1");

    expect(personService.resolvePersonId).toHaveBeenCalledWith("user-1", "person-profile-1");
    expect(mocks.researchTaskFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        OR: [{ personId: "person-profile-1" }, { personId: null }]
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }]
    });
  });

  it("stores canonical Treemich person ids when creating tasks", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    personService.resolvePersonId.mockResolvedValue("person-profile-1");
    mocks.researchTaskCreate.mockResolvedValue({
      id: "task-1",
      title: "Find record",
      status: "OPEN",
      personId: "person-profile-1",
      dueDate: null,
      notes: null,
      createdAt: now,
      updatedAt: now
    });

    const result = await service.create("user-1", {
      title: "Find record",
      status: "OPEN",
      personId: "person-profile-1"
    });

    expect(mocks.researchTaskCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        title: "Find record",
        status: "OPEN",
        personId: "person-profile-1",
        dueDate: null,
        notes: null
      }
    });
    expect(result.personId).toBe("person-profile-1");
  });

  it("resolves updated person ids and allows clearing assignment", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    mocks.researchTaskFindFirst.mockResolvedValue({ id: "task-1", userId: "user-1" });
    personService.resolvePersonId.mockResolvedValue("person-profile-2");
    mocks.researchTaskUpdate.mockResolvedValue({
      id: "task-1",
      title: "Find record",
      status: "OPEN",
      personId: "person-profile-2",
      dueDate: null,
      notes: null,
      createdAt: now,
      updatedAt: now
    });

    await service.update("user-1", "task-1", { personId: "person-profile-2" });

    expect(mocks.researchTaskUpdate).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { personId: "person-profile-2" }
    });

    mocks.researchTaskUpdate.mockResolvedValueOnce({
      id: "task-1",
      title: "Find record",
      status: "OPEN",
      personId: null,
      dueDate: null,
      notes: null,
      createdAt: now,
      updatedAt: now
    });

    await service.update("user-1", "task-1", { personId: null });

    expect(mocks.researchTaskUpdate).toHaveBeenLastCalledWith({
      where: { id: "task-1" },
      data: { personId: null }
    });
  });
});
