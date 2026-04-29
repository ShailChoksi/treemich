import { describe, expect, it } from "vitest";
import {
  mergePeopleBodySchema,
  patchPersonDuplicateCandidateBodySchema,
  personDuplicateListQuerySchema,
  personDuplicateReasonSchema
} from "../src/personDuplicates.js";

describe("person duplicate contracts", () => {
  it("parses duplicate list filters with numeric coercion", () => {
    expect(personDuplicateListQuerySchema.parse({ status: "PENDING", limit: "25", offset: "5" })).toEqual({
      status: "PENDING",
      limit: 25,
      offset: 5
    });
  });

  it("accepts review status updates only for pending/dismissed", () => {
    expect(patchPersonDuplicateCandidateBodySchema.parse({ status: "DISMISSED" })).toEqual({
      status: "DISMISSED"
    });
    expect(patchPersonDuplicateCandidateBodySchema.safeParse({ status: "MERGED" }).success).toBe(false);
  });

  it("requires explicit confirmation and two different people for merge", () => {
    expect(
      mergePeopleBodySchema.parse({
        canonicalPersonId: "p1",
        duplicatePersonId: "p2",
        confirm: true
      })
    ).toEqual({
      canonicalPersonId: "p1",
      duplicatePersonId: "p2",
      confirm: true
    });
    expect(
      mergePeopleBodySchema.safeParse({
        canonicalPersonId: "p1",
        duplicatePersonId: "p1",
        confirm: true
      }).success
    ).toBe(false);
    expect(
      mergePeopleBodySchema.safeParse({
        canonicalPersonId: "p1",
        duplicatePersonId: "p2",
        confirm: false
      }).success
    ).toBe(false);
  });

  it("parses weighted reason rows", () => {
    expect(
      personDuplicateReasonSchema.parse({
        code: "name",
        label: "Same full name",
        detail: "alex smith",
        weight: 45
      })
    ).toEqual({
      code: "name",
      label: "Same full name",
      detail: "alex smith",
      weight: 45
    });
  });
});
