import { describe, expect, it } from "vitest";
import { RuleBasedInterpreter } from "../src/search/interpreter.js";

describe("RuleBasedInterpreter", () => {
  const interpreter = new RuleBasedInterpreter();

  it("returns failure for empty query", () => {
    const r = interpreter.interpret("   ");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/empty/i);
    }
  });

  it("parses children of NAME", () => {
    const r = interpreter.interpret("children of Alice Smith");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parsed.intent).toBe("FIND_CHILDREN");
      expect(r.parsed.sourceName).toBe("Alice Smith");
      expect(r.parsed.hops).toEqual(["CHILD_OF"]);
    }
  });

  it("parses sons of NAME with gender", () => {
    const r = interpreter.interpret("sons of Bob");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parsed.intent).toBe("FIND_SONS");
      expect(r.parsed.requiredGender).toBe("MALE");
    }
  });

  it("applies male prefix override", () => {
    const r = interpreter.interpret("male cousins of Carol");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parsed.intent).toBe("FIND_COUSINS");
      expect(r.parsed.requiredGender).toBe("MALE");
      expect(r.parsed.sourceName).toBe("Carol");
    }
  });

  it("parses age suffix", () => {
    const r = interpreter.interpret("children of Dana older than 40");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parsed.sourceName).toBe("Dana");
      expect(r.parsed.ageFilter).toEqual({ kind: "minAge", years: 40 });
    }
  });

  it("returns unsupported for unrecognized phrasing", () => {
    const r = interpreter.interpret("second cousin twice removed of Eve");
    expect(r.ok).toBe(false);
  });
});
