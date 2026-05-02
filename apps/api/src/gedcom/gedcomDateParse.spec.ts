import { describe, expect, it } from "vitest";
import { formatGedcomBirthDateDisplay, parseGedcomDate } from "./gedcomDateParse.js";

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

  it("parses partial month-year dates", () => {
    const p = parseGedcomDate("MAR 2010");
    expect(p).toMatchObject({
      dateQualifier: "EXACT",
      year: 2010,
      month: 3,
      day: null
    });
  });

  it("parses before and after qualified dates", () => {
    expect(parseGedcomDate("BEF 1980")).toMatchObject({
      dateQualifier: "BEFORE",
      year: 1980
    });
    expect(parseGedcomDate("AFT 31 DEC 1999")).toMatchObject({
      dateQualifier: "AFTER",
      year: 1999,
      month: 12,
      day: 31
    });
  });
});

describe("formatGedcomBirthDateDisplay", () => {
  it("formats exact and qualified dates", () => {
    expect(formatGedcomBirthDateDisplay("15 JAN 1990")).toBe("15 Jan 1990");
    expect(formatGedcomBirthDateDisplay("ABT 1900")).toBe("abt 1900");
    expect(formatGedcomBirthDateDisplay("BEF 1980")).toBe("bef 1980");
  });

  it("formats between dates", () => {
    expect(formatGedcomBirthDateDisplay("BET 1900 AND 1910")).toBe("bet 1900 and 1910");
  });
});
