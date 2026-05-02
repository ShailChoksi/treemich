import { describe, expect, it } from "vitest";
import type { PersonRecord } from "../lib/api";
import { RELATIONSHIP_TYPES } from "../lib/relationshipConstants";
import { resolveRestoredCameraSnapshotForCanvas } from "./graph/graphCameraPolicy";
import { canLoadPersonThumbnail, resolveAddRelativeRelationshipType } from "./PeopleGraph3D";

const makePerson = (overrides: Partial<PersonRecord> = {}): PersonRecord => ({
  id: "person-1",
  name: "Standalone Person",
  profile: {
    id: "person-1",
    gender: "UNKNOWN",
    givenName: "Standalone",
    surname: "Person"
  },
  externalIdentities: [],
  thumbnail: null,
  thumbnailPath: null,
  ...overrides
});

describe("PeopleGraph3D thumbnail eligibility", () => {
  it("does not request thumbnails for standalone Treemich people without Immich identities", () => {
    expect(canLoadPersonThumbnail(makePerson())).toBe(false);
  });

  it("requests thumbnails for people linked to Immich", () => {
    expect(
      canLoadPersonThumbnail(
        makePerson({
          externalIdentities: [
            {
              id: "identity-1",
              personId: "person-1",
              provider: "IMMICH",
              providerPersonId: "immich-person-1",
              providerBaseUrl: "https://immich.example",
              displayName: "Immich Person",
              thumbnailImportedAt: null,
              lastSeenAt: null,
              metadata: {},
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z"
            }
          ]
        })
      )
    ).toBe(true);
  });
});

describe("PeopleGraph3D initial camera restore", () => {
  it("prioritizes selected-person focus over a saved camera snapshot on hard page load", () => {
    const savedCamera = {
      position: [100, 100, 100] as [number, number, number],
      target: [90, 90, 90] as [number, number, number]
    };

    expect(
      resolveRestoredCameraSnapshotForCanvas({
        sessionKind: "hardPageLoad",
        explicitFocusPersonId: null,
        cameraFocusPersonRequest: "selected-person",
        savedCamera
      })
    ).toBeNull();
  });

  it("restores the saved camera when there is no selected-person focus request", () => {
    const savedCamera = {
      position: [100, 100, 100] as [number, number, number],
      target: [90, 90, 90] as [number, number, number]
    };

    expect(
      resolveRestoredCameraSnapshotForCanvas({
        sessionKind: "hardPageLoad",
        explicitFocusPersonId: null,
        cameraFocusPersonRequest: null,
        savedCamera
      })
    ).toBe(savedCamera);
  });

  it("restores the saved camera on workspace remount even when a camera focus request exists", () => {
    const savedCamera = {
      position: [100, 100, 100] as [number, number, number],
      target: [90, 90, 90] as [number, number, number]
    };

    expect(
      resolveRestoredCameraSnapshotForCanvas({
        sessionKind: "workspaceRemount",
        explicitFocusPersonId: null,
        cameraFocusPersonRequest: "selected-person",
        savedCamera
      })
    ).toBe(savedCamera);
  });
});

describe("PeopleGraph3D add-relative relationship mapping", () => {
  it("maps a new parent target to CHILD_OF from the selected person", () => {
    expect(resolveAddRelativeRelationshipType("parent")).toBe(RELATIONSHIP_TYPES.childOf);
  });

  it("maps a new child target to PARENT_OF from the selected person", () => {
    expect(resolveAddRelativeRelationshipType("child")).toBe(RELATIONSHIP_TYPES.parentOf);
  });

  it("preserves the selected connection relationship type", () => {
    expect(resolveAddRelativeRelationshipType("siblingOrSpouse", RELATIONSHIP_TYPES.spouseOf)).toBe(
      RELATIONSHIP_TYPES.spouseOf
    );
  });

  it("defaults connection relationships to sibling when none is selected", () => {
    expect(resolveAddRelativeRelationshipType("siblingOrSpouse")).toBe(RELATIONSHIP_TYPES.siblingOf);
  });
});
