import { describe, expect, it } from "vitest";
import { layoutGuestFocusGraph, toGuestPersonRecord } from "./guestGraphAdapters";

describe("guestGraphAdapters", () => {
  it("maps guest people into PersonRecord shape for the 3D scene", () => {
    const person = toGuestPersonRecord({
      id: "p1",
      name: "Ada Lovelace",
      givenName: "Ada",
      surname: "Lovelace",
      hasThumbnail: true,
      hasImmichLink: true,
      birthDate: null,
      deathDate: null
    });
    expect(person.id).toBe("p1");
    expect(person.name).toBe("Ada Lovelace");
    expect(person.profile?.givenName).toBe("Ada");
    expect(person.thumbnailPath).toBe("guest");
  });

  it("lays out people and builds relationship lines for the guest cone", () => {
    const layout = layoutGuestFocusGraph(
      [
        {
          id: "parent",
          name: "Parent",
          givenName: "Parent",
          surname: null,
          hasThumbnail: false,
          hasImmichLink: false,
          birthDate: null,
          deathDate: null
        },
        {
          id: "child",
          name: "Child",
          givenName: "Child",
          surname: null,
          hasThumbnail: true,
          hasImmichLink: true,
          birthDate: null,
          deathDate: null
        }
      ],
      [{ id: "r1", fromPersonId: "parent", toPersonId: "child", type: "PARENT_OF" }]
    );

    expect(layout.displayVisiblePeople).toHaveLength(2);
    expect(layout.visiblePositionsById.has("parent")).toBe(true);
    expect(layout.visiblePositionsById.has("child")).toBe(true);
    expect(layout.graphBounds).not.toBeNull();
    expect(layout.visibleRelationshipLines.length).toBeGreaterThan(0);
    expect(layout.relationshipRecords[0]?.type).toBe("PARENT_OF");
  });

  it("hides Immich-unlinked people when filtered", () => {
    const layout = layoutGuestFocusGraph(
      [
        {
          id: "parent",
          name: "Parent",
          givenName: "Parent",
          surname: null,
          hasThumbnail: false,
          hasImmichLink: false,
          birthDate: null,
          deathDate: null
        },
        {
          id: "child",
          name: "Child",
          givenName: "Child",
          surname: null,
          hasThumbnail: true,
          hasImmichLink: true,
          birthDate: null,
          deathDate: null
        }
      ],
      [
        { id: "r1", fromPersonId: "parent", toPersonId: "child", type: "PARENT_OF" },
        { id: "r2", fromPersonId: "parent", toPersonId: "child", type: "FRIEND_OF" }
      ],
      {
        peopleViewFilter: "immich-linked",
        filterVisibility: {
          parentChild: true,
          spouse: true,
          sibling: true,
          friends: false,
          pets: true
        }
      }
    );

    expect(layout.displayVisiblePeople.map((item) => item.person.id)).toEqual(["child"]);
    expect(layout.relationshipRecords).toHaveLength(0);
  });

  it("keeps node positions when Spouse/Sibling layers are toggled off", () => {
    const people = [
      {
        id: "a",
        name: "Ada",
        givenName: "Ada",
        surname: null,
        hasThumbnail: false,
        hasImmichLink: false,
        birthDate: null,
        deathDate: null
      },
      {
        id: "b",
        name: "Bob",
        givenName: "Bob",
        surname: null,
        hasThumbnail: false,
        hasImmichLink: false,
        birthDate: null,
        deathDate: null
      },
      {
        id: "c",
        name: "Chris",
        givenName: "Chris",
        surname: null,
        hasThumbnail: false,
        hasImmichLink: false,
        birthDate: null,
        deathDate: null
      }
    ];
    const relationships = [
      { id: "r1", fromPersonId: "a", toPersonId: "c", type: "PARENT_OF" },
      { id: "r2", fromPersonId: "a", toPersonId: "b", type: "SPOUSE_OF" },
      { id: "r3", fromPersonId: "b", toPersonId: "c", type: "PARENT_OF" },
      { id: "r4", fromPersonId: "c", toPersonId: "b", type: "SIBLING_OF" }
    ];

    const withAllLayers = layoutGuestFocusGraph(people, relationships, {
      filterVisibility: {
        parentChild: true,
        spouse: true,
        sibling: true,
        friends: true,
        pets: true
      }
    });
    const parentChildOnly = layoutGuestFocusGraph(people, relationships, {
      filterVisibility: {
        parentChild: true,
        spouse: false,
        sibling: false,
        friends: false,
        pets: false
      }
    });

    expect(withAllLayers.visiblePositionsById.get("a")).toEqual(
      parentChildOnly.visiblePositionsById.get("a")
    );
    expect(withAllLayers.visiblePositionsById.get("b")).toEqual(
      parentChildOnly.visiblePositionsById.get("b")
    );
    expect(withAllLayers.visiblePositionsById.get("c")).toEqual(
      parentChildOnly.visiblePositionsById.get("c")
    );
    expect(parentChildOnly.visibleRelationshipLines.every((line) => line.kind === "PARENT_CHILD")).toBe(true);
    expect(withAllLayers.visibleRelationshipLines.some((line) => line.kind === "SPOUSE")).toBe(true);
  });

  it("applies primaryFamilyUnitByPersonId when positioning multi-parent people", () => {
    const people = [
      {
        id: "pA",
        name: "Parent A",
        givenName: "Parent",
        surname: "A",
        hasThumbnail: false,
        hasImmichLink: false,
        birthDate: null,
        deathDate: null
      },
      {
        id: "pB",
        name: "Parent B",
        givenName: "Parent",
        surname: "B",
        hasThumbnail: false,
        hasImmichLink: false,
        birthDate: null,
        deathDate: null
      },
      {
        id: "pC",
        name: "Parent C",
        givenName: "Parent",
        surname: "C",
        hasThumbnail: false,
        hasImmichLink: false,
        birthDate: null,
        deathDate: null
      },
      {
        id: "x",
        name: "Person X",
        givenName: "Person",
        surname: "X",
        hasThumbnail: false,
        hasImmichLink: false,
        birthDate: null,
        deathDate: null
      }
    ];
    const relationships = [
      { id: "r1", fromPersonId: "pA", toPersonId: "x", type: "PARENT_OF" },
      { id: "r2", fromPersonId: "pB", toPersonId: "x", type: "PARENT_OF" },
      { id: "r3", fromPersonId: "pC", toPersonId: "x", type: "PARENT_OF" }
    ];

    const defaultLayout = layoutGuestFocusGraph(people, relationships);
    const overriddenLayout = layoutGuestFocusGraph(people, relationships, {
      primaryFamilyUnitByPersonId: { x: "pB|pC" }
    });

    const defaultX = defaultLayout.visiblePositionsById.get("x")?.[0] ?? 0;
    const overrideX = overriddenLayout.visiblePositionsById.get("x")?.[0] ?? 0;
    expect(Math.abs(defaultX - overrideX)).toBeGreaterThan(1.5);
  });

  it("routes two-parent families through merged trunks like the owner graph", () => {
    const layout = layoutGuestFocusGraph(
      [
        {
          id: "mom",
          name: "Mom",
          givenName: "Mom",
          surname: null,
          hasThumbnail: false,
          hasImmichLink: false,
          birthDate: null,
          deathDate: null
        },
        {
          id: "dad",
          name: "Dad",
          givenName: "Dad",
          surname: null,
          hasThumbnail: false,
          hasImmichLink: false,
          birthDate: null,
          deathDate: null
        },
        {
          id: "kid",
          name: "Kid",
          givenName: "Kid",
          surname: null,
          hasThumbnail: false,
          hasImmichLink: false,
          birthDate: null,
          deathDate: null
        }
      ],
      [
        { id: "r1", fromPersonId: "mom", toPersonId: "kid", type: "PARENT_OF" },
        { id: "r2", fromPersonId: "dad", toPersonId: "kid", type: "PARENT_OF" }
      ]
    );

    const mergeLines = layout.visibleRelationshipLines.filter((line) => line.key.startsWith("family:merge:"));
    expect(mergeLines.length).toBeGreaterThan(0);
    expect(mergeLines.every((line) => line.kind === "PARENT_CHILD")).toBe(true);
    // Direct parent→child pair lines should be suppressed once merged routing applies.
    expect(
      layout.visibleRelationshipLines.some(
        (line) => line.key.includes("mom") && line.key.includes("kid") && !line.key.includes("merge")
      )
    ).toBe(false);
  });
});
