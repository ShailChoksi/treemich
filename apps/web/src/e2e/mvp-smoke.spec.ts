import { describe, expect, it } from "vitest";
import { RuleBasedInterpreter } from "@treemich/shared/search/interpreter";

describe("MVP smoke contract", () => {
  it("parses a supported NL query pattern", () => {
    const parser = new RuleBasedInterpreter();
    const result = parser.interpret("spouse of Anna");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.parsed.relationshipType).toBe("SPOUSE_OF");
  });
});
