import { describe, expect, it } from "vitest";
import { parseGedcomDate } from "./gedcomDateParse.js";

describe("parseGedcomDate", () => {
  it("parses exact day month year", () => {
    const p = parseGedcomDate("15 JAN 1990");
    expect(p?.year).toBe(1990);
    expect(p?.month).toBe(1);
    expect(p?.day).toBe(15);
    expect(p?.dateQualifier).toBe("EXACT");
  });

  it("parses ABT year", () => {
    const p = parseGedcomDate("ABT 1900");
    expect(p?.dateQualifier).toBe("ABOUT");
    expect(p?.year).toBe(1900);
  });

  it("parses BET ... AND ...", () => {
    const p = parseGedcomDate("BET 1900 AND 1910");
    expect(p?.dateQualifier).toBe("BETWEEN");
    expect(p?.year).toBe(1900);
    expect(p?.endYear).toBe(1910);
  });
});
