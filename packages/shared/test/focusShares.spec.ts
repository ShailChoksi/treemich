import { describe, expect, it } from "vitest";
import {
  buildFocusSharePublicPath,
  createFocusShareBodySchema,
  focusSharePublicPathPrefix,
  guestFocusShareGraphQuerySchema,
  patchFocusShareBodySchema,
  rotateFocusSharePasswordBodySchema,
  unlockFocusShareBodySchema
} from "../src/focusShares.js";

describe("focusShares schemas", () => {
  it("builds the shipped public path", () => {
    expect(focusSharePublicPathPrefix).toBe("/share");
    expect(buildFocusSharePublicPath("abc/def")).toBe("/share/abc%2Fdef");
  });

  it("requires password min length 8 on create and rotate", () => {
    expect(() =>
      createFocusShareBodySchema.parse({
        password: "short",
        focusAnchorPersonId: "p1",
        maxAncestorDepth: 1,
        maxDescendantDepth: 1,
        maxCollateralDepth: 0
      })
    ).toThrow();

    expect(
      createFocusShareBodySchema.parse({
        password: "longenough",
        label: "  Reunion  ",
        focusAnchorPersonId: "p1",
        maxAncestorDepth: 3,
        maxDescendantDepth: 2,
        maxCollateralDepth: 1
      })
    ).toMatchObject({
      password: "longenough",
      label: "Reunion",
      focusAnchorPersonId: "p1"
    });

    expect(rotateFocusSharePasswordBodySchema.parse({ password: "newpassword" })).toEqual({
      password: "newpassword"
    });
  });

  it("requires at least one patch field", () => {
    expect(() => patchFocusShareBodySchema.parse({})).toThrow();
    expect(patchFocusShareBodySchema.parse({ label: null })).toEqual({ label: null });
  });

  it("parses unlock and guest graph query shapes", () => {
    expect(unlockFocusShareBodySchema.parse({ password: "x" })).toEqual({ password: "x" });
    expect(
      guestFocusShareGraphQuerySchema.parse({
        ancestorDepth: "2",
        descendantDepth: "1",
        collateralDepth: "0"
      })
    ).toEqual({
      ancestorDepth: 2,
      descendantDepth: 1,
      collateralDepth: 0
    });
  });
});
