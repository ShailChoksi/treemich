import { describe, expect, it } from "vitest";
import { fingerprintFinding } from "./validationFindingService.js";

describe("fingerprintFinding", () => {
  it("uses stable issue identity and excludes message text", () => {
    const first = fingerprintFinding({
      code: "parent_birth_after_child",
      severity: "error",
      message: "Old wording",
      personId: "parent",
      relatedPersonId: "child",
      relationshipId: "rel"
    });
    const second = fingerprintFinding({
      code: "parent_birth_after_child",
      severity: "error",
      message: "Improved wording",
      personId: "parent",
      relatedPersonId: "child",
      relationshipId: "rel"
    });

    expect(first).toBe(second);
    expect(first).toBe("parent_birth_after_child|parent|rel|child|");
  });

  it("includes family id when present", () => {
    expect(
      fingerprintFinding({
        code: "family_issue",
        severity: "warning",
        message: "Family issue",
        familyId: "fam1"
      })
    ).toBe("family_issue||||fam1");
  });
});
