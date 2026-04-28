import { describe, expect, it } from "vitest";
import {
  createResearchTaskBodySchema,
  patchResearchTaskBodySchema,
  researchTaskQuerySchema,
  researchTaskStatusSchema
} from "../src/researchTasks.js";

describe("researchTaskStatusSchema", () => {
  it("accepts known statuses", () => {
    expect(researchTaskStatusSchema.parse("IN_PROGRESS")).toBe("IN_PROGRESS");
    expect(() => researchTaskStatusSchema.parse("BLOCKED")).toThrow();
  });
});

describe("createResearchTaskBodySchema", () => {
  it("trims title and defaults status to OPEN", () => {
    const body = createResearchTaskBodySchema.parse({ title: "  Verify census  " });
    expect(body).toEqual({ title: "Verify census", status: "OPEN" });
  });

  it("rejects empty title after trim", () => {
    expect(() => createResearchTaskBodySchema.parse({ title: "   " })).toThrow();
  });

  it("accepts optional person and due date", () => {
    expect(
      createResearchTaskBodySchema.parse({
        title: "Task",
        personId: "person-1",
        dueDate: "2026-12-31",
        notes: "Details here"
      })
    ).toMatchObject({ personId: "person-1", dueDate: "2026-12-31" });
  });
});

describe("patchResearchTaskBodySchema", () => {
  it("allows updating only status", () => {
    expect(patchResearchTaskBodySchema.parse({ status: "DONE" })).toEqual({ status: "DONE" });
  });
});

describe("researchTaskQuerySchema", () => {
  it("parses optional personId filter", () => {
    expect(researchTaskQuerySchema.parse({})).toEqual({});
    expect(researchTaskQuerySchema.parse({ personId: "abc" })).toEqual({ personId: "abc" });
  });

  it("rejects empty personId after trim", () => {
    expect(() => researchTaskQuerySchema.parse({ personId: "  " })).toThrow();
  });
});
