import { describe, expect, it } from "vitest";
import { getPersonNameForGraphLayout } from "./personDisplay";
import type { Person } from "./api";

const person = (overrides: Partial<Person>): Person => ({
  id: "p1",
  name: "Immich",
  ...overrides
});

describe("getPersonNameForGraphLayout", () => {
  it("uses the trimmed display label when non-empty", () => {
    expect(getPersonNameForGraphLayout(person({ name: "n", displayName: "  Display  " }))).toBe("Display");
  });

  it("falls back to Unnamed person when the label is empty", () => {
    expect(getPersonNameForGraphLayout(person({ name: "", displayName: "   " }))).toBe("Unnamed person");
  });
});
