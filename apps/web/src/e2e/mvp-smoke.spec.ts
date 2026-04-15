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
    expect(result.parsed.hops).toEqual(["SPOUSE_OF"]);
  });

  it("parses a multi-hop cousin query", () => {
    const parser = new RuleBasedInterpreter();
    const result = parser.interpret("cousins of Anna");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.parsed.hops).toHaveLength(3);
    expect(result.parsed.hops).toEqual(["PARENT_OF", "SIBLING_OF", "CHILD_OF"]);
  });
});
