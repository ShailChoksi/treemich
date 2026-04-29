import { describe, expect, it } from "vitest";
import { resolvePersonInitials } from "./PersonNode";

describe("resolvePersonInitials", () => {
  it("uses the first letters of the resolved display name", () => {
    expect(resolvePersonInitials("Ada Lovelace")).toBe("AL");
    expect(resolvePersonInitials("  cher  ")).toBe("C");
  });

  it("falls back to a generic placeholder when no useful name exists", () => {
    expect(resolvePersonInitials("   ")).toBe("?");
  });
});
