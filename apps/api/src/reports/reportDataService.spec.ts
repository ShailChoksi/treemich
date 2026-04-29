import { describe, expect, it } from "vitest";
import { isLivingPerson } from "./reportDataService.js";

describe("report redaction living heuristic", () => {
  it("treats people without death events as living", () => {
    expect(isLivingPerson({ lifeEvents: [{ eventType: "BIRTH" }] } as never)).toBe(true);
  });

  it("treats people with death events as not living", () => {
    expect(isLivingPerson({ lifeEvents: [{ eventType: "DEATH" }] } as never)).toBe(false);
  });
});
