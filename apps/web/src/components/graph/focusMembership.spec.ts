import { describe, expect, it } from "vitest";
import type { RelationshipRecord } from "../../lib/api";
import { pickFocusMembershipIds } from "./focusMembership";

const rel = (
  fromPersonId: string,
  toPersonId: string,
  type: RelationshipRecord["type"]
): RelationshipRecord =>
  ({
    id: `${fromPersonId}-${type}-${toPersonId}`,
    fromPersonId,
    toPersonId,
    type
  }) as RelationshipRecord;

/**
 * Fixture from ticket 01:
 * A ← P (parent), Aunt sibling of P, Cousin child of Aunt,
 * Sib sibling of A, Niece child of Sib, SpouseA, SpouseSib.
 */
const buildTicket01Graph = (): RelationshipRecord[] => [
  rel("P", "A", "PARENT_OF"),
  rel("P", "Sib", "PARENT_OF"),
  rel("GP", "P", "PARENT_OF"),
  rel("GP", "Aunt", "PARENT_OF"),
  rel("Aunt", "Cousin", "PARENT_OF"),
  rel("Sib", "Niece", "PARENT_OF"),
  rel("Niece", "GrandNiece", "PARENT_OF"),
  rel("A", "SpouseA", "SPOUSE_OF"),
  rel("Sib", "SpouseSib", "SPOUSE_OF")
];

describe("pickFocusMembershipIds", () => {
  it("returns empty without an anchor", () => {
    expect(
      pickFocusMembershipIds(buildTicket01Graph(), {
        anchorId: null,
        ancestorDepth: 3,
        descendantDepth: 3,
        collateralDepth: 0
      }).size
    ).toBe(0);
  });

  it("matches ticket 01 table at collateral depth 0", () => {
    const ids = pickFocusMembershipIds(buildTicket01Graph(), {
      anchorId: "A",
      ancestorDepth: 5,
      descendantDepth: 5,
      collateralDepth: 0
    });
    expect(ids.has("A")).toBe(true);
    expect(ids.has("SpouseA")).toBe(true);
    expect(ids.has("P")).toBe(true);
    expect(ids.has("Sib")).toBe(true);
    expect(ids.has("SpouseSib")).toBe(true);
    expect(ids.has("Aunt")).toBe(true);
    expect(ids.has("Niece")).toBe(false);
    expect(ids.has("Cousin")).toBe(false);
    expect(ids.has("GrandNiece")).toBe(false);
  });

  it("matches ticket 01 table at collateral depth 1", () => {
    const ids = pickFocusMembershipIds(buildTicket01Graph(), {
      anchorId: "A",
      ancestorDepth: 5,
      descendantDepth: 5,
      collateralDepth: 1
    });
    expect(ids.has("Niece")).toBe(true);
    expect(ids.has("Cousin")).toBe(true);
    expect(ids.has("GrandNiece")).toBe(false);
  });

  it("includes grand-niece at collateral depth 2", () => {
    const ids = pickFocusMembershipIds(buildTicket01Graph(), {
      anchorId: "A",
      ancestorDepth: 5,
      descendantDepth: 5,
      collateralDepth: 2
    });
    expect(ids.has("GrandNiece")).toBe(true);
  });

  it("discovers siblings via SIBLING_OF without shared parents", () => {
    const relationships = [
      rel("A", "OnlyEdgeSib", "SIBLING_OF"),
      rel("OnlyEdgeSib", "EdgeSpouse", "SPOUSE_OF")
    ];
    const ids = pickFocusMembershipIds(relationships, {
      anchorId: "A",
      ancestorDepth: 0,
      descendantDepth: 0,
      collateralDepth: 0
    });
    expect(ids.has("A")).toBe(true);
    expect(ids.has("OnlyEdgeSib")).toBe(true);
    expect(ids.has("EdgeSpouse")).toBe(true);
  });

  it("includes spouse of person at exact ancestor depth cap", () => {
    const relationships = [
      rel("Mid", "A", "PARENT_OF"),
      rel("Far", "Mid", "PARENT_OF"),
      rel("Far", "FarSpouse", "SPOUSE_OF")
    ];
    const ids = pickFocusMembershipIds(relationships, {
      anchorId: "A",
      ancestorDepth: 2,
      descendantDepth: 0,
      collateralDepth: 0
    });
    expect(ids.has("Far")).toBe(true);
    expect(ids.has("FarSpouse")).toBe(true);
  });

  it("respects ancestor depth cap", () => {
    const relationships = [rel("Mid", "A", "PARENT_OF"), rel("Far", "Mid", "PARENT_OF")];
    const ids = pickFocusMembershipIds(relationships, {
      anchorId: "A",
      ancestorDepth: 1,
      descendantDepth: 0,
      collateralDepth: 0
    });
    expect(ids.has("Mid")).toBe(true);
    expect(ids.has("Far")).toBe(false);
  });
});
