import { describe, expect, it } from "vitest";
import type { ImmichPerson, RelationshipRecord } from "../lib/api";
import { buildBirthPlaceInput, parseDateInputToParts } from "../lib/lifeEventUi";
import { findBestPersonMatchByName, resolvePeopleSelection } from "./people";

const people: ImmichPerson[] = [
  { id: "p-1", name: "Alex", hasRelationship: false },
  { id: "p-2", name: "Alex Johnson", hasRelationship: false },
  { id: "p-3", name: "Jordan", hasRelationship: false }
];

const withRelationships: RelationshipRecord[] = [
  { fromPersonId: "p-1", toPersonId: "p-3", type: "SIBLING_OF" }
];

describe("findBestPersonMatchByName", () => {
  it("prefers exact match before contains match", () => {
    const match = findBestPersonMatchByName(people, "alex");
    expect(match?.id).toBe("p-1");
  });

  it("falls back to contains match and picks alphabetical first", () => {
    const candidates: ImmichPerson[] = [
      { id: "p-a", name: "Sam Carter", hasRelationship: false },
      { id: "p-b", name: "A Sam", hasRelationship: false }
    ];

    const match = findBestPersonMatchByName(candidates, "sam");
    expect(match?.id).toBe("p-b");
  });

  it("returns null for empty search names", () => {
    expect(findBestPersonMatchByName(people, "  ")).toBeNull();
  });
});

describe("resolvePeopleSelection", () => {
  it("keeps selection empty with no relationships and focuses matched user", () => {
    const resolved = resolvePeopleSelection({
      people,
      relationships: [],
      currentSelectedPersonId: null,
      lastSelectedPersonId: "p-3",
      currentUserName: "Alex Johnson"
    });

    expect(resolved).toEqual({
      selectedPersonId: null,
      cameraFocusPersonId: "p-2"
    });
  });

  it("keeps current selection when relationships exist and current id is valid", () => {
    const resolved = resolvePeopleSelection({
      people,
      relationships: withRelationships,
      currentSelectedPersonId: "p-3",
      lastSelectedPersonId: "p-1",
      currentUserName: "Alex"
    });

    expect(resolved).toEqual({
      selectedPersonId: "p-3",
      cameraFocusPersonId: null
    });
  });

  it("restores last selected person when current selection is missing", () => {
    const resolved = resolvePeopleSelection({
      people,
      relationships: withRelationships,
      currentSelectedPersonId: "missing",
      lastSelectedPersonId: "p-1",
      currentUserName: "Alex"
    });

    expect(resolved).toEqual({
      selectedPersonId: "p-1",
      cameraFocusPersonId: "p-1"
    });
  });

  it("falls back to first person when no valid selection can be restored", () => {
    const resolved = resolvePeopleSelection({
      people,
      relationships: withRelationships,
      currentSelectedPersonId: "missing",
      lastSelectedPersonId: "also-missing",
      currentUserName: "Alex"
    });

    expect(resolved).toEqual({
      selectedPersonId: "p-1",
      cameraFocusPersonId: null
    });
  });
});

describe("parseDateInputToParts", () => {
  it("parses valid yyyy-mm-dd dates", () => {
    expect(parseDateInputToParts("2026-04-21")).toEqual({ year: 2026, month: 4, day: 21 });
  });

  it("rejects malformed or impossible dates", () => {
    expect(parseDateInputToParts("2026-4-21")).toBeNull();
    expect(parseDateInputToParts("not-a-date")).toBeNull();
    expect(parseDateInputToParts("2026-02-30")).toBeNull();
  });
});

describe("buildBirthPlaceInput", () => {
  it("returns null when no values are provided", () => {
    expect(buildBirthPlaceInput(null, null)).toBeNull();
  });

  it("builds locality and normalized country code for 2-letter countries", () => {
    expect(buildBirthPlaceInput("Boston", "us")).toEqual({
      name: "Boston, us",
      locality: "Boston",
      countryCode: "US"
    });
  });

  it("keeps non-2-letter country in display name without invalid countryCode", () => {
    expect(buildBirthPlaceInput("Boston", "USA")).toEqual({
      name: "Boston, USA",
      locality: "Boston",
      countryCode: null
    });
  });
});
