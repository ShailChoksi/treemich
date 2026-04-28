import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../styles.css";
import type { ImmichPerson, LifeEventRecord, RelationshipRecord } from "../lib/api";
import {
  PersonDetailPanel,
  getRelativeRelationshipLabel,
  indexRelationshipsByPersonId
} from "./PersonDetailPanel";
import { formatBirthDate } from "./personDetail/personDetailHelpers";

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
  type: RelationshipRecord["type"],
  extra?: Partial<RelationshipRecord>
): RelationshipRecord => ({
  fromPersonId,
  toPersonId,
  type,
  ...extra
});

type PanelProps = ComponentProps<typeof PersonDetailPanel>;

const marriageEv = (y: number, m: number, d: number): LifeEventRecord => ({
  id: "ev-m",
  eventType: "MARRIAGE",
  customLabel: null,
  dateQualifier: "EXACT",
  year: y,
  month: m,
  day: d,
  endYear: null,
  endMonth: null,
  endDay: null,
  notes: null,
  place: null,
  citations: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
});

const divorceEv = (y: number, m: number, d: number): LifeEventRecord => ({
  id: "ev-d",
  eventType: "DIVORCE",
  customLabel: null,
  dateQualifier: "EXACT",
  year: y,
  month: m,
  day: d,
  endYear: null,
  endMonth: null,
  endDay: null,
  notes: null,
  place: null,
  citations: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
});

const renderPanel = (overrides?: {
  person?: ImmichPerson | null;
  people?: ImmichPerson[];
  relationships?: RelationshipRecord[];
  panelProps?: Partial<PanelProps>;
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

  const baseProps: PanelProps = {
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
    relationshipLifeEventsById: {},
    ...overrides?.panelProps
  };

  act(() => {
    root.render(createElement(PersonDetailPanel, baseProps));
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
    expect(container.textContent).toContain("Save profile");

    act(() => {
      profileToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(profileToggle?.getAttribute("aria-expanded")).toBe("false");
    const profileRegion = container.querySelector("#person-detail-section-content-profile");
    expect((profileRegion as HTMLElement | null)?.hasAttribute("hidden")).toBe(true);
    expect(window.getComputedStyle(profileRegion as HTMLElement).display).toBe("none");

    act(() => {
      profileToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(profileToggle?.getAttribute("aria-expanded")).toBe("true");
    const profileRegionOpen = container.querySelector("#person-detail-section-content-profile");
    expect((profileRegionOpen as HTMLElement | null)?.hasAttribute("hidden")).toBe(false);
    expect(window.getComputedStyle(profileRegionOpen as HTMLElement).display).not.toBe("none");
    expect(container.textContent).toContain("Save profile");

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
      profile: { id: "spouse-sibling", immichPersonId: "spouse-sibling", gender: "MALE" }
    };
    const spouseParent: ImmichPerson = {
      ...person("spouse-parent", "Pat"),
      profile: { id: "spouse-parent", immichPersonId: "spouse-parent", gender: "FEMALE" }
    };
    const spouseUncle: ImmichPerson = {
      ...person("spouse-uncle", "Uma"),
      profile: { id: "spouse-uncle", immichPersonId: "spouse-uncle", gender: "FEMALE" }
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

  it("renders event-derived profile date and place values from props", () => {
    const { container, root } = renderPanel({
      panelProps: {
        birthDateValue: "1991-05-06",
        deathDateValue: "2021-07-08",
        birthCityValue: "Boston",
        birthCountryValue: "US"
      }
    });
    const profileContent = container.querySelector("#person-detail-section-content-profile");
    const dateInputs = profileContent?.querySelectorAll('input[type="date"]');
    expect((dateInputs?.[0] as HTMLInputElement | undefined)?.value).toBe("1991-05-06");
    expect((dateInputs?.[1] as HTMLInputElement | undefined)?.value).toBe("2021-07-08");
    expect(
      [...(profileContent?.querySelectorAll("input") ?? [])].some(
        (el) => (el as HTMLInputElement).value === "Boston"
      )
    ).toBe(true);
    expect(
      [...(profileContent?.querySelectorAll("input") ?? [])].some(
        (el) => (el as HTMLInputElement).value === "US"
      )
    ).toBe(true);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows marriage and divorce quick-edit dates from relationship life events", () => {
    const { container, root } = renderPanel({
      relationships: [
        relationship("spouse", "me", "SPOUSE_OF", { id: "rel-spouse-1" }),
        relationship("spouse-mom", "spouse", "PARENT_OF")
      ],
      panelProps: {
        relationshipLifeEventsById: {
          "rel-spouse-1": [marriageEv(2011, 7, 8), divorceEv(2021, 9, 10)]
        }
      }
    });

    const editSpouse = container.querySelector(
      '[aria-label="Edit relationship with Spouse"]'
    ) as HTMLButtonElement | null;
    expect(editSpouse).toBeTruthy();
    act(() => {
      editSpouse?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const editor = container.querySelector(".relationship-editor");
    const editorDates = editor?.querySelectorAll('input[type="date"]');
    expect((editorDates?.[0] as HTMLInputElement | undefined)?.value).toBe("2011-07-08");
    expect((editorDates?.[1] as HTMLInputElement | undefined)?.value).toBe("2021-09-10");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders life events advanced section when life-event handlers are provided", () => {
    const { container, root } = renderPanel({
      panelProps: {
        personLifeEvents: [],
        onPersonLifeEventCreate: async () => undefined,
        onPersonLifeEventPatch: async () => undefined,
        onPersonLifeEventDelete: async () => undefined
      }
    });
    expect(container.textContent).toContain("Life events (advanced)");
    expect((container.textContent ?? "").includes("Partial dates")).toBe(false);

    const lifeEventsToggle = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Life events (advanced)")
    ) as HTMLButtonElement | undefined;
    act(() => {
      lifeEventsToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Filter list by type");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps displayed Immich birth date consistent with date input value", () => {
    const { container, root } = renderPanel({
      person: {
        ...person("me", "Me"),
        birthDate: "1992-09-25"
      },
      panelProps: {
        birthDateValue: "1992-09-25"
      }
    });

    expect(container.textContent).toContain(`Immich birth date: ${formatBirthDate("1992-09-25")}`);
    const profileContent = container.querySelector("#person-detail-section-content-profile");
    const birthInput = profileContent?.querySelector('input[type="date"]') as HTMLInputElement | null;
    expect(birthInput?.value).toBe("1992-09-25");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
