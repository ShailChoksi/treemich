import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImmichPerson, RelationshipRecord } from "../lib/api";
import {
  PersonDetailPanel,
  getRelativeRelationshipLabel,
  indexRelationshipsByPersonId
} from "./PersonDetailPanel";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

type RenderResult = {
  container: HTMLDivElement;
  root: Root;
};

const person = (id: string, name: string): ImmichPerson => ({
  id,
  name,
  hasRelationship: false
});

const relationship = (
  fromPersonId: string,
  toPersonId: string,
  type: RelationshipRecord["type"]
): RelationshipRecord => ({
  fromPersonId,
  toPersonId,
  type
});

const renderPanel = (overrides?: {
  person?: ImmichPerson | null;
  people?: ImmichPerson[];
  relationships?: RelationshipRecord[];
}): RenderResult => {
  const selectedPerson = overrides?.person ?? person("me", "Me");
  const people = overrides?.people ?? [
    selectedPerson,
    person("spouse", "Spouse"),
    person("spouse-mom", "Martha")
  ];
  const relationships = overrides?.relationships ?? [
    relationship("spouse", "me", "SPOUSE_OF"),
    relationship("spouse-mom", "spouse", "PARENT_OF")
  ];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      createElement(PersonDetailPanel, {
        person: selectedPerson,
        people,
        relationships,
        dismissedSuggestionKeys: [],
        genders: ["UNKNOWN", "MALE", "FEMALE", "OTHER"],
        genderValue: "UNKNOWN",
        birthDateValue: "",
        givenNameValue: "",
        surnameValue: "",
        nicknamesValue: "",
        deathDateValue: "",
        birthCityValue: "",
        birthCountryValue: "",
        onGenderChange: () => undefined,
        onBirthDateChange: () => undefined,
        onGivenNameChange: () => undefined,
        onSurnameChange: () => undefined,
        onNicknamesChange: () => undefined,
        onDeathDateChange: () => undefined,
        onBirthCityChange: () => undefined,
        onBirthCountryChange: () => undefined,
        onProfileSave: () => undefined,
        isSavingProfile: false,
        onFocusPerson: () => undefined,
        onCreateRelationship: async () => undefined,
        onUpdateRelationship: async () => undefined,
        onDeleteRelationship: async () => undefined,
        onDismissSuggestion: () => undefined,
        isSavingRelationship: false,
        immichBaseUrl: null,
        primaryFamilyUnitByPersonId: {},
        onPrimaryFamilyUnitChange: () => undefined,
        relationshipLifeEventsById: {}
      })
    );
  });

  return { container, root };
};

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("indexRelationshipsByPersonId", () => {
  it("indexes each relationship for both participants", () => {
    const relationships = [
      { fromPersonId: "a", toPersonId: "b", type: "SIBLING_OF" as const },
      { fromPersonId: "a", toPersonId: "c", type: "PARENT_OF" as const }
    ];

    const index = indexRelationshipsByPersonId(relationships);

    expect(index.get("a")).toHaveLength(2);
    expect(index.get("b")).toHaveLength(1);
    expect(index.get("c")).toHaveLength(1);
  });
});

describe("getRelativeRelationshipLabel", () => {
  it("uses gendered terms for parent and sibling relationships", () => {
    expect(getRelativeRelationshipLabel("PARENT_OF", "MALE")).toBe("Father");
    expect(getRelativeRelationshipLabel("PARENT_OF", "FEMALE")).toBe("Mother");
    expect(getRelativeRelationshipLabel("SIBLING_OF", "MALE")).toBe("Brother");
    expect(getRelativeRelationshipLabel("SIBLING_OF", "FEMALE")).toBe("Sister");
  });

  it("falls back to neutral terms for UNKNOWN and OTHER genders", () => {
    expect(getRelativeRelationshipLabel("PARENT_OF", "UNKNOWN")).toBe("Parent");
    expect(getRelativeRelationshipLabel("SIBLING_OF", "OTHER")).toBe("Sibling");
    expect(getRelativeRelationshipLabel("CHILD_OF", "UNKNOWN")).toBe("Child");
  });
});

describe("PersonDetailPanel", () => {
  it("shows all sections expanded by default and includes in-laws", () => {
    const { container, root } = renderPanel();
    expect(container.textContent).toContain("Profile");
    expect(container.textContent).toContain("In-Laws");
    expect(container.textContent).toContain("Martha");
    expect(
      container.querySelector('button[aria-controls="person-detail-section-content-profile"]')
    ).toBeTruthy();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("collapses and re-expands a section when toggled", () => {
    const { container, root } = renderPanel();
    const profileToggle = container.querySelector(
      'button[aria-controls="person-detail-section-content-profile"]'
    ) as HTMLButtonElement | null;
    expect(profileToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("Birth date override");

    act(() => {
      profileToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(profileToggle?.getAttribute("aria-expanded")).toBe("false");
    expect((container.textContent ?? "").includes("Birth date override")).toBe(false);

    act(() => {
      profileToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(profileToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("Birth date override");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("uses gendered in-law labels when profile gender is known", () => {
    const me = person("me", "Me");
    const spouse = person("spouse", "Spouse");
    const spouseSibling: ImmichPerson = {
      ...person("spouse-sibling", "Sam"),
      profile: { immichPersonId: "spouse-sibling", gender: "MALE" }
    };
    const spouseParent: ImmichPerson = {
      ...person("spouse-parent", "Pat"),
      profile: { immichPersonId: "spouse-parent", gender: "FEMALE" }
    };
    const spouseUncle: ImmichPerson = {
      ...person("spouse-uncle", "Uma"),
      profile: { immichPersonId: "spouse-uncle", gender: "FEMALE" }
    };
    const { container, root } = renderPanel({
      person: me,
      people: [me, spouse, spouseSibling, spouseParent, spouseUncle],
      relationships: [
        relationship("spouse", "me", "SPOUSE_OF"),
        relationship("spouse-parent", "spouse", "PARENT_OF"),
        relationship("spouse-parent", "spouse-sibling", "PARENT_OF"),
        relationship("spouse-sibling", "spouse", "SIBLING_OF"),
        relationship("spouse-parent", "spouse-uncle", "SIBLING_OF")
      ]
    });

    expect(container.textContent).toContain("Brother-in-law");
    expect(container.textContent).toContain("Aunt-in-law");
    expect((container.textContent ?? "").includes("No in-laws found yet.")).toBe(false);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
