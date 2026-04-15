import { describe, expect, it } from "vitest";
import { RuleBasedInterpreter } from "./ruleBasedInterpreter.js";

describe("RuleBasedInterpreter", () => {
  const interpreter = new RuleBasedInterpreter();

  it("parses son query", () => {
    const result = interpreter.interpret("son of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.parsed.intent).toBe("FIND_SONS");
    expect(result.parsed.requiredGender).toBe("MALE");
    expect(result.parsed.sourceName).toBe("Mike");
  });

  it("parses children query", () => {
    const result = interpreter.interpret("children of Maria");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.parsed.intent).toBe("FIND_CHILDREN");
    expect(result.parsed.relationshipType).toBe("CHILD_OF");
  });

  it("returns unsupported for unknown pattern", () => {
    const result = interpreter.interpret("friends of Mike");
    expect(result.ok).toBe(false);
  });
});
