import { describe, expect, it } from "vitest";
import type { ImmichPerson } from "../../lib/api";
import { type NodePosition } from "./layout";
import { pickNearest } from "./useGraphLayoutState";
import { findPersonBySearchTerm, resolveFocusPersonRequest } from "./useGraphSearch";

describe("pickNearest", () => {
  it("returns nearest people to origin up to limit", () => {
    const items = [
      { person: { id: "a", name: "A" } as ImmichPerson, position: [10, 0, 0] as NodePosition },
      { person: { id: "b", name: "B" } as ImmichPerson, position: [2, 0, 0] as NodePosition },
      { person: { id: "c", name: "C" } as ImmichPerson, position: [1, 0, 0] as NodePosition }
    ];

    const nearest = pickNearest(items, [0, 0, 0], 2);
    expect(nearest.map((item) => item.person.id)).toEqual(["c", "b"]);
  });
});

describe("useGraphSearch helpers", () => {
  it("resolves focus request by person id", () => {
    const people: ImmichPerson[] = [
      { id: "mike-id", name: "Mike", hasRelationship: false },
      { id: "anna-id", name: "Anna", hasRelationship: false }
    ];

    expect(resolveFocusPersonRequest(people, "anna-id")?.id).toBe("anna-id");
    expect(resolveFocusPersonRequest(people, "missing")).toBeNull();
  });

  it("finds matching person by search term", () => {
    const people: ImmichPerson[] = [
      { id: "mike-id", name: "Mike Jordan", hasRelationship: false },
      { id: "anna-id", name: "Anna", hasRelationship: false }
    ];

    expect(findPersonBySearchTerm(people, "mike")?.id).toBe("mike-id");
    expect(findPersonBySearchTerm(people, "  ")).toBeNull();
    expect(findPersonBySearchTerm(people, "not-found")).toBeNull();
  });
});
