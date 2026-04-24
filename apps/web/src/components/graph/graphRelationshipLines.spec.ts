import { describe, expect, it } from "vitest";
import { buildVisibleRelationshipLines } from "./graphRelationshipLines";
import type { RelationshipRecord } from "../../lib/api";
import type { NodePosition } from "./layout";

const pos = (x: number, y: number, z: number): NodePosition => [x, y, z];

describe("buildVisibleRelationshipLines", () => {
  it("marks dashed parent line for adopted pedigree on PARENT_OF", () => {
    const rels: RelationshipRecord[] = [
      {
        fromPersonId: "p1",
        toPersonId: "c1",
        type: "PARENT_OF",
        childEdgePedigree: "ADOPTED"
      }
    ];
    const lines = buildVisibleRelationshipLines({
      viewMode: "family",
      photoEdges: [],
      visiblePositionsById: new Map([
        ["p1", pos(0, 0, 0)],
        ["c1", pos(2, 0, 0)]
      ]),
      mergedParentGroups: new Map(),
      filteredRelationships: rels,
      visibleIdSet: new Set(["p1", "c1"])
    });
    const edgeLine = lines.find((l) => l.kind === "PARENT_CHILD");
    expect(edgeLine?.dashed).toBe(true);
  });

  it("does not dash biological parent line", () => {
    const rels: RelationshipRecord[] = [
      {
        fromPersonId: "p1",
        toPersonId: "c1",
        type: "PARENT_OF",
        childEdgePedigree: "BIOLOGICAL"
      }
    ];
    const lines = buildVisibleRelationshipLines({
      viewMode: "family",
      photoEdges: [],
      visiblePositionsById: new Map([
        ["p1", pos(0, 0, 0)],
        ["c1", pos(2, 0, 0)]
      ]),
      mergedParentGroups: new Map(),
      filteredRelationships: rels,
      visibleIdSet: new Set(["p1", "c1"])
    });
    const edgeLine = lines.find((l) => l.kind === "PARENT_CHILD");
    expect(edgeLine?.dashed).toBeUndefined();
  });

  it.each([
    ["FOSTER", "FOSTER"],
    ["STEP", "STEP"]
  ] as const)("dashes %s pedigree on PARENT_OF", (_label, pedigree) => {
    const rels: RelationshipRecord[] = [
      {
        fromPersonId: "p1",
        toPersonId: "c1",
        type: "PARENT_OF",
        childEdgePedigree: pedigree
      }
    ];
    const lines = buildVisibleRelationshipLines({
      viewMode: "family",
      photoEdges: [],
      visiblePositionsById: new Map([
        ["p1", pos(0, 0, 0)],
        ["c1", pos(2, 0, 0)]
      ]),
      mergedParentGroups: new Map(),
      filteredRelationships: rels,
      visibleIdSet: new Set(["p1", "c1"])
    });
    expect(lines.find((l) => l.kind === "PARENT_CHILD")?.dashed).toBe(true);
  });

  it("does not dash UNKNOWN pedigree", () => {
    const rels: RelationshipRecord[] = [
      {
        fromPersonId: "p1",
        toPersonId: "c1",
        type: "PARENT_OF",
        childEdgePedigree: "UNKNOWN"
      }
    ];
    const lines = buildVisibleRelationshipLines({
      viewMode: "family",
      photoEdges: [],
      visiblePositionsById: new Map([
        ["p1", pos(0, 0, 0)],
        ["c1", pos(2, 0, 0)]
      ]),
      mergedParentGroups: new Map(),
      filteredRelationships: rels,
      visibleIdSet: new Set(["p1", "c1"])
    });
    expect(lines.find((l) => l.kind === "PARENT_CHILD")?.dashed).toBeUndefined();
  });

  it("does not apply pedigree dash styling to CHILD_OF edges", () => {
    const rels: RelationshipRecord[] = [
      {
        fromPersonId: "c1",
        toPersonId: "p1",
        type: "CHILD_OF",
        childEdgePedigree: "ADOPTED"
      }
    ];
    const lines = buildVisibleRelationshipLines({
      viewMode: "family",
      photoEdges: [],
      visiblePositionsById: new Map([
        ["p1", pos(0, 0, 0)],
        ["c1", pos(2, 0, 0)]
      ]),
      mergedParentGroups: new Map(),
      filteredRelationships: rels,
      visibleIdSet: new Set(["p1", "c1"])
    });
    expect(lines.find((l) => l.kind === "PARENT_CHILD")?.dashed).toBeUndefined();
  });
});
