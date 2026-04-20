import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Gender, ImmichPerson, RelationshipRecord, RelationshipType } from "../lib/api";
import { immichPersonUrl, personThumbnailUrl } from "../lib/api";
import { computeExtendedFamily, computeInLawFamily, type ExtendedFamilyMember } from "./graph/extendedFamily";
import { inverseRelationshipType } from "./graph/layout";
import {
  computeSuggestions,
  getSuggestionRelationshipLabel,
  type RelationshipSuggestion
} from "./graph/relationshipSuggestions";

type RelativeItem = {
  key: string;
  relatedId: string;
  relatedName: string;
  displayRelationshipType: RelationshipType;
  editableRelationshipType: RelationshipType;
  relationshipLabel: string;
  record: RelationshipRecord;
};

type Props = {
  person: ImmichPerson | null;
  people: ImmichPerson[];
  relationships: RelationshipRecord[];
  dismissedSuggestionKeys: string[];
  genders: Gender[];
  genderValue: Gender;
  birthDateValue: string;
  givenNameValue: string;
  surnameValue: string;
  nicknamesValue: string;
  deathDateValue: string;
  birthCityValue: string;
  birthCountryValue: string;
  onGenderChange: (gender: Gender) => void;
  onBirthDateChange: (birthDate: string) => void;
  onGivenNameChange: (givenName: string) => void;
  onSurnameChange: (surname: string) => void;
  onNicknamesChange: (nicknames: string) => void;
  onDeathDateChange: (deathDate: string) => void;
  onBirthCityChange: (birthCity: string) => void;
  onBirthCountryChange: (birthCountry: string) => void;
  onProfileSave: () => void;
  isSavingProfile: boolean;
  onFocusPerson: (personId: string) => void;
  onCreateRelationship: (
    sourcePersonId: string,
    targetPersonId: string,
    relationshipType: RelationshipType
  ) => Promise<void>;
  onUpdateRelationship: (
    relationship: RelationshipRecord,
    relatedPersonId: string,
    relationshipType: RelationshipType,
    spouseDates?: {
      marriageAnniversaryDate?: string | null;
      divorceDate?: string | null;
    }
  ) => Promise<void>;
  onDeleteRelationship: (relationship: RelationshipRecord, relatedPersonId: string) => Promise<void>;
  onDismissSuggestion: (suggestionKey: string) => void;
  isSavingRelationship: boolean;
  immichBaseUrl?: string | null;
  primaryFamilyUnitByPersonId: Record<string, string>;
  onPrimaryFamilyUnitChange: (personId: string, unitKey: string | null) => void;
};

const maxVisibleSuggestions = 5;
const DEFAULT_COLLAPSED_SECTIONS = {
  profile: false,
  relatives: false,
  inLaws: false,
  suggestions: false,
  friends: false,
  pets: false,
  editRelationship: false,
  removeRelationship: false
} as const;

type SectionCollapseKey = keyof typeof DEFAULT_COLLAPSED_SECTIONS;
type SectionCollapsedState = Record<SectionCollapseKey, boolean>;

const getGenderedTerm = (
  gender: Gender | null | undefined,
  values: { male: string; female: string; fallback: string }
) => {
  if (gender === "MALE") {
    return values.male;
  }
  if (gender === "FEMALE") {
    return values.female;
  }
  return values.fallback;
};

export const getRelativeRelationshipLabel = (
  relationshipType: RelationshipRecord["type"],
  relatedGender: Gender | null | undefined
) => {
  if (relationshipType === "PARENT_OF") {
    return getGenderedTerm(relatedGender, { male: "Father", female: "Mother", fallback: "Parent" });
  }
  if (relationshipType === "CHILD_OF") {
    return getGenderedTerm(relatedGender, { male: "Son", female: "Daughter", fallback: "Child" });
  }
  if (relationshipType === "SPOUSE_OF") {
    return getGenderedTerm(relatedGender, { male: "Husband", female: "Wife", fallback: "Spouse" });
  }
  if (relationshipType === "SIBLING_OF") {
    return getGenderedTerm(relatedGender, { male: "Brother", female: "Sister", fallback: "Sibling" });
  }
  if (relationshipType === "FRIEND_OF") {
    return "Friend";
  }
  return "Pet";
};

const getInLawRelationshipLabel = (label: string, relatedGender: Gender | null | undefined) => {
  if (label === "Sibling-in-law") {
    return getGenderedTerm(relatedGender, {
      male: "Brother-in-law",
      female: "Sister-in-law",
      fallback: "Sibling-in-law"
    });
  }
  if (label === "Uncle/Aunt-in-law") {
    return getGenderedTerm(relatedGender, {
      male: "Uncle-in-law",
      female: "Aunt-in-law",
      fallback: "Uncle/Aunt-in-law"
    });
  }
  return label;
};

const relationshipEditorLabel = (
  relationshipType: RelationshipType,
  personName: string,
  relatedName: string,
  personGender: Gender | null | undefined
) => {
  if (relationshipType === "PARENT_OF") {
    return `${personName} is ${getGenderedTerm(personGender, {
      male: "father",
      female: "mother",
      fallback: "parent"
    })} of ${relatedName}`;
  }
  if (relationshipType === "CHILD_OF") {
    return `${personName} is ${getGenderedTerm(personGender, {
      male: "son",
      female: "daughter",
      fallback: "child"
    })} of ${relatedName}`;
  }
  if (relationshipType === "SPOUSE_OF") {
    return `${personName} is ${getGenderedTerm(personGender, {
      male: "husband",
      female: "wife",
      fallback: "spouse"
    })} of ${relatedName}`;
  }
  if (relationshipType === "FRIEND_OF") {
    return `${personName} is friend of ${relatedName}`;
  }
  if (relationshipType === "PET_OF") {
    return `${personName} has pet ${relatedName}`;
  }
  return `${personName} is ${getGenderedTerm(personGender, {
    male: "brother",
    female: "sister",
    fallback: "sibling"
  })} of ${relatedName}`;
};

const getAllowedRelationshipOptions = (
  relationshipType: RelationshipType,
  personName: string,
  relatedName: string,
  personGender: Gender | null | undefined
) => {
  const relationshipOptions: Array<{ value: RelationshipType; label: string }> = [
    {
      value: "PARENT_OF",
      label: relationshipEditorLabel("PARENT_OF", personName, relatedName, personGender)
    },
    { value: "CHILD_OF", label: relationshipEditorLabel("CHILD_OF", personName, relatedName, personGender) },
    {
      value: "SPOUSE_OF",
      label: relationshipEditorLabel("SPOUSE_OF", personName, relatedName, personGender)
    },
    {
      value: "SIBLING_OF",
      label: relationshipEditorLabel("SIBLING_OF", personName, relatedName, personGender)
    },
    {
      value: "FRIEND_OF",
      label: relationshipEditorLabel("FRIEND_OF", personName, relatedName, personGender)
    },
    { value: "PET_OF", label: relationshipEditorLabel("PET_OF", personName, relatedName, personGender) }
  ];
  if (relationshipType === "PARENT_OF" || relationshipType === "CHILD_OF") {
    return relationshipOptions.filter(
      (option) => option.value === "PARENT_OF" || option.value === "CHILD_OF"
    );
  }

  if (relationshipType === "SPOUSE_OF" || relationshipType === "SIBLING_OF") {
    return relationshipOptions.filter(
      (option) => option.value === "SPOUSE_OF" || option.value === "SIBLING_OF"
    );
  }

  if (relationshipType === "FRIEND_OF" || relationshipType === "PET_OF") {
    return relationshipOptions.filter((option) => option.value === "FRIEND_OF" || option.value === "PET_OF");
  }

  return relationshipOptions;
};

const formatBirthDate = (birthDate?: string | null) => {
  if (!birthDate) {
    return "Unknown";
  }

  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime())) {
    return birthDate;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
};

const formatGenderLabel = (gender: Gender) => gender.charAt(0) + gender.slice(1).toLowerCase();

type PrimaryFamilyOption = {
  key: string;
  label: string;
};

export const indexRelationshipsByPersonId = (relationships: RelationshipRecord[]) => {
  const index = new Map<string, RelationshipRecord[]>();
  for (const relationship of relationships) {
    const pushForPerson = (personId: string) => {
      const existing = index.get(personId);
      if (existing) {
        existing.push(relationship);
      } else {
        index.set(personId, [relationship]);
      }
    };
    pushForPerson(relationship.fromPersonId);
    pushForPerson(relationship.toPersonId);
  }
  return index;
};

const buildPrimaryFamilyOptions = (
  personId: string,
  peopleById: Map<string, ImmichPerson>,
  relationships: RelationshipRecord[]
): PrimaryFamilyOption[] => {
  const parentIds = new Set<string>();
  for (const relationship of relationships) {
    if (relationship.type === "PARENT_OF" && relationship.toPersonId === personId) {
      parentIds.add(relationship.fromPersonId);
      continue;
    }
    if (relationship.type === "CHILD_OF" && relationship.fromPersonId === personId) {
      parentIds.add(relationship.toPersonId);
    }
  }
  const sorted = [...parentIds].sort((left, right) =>
    (peopleById.get(left)?.name ?? left).localeCompare(peopleById.get(right)?.name ?? right)
  );
  if (sorted.length <= 2) {
    return [];
  }
  const options: PrimaryFamilyOption[] = [];
  for (let firstIndex = 0; firstIndex < sorted.length; firstIndex += 1) {
    const firstId = sorted[firstIndex];
    if (!firstId) {
      continue;
    }
    for (let secondIndex = firstIndex + 1; secondIndex < sorted.length; secondIndex += 1) {
      const secondId = sorted[secondIndex];
      if (!secondId) {
        continue;
      }
      options.push({
        key: firstId < secondId ? `${firstId}|${secondId}` : `${secondId}|${firstId}`,
        label: `${peopleById.get(firstId)?.name ?? firstId} + ${peopleById.get(secondId)?.name ?? secondId}`
      });
    }
  }
  return options;
};

type RelativesSectionProps = {
  sectionKey: string;
  title: string;
  items: RelativeItem[];
  extendedFamily?: ExtendedFamilyMember[];
  emptyMessage?: string;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onFocusPerson: (personId: string) => void;
  resolveExtendedLabel?: (member: ExtendedFamilyMember) => string;
  isSavingRelationship: boolean;
  onStartEditing: (relative: RelativeItem) => void;
  onStartDeleting: (key: string) => void;
};

const RelativesSection = ({
  sectionKey,
  title,
  items,
  extendedFamily,
  emptyMessage,
  isCollapsed,
  onToggleCollapsed,
  onFocusPerson,
  resolveExtendedLabel,
  isSavingRelationship,
  onStartEditing,
  onStartDeleting
}: RelativesSectionProps) => {
  const extendedMembers = extendedFamily ?? [];
  const totalCount = items.length + extendedMembers.length;
  const hasExtendedFamily = extendedMembers.length > 0;
  const contentId = `person-detail-section-content-${sectionKey}`;

  return (
    <div className="person-detail-section stack">
      <div className="person-detail-section-header">
        <button
          type="button"
          className="person-detail-section-toggle"
          onClick={onToggleCollapsed}
          aria-expanded={!isCollapsed}
          aria-controls={contentId}
        >
          <h3>{title}</h3>
          <span className="person-detail-section-toggle-indicator" aria-hidden="true">
            {isCollapsed ? "▸" : "▾"}
          </span>
        </button>
        <span className="person-detail-count">{totalCount}</span>
      </div>
      {isCollapsed ? null : (
        <div id={contentId} className="stack">
          {items.length > 0 ? (
            <ul className="relatives-list">
              {items.map((relative) => (
                <li key={relative.key} className="relative-card">
                  <div className="relative-main">
                    <div className="relative-summary">
                      <img
                        className="relative-avatar"
                        src={personThumbnailUrl(relative.relatedId)}
                        alt={relative.relatedName}
                      />
                      <button
                        type="button"
                        className="text-link-button relative-name-button"
                        onClick={() => onFocusPerson(relative.relatedId)}
                      >
                        {relative.relatedName}
                      </button>
                      <span className="relative-pill">{relative.relationshipLabel}</span>
                    </div>
                  </div>
                  <div className="relative-actions">
                    <button
                      type="button"
                      className="icon-action-button"
                      disabled={isSavingRelationship}
                      onClick={() => onStartEditing(relative)}
                      aria-label={`Edit relationship with ${relative.relatedName}`}
                      title={`Edit relationship with ${relative.relatedName}`}
                    >
                      <span aria-hidden="true">✏</span>
                    </button>
                    <button
                      type="button"
                      className="icon-action-button danger-ghost-button"
                      disabled={isSavingRelationship}
                      onClick={() => onStartDeleting(relative.key)}
                      aria-label={`Remove relationship with ${relative.relatedName}`}
                      title={`Remove relationship with ${relative.relatedName}`}
                    >
                      <span aria-hidden="true">🗑</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : emptyMessage && !hasExtendedFamily ? (
            <p className="hint">{emptyMessage}</p>
          ) : null}
          {hasExtendedFamily ? (
            <ul className="relatives-list">
              {extendedMembers.map((member) => (
                <li key={`ext:${member.personId}:${member.label}`} className="relative-card">
                  <div className="relative-main">
                    <div className="relative-summary">
                      <img
                        className="relative-avatar"
                        src={personThumbnailUrl(member.personId)}
                        alt={member.personName}
                      />
                      <button
                        type="button"
                        className="text-link-button relative-name-button"
                        onClick={() => onFocusPerson(member.personId)}
                      >
                        {member.personName}
                      </button>
                      <span className="relative-pill">
                        {resolveExtendedLabel ? resolveExtendedLabel(member) : member.label}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
};

type CollapsibleSectionProps = {
  sectionKey: string;
  title: string;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  count?: string | number;
  subtitle?: string;
  className?: string;
  children: ReactNode;
};

const CollapsibleSection = ({
  sectionKey,
  title,
  isCollapsed,
  onToggleCollapsed,
  count,
  subtitle,
  className,
  children
}: CollapsibleSectionProps) => {
  const contentId = `person-detail-section-content-${sectionKey}`;
  const sectionClassName = className ? `${className} stack` : "person-detail-section stack";
  return (
    <div className={sectionClassName}>
      <div className="person-detail-section-header">
        <button
          type="button"
          className="person-detail-section-toggle"
          onClick={onToggleCollapsed}
          aria-expanded={!isCollapsed}
          aria-controls={contentId}
        >
          <div className="stack">
            <h3>{title}</h3>
            {subtitle ? <p className="hint">{subtitle}</p> : null}
          </div>
          <span className="person-detail-section-toggle-indicator" aria-hidden="true">
            {isCollapsed ? "▸" : "▾"}
          </span>
        </button>
        {count !== undefined ? <span className="person-detail-count">{count}</span> : null}
      </div>
      {isCollapsed ? null : (
        <div id={contentId} className="stack">
          {children}
        </div>
      )}
    </div>
  );
};

const PersonDetailPanelComponent = ({
  person,
  people,
  relationships,
  dismissedSuggestionKeys,
  genders,
  genderValue,
  birthDateValue,
  givenNameValue,
  surnameValue,
  nicknamesValue,
  deathDateValue,
  birthCityValue,
  birthCountryValue,
  onGenderChange,
  onBirthDateChange,
  onGivenNameChange,
  onSurnameChange,
  onNicknamesChange,
  onDeathDateChange,
  onBirthCityChange,
  onBirthCountryChange,
  onProfileSave,
  isSavingProfile,
  onFocusPerson,
  onCreateRelationship,
  onUpdateRelationship,
  onDeleteRelationship,
  onDismissSuggestion,
  isSavingRelationship,
  immichBaseUrl,
  primaryFamilyUnitByPersonId,
  onPrimaryFamilyUnitChange
}: Props) => {
  const [editingRelationshipKey, setEditingRelationshipKey] = useState<string | null>(null);
  const [editingRelationshipType, setEditingRelationshipType] = useState<RelationshipType>("SIBLING_OF");
  const [editingMarriageAnniversaryDate, setEditingMarriageAnniversaryDate] = useState("");
  const [editingDivorceDate, setEditingDivorceDate] = useState("");
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const [visibleSuggestionCount, setVisibleSuggestionCount] = useState(maxVisibleSuggestions);
  const [collapsedSections, setCollapsedSections] =
    useState<SectionCollapsedState>(DEFAULT_COLLAPSED_SECTIONS);
  const peopleById = useMemo(() => new Map(people.map((entry) => [entry.id, entry])), [people]);
  const relationshipsByPersonId = useMemo(() => indexRelationshipsByPersonId(relationships), [relationships]);

  const relatives = useMemo<RelativeItem[]>(() => {
    if (!person) {
      return [];
    }

    const relatedRelationships = relationshipsByPersonId.get(person.id) ?? [];
    const itemsByKey = new Map<string, RelativeItem>();

    relatedRelationships.forEach((relationship) => {
      const isSource = relationship.fromPersonId === person.id;
      const isTarget = relationship.toPersonId === person.id;

      if (!isSource && !isTarget) {
        return;
      }

      const relatedId = isSource ? relationship.toPersonId : relationship.fromPersonId;
      const relatedPerson = peopleById.get(relatedId);
      if (!relatedPerson) {
        return;
      }

      const displayRelationshipType = isSource
        ? inverseRelationshipType(relationship.type)
        : relationship.type;
      const editableRelationshipType = isSource
        ? relationship.type
        : inverseRelationshipType(relationship.type);
      const itemKey = `${relatedId}:${editableRelationshipType}`;
      if (itemsByKey.has(itemKey)) {
        return;
      }

      itemsByKey.set(itemKey, {
        key: itemKey,
        relatedId,
        relatedName: relatedPerson.name,
        displayRelationshipType,
        editableRelationshipType,
        relationshipLabel: getRelativeRelationshipLabel(
          displayRelationshipType,
          relatedPerson.profile?.gender ?? "UNKNOWN"
        ),
        record: relationship
      });
    });

    return [...itemsByKey.values()].sort(
      (left, right) =>
        left.relationshipLabel.localeCompare(right.relationshipLabel) ||
        left.relatedName.localeCompare(right.relatedName)
    );
  }, [peopleById, person, relationshipsByPersonId]);

  const familyRelatives = useMemo(
    () =>
      relatives.filter(
        (r) =>
          r.displayRelationshipType === "PARENT_OF" ||
          r.displayRelationshipType === "CHILD_OF" ||
          r.displayRelationshipType === "SPOUSE_OF" ||
          r.displayRelationshipType === "SIBLING_OF"
      ),
    [relatives]
  );
  const friends = useMemo(
    () => relatives.filter((r) => r.displayRelationshipType === "FRIEND_OF"),
    [relatives]
  );
  const pets = useMemo(() => relatives.filter((r) => r.displayRelationshipType === "PET_OF"), [relatives]);

  const directFamilyIds = useMemo(() => new Set(familyRelatives.map((r) => r.relatedId)), [familyRelatives]);
  const extendedFamily = useMemo(
    () => (person ? computeExtendedFamily(person.id, people, relationships, directFamilyIds) : []),
    [directFamilyIds, people, person, relationships]
  );
  const excludedInLawIds = useMemo(() => {
    const excluded = new Set<string>(directFamilyIds);
    for (const member of extendedFamily) {
      excluded.add(member.personId);
    }
    return excluded;
  }, [directFamilyIds, extendedFamily]);
  const inLaws = useMemo(
    () => (person ? computeInLawFamily(person.id, people, relationships, excludedInLawIds) : []),
    [excludedInLawIds, people, person, relationships]
  );

  const suggestions = useMemo<RelationshipSuggestion[]>(
    () => (person ? computeSuggestions(person.id, people, relationships, dismissedSuggestionKeys) : []),
    [dismissedSuggestionKeys, people, person, relationships]
  );
  const visibleSuggestions = suggestions.slice(0, visibleSuggestionCount);
  const remainingSuggestionCount = suggestions.length - visibleSuggestions.length;
  const primaryFamilyOptions = useMemo(
    () => (person ? buildPrimaryFamilyOptions(person.id, peopleById, relationships) : []),
    [peopleById, person, relationships]
  );
  const selectedPrimaryFamilyUnit =
    person && primaryFamilyOptions.length > 0
      ? primaryFamilyUnitByPersonId[person.id] &&
        primaryFamilyOptions.some((option) => option.key === primaryFamilyUnitByPersonId[person.id])
        ? primaryFamilyUnitByPersonId[person.id]
        : primaryFamilyOptions[0]?.key
      : "";

  const activeRelationship =
    relatives.find((relationship) => relationship.key === editingRelationshipKey) ?? null;
  const pendingDeleteRelationship =
    relatives.find((relationship) => relationship.key === pendingDeleteKey) ?? null;
  const allowedRelationshipOptions = activeRelationship
    ? getAllowedRelationshipOptions(
        activeRelationship.editableRelationshipType,
        person?.name ?? "Selected person",
        activeRelationship.relatedName,
        genderValue
      )
    : [];
  const sourceBirthDate = formatBirthDate(person?.birthDate);
  const hasBirthDateOverride = Boolean(birthDateValue);
  const immichPersonPageUrl = person ? immichPersonUrl(person.id, immichBaseUrl) : null;
  const spouseDatesChanged =
    editingMarriageAnniversaryDate !== (activeRelationship?.record.marriageAnniversaryDate ?? "") ||
    editingDivorceDate !== (activeRelationship?.record.divorceDate ?? "");

  useEffect(() => {
    setEditingRelationshipKey(null);
    setPendingDeleteKey(null);
    setVisibleSuggestionCount(maxVisibleSuggestions);
    setCollapsedSections(DEFAULT_COLLAPSED_SECTIONS);
  }, [person?.id]);

  useEffect(() => {
    if (editingRelationshipKey && !activeRelationship) {
      setEditingRelationshipKey(null);
    }
    if (pendingDeleteKey && !pendingDeleteRelationship) {
      setPendingDeleteKey(null);
    }
  }, [activeRelationship, editingRelationshipKey, pendingDeleteKey, pendingDeleteRelationship]);

  useEffect(() => {
    if (!activeRelationship || activeRelationship.record.type !== "SPOUSE_OF") {
      setEditingMarriageAnniversaryDate("");
      setEditingDivorceDate("");
      return;
    }

    setEditingMarriageAnniversaryDate(activeRelationship.record.marriageAnniversaryDate ?? "");
    setEditingDivorceDate(activeRelationship.record.divorceDate ?? "");
  }, [activeRelationship]);

  const startEditingRelationship = (relationship: RelativeItem) => {
    setEditingRelationshipKey(relationship.key);
    setEditingRelationshipType(relationship.editableRelationshipType);
  };

  const stopEditingRelationship = () => {
    setEditingRelationshipKey(null);
  };

  const toggleSectionCollapsed = (key: SectionCollapseKey) => {
    setCollapsedSections((current) => ({
      ...current,
      [key]: !current[key]
    }));
  };

  const handleRelationshipSave = async () => {
    if (!activeRelationship) {
      return;
    }

    await onUpdateRelationship(
      activeRelationship.record,
      activeRelationship.relatedId,
      editingRelationshipType,
      editingRelationshipType === "SPOUSE_OF"
        ? {
            marriageAnniversaryDate: editingMarriageAnniversaryDate || null,
            divorceDate: editingDivorceDate || null
          }
        : undefined
    );
    setEditingRelationshipKey(null);
  };

  const handleRelationshipDelete = async (relationship: RelativeItem) => {
    await onDeleteRelationship(relationship.record, relationship.relatedId);
    setPendingDeleteKey(null);
    if (editingRelationshipKey === relationship.key) {
      setEditingRelationshipKey(null);
    }
  };

  const handleSuggestionAccept = async (suggestion: RelationshipSuggestion) => {
    if (!person) {
      return;
    }
    await onCreateRelationship(person.id, suggestion.personId, suggestion.suggestedType);
  };

  const handleSuggestionDismiss = (suggestionKey: string) => {
    onDismissSuggestion(suggestionKey);
  };

  return (
    <section className="card person-detail-panel">
      {person ? (
        <div className="stack">
          <div className="person-detail-header">
            {immichPersonPageUrl ? (
              <a
                href={immichPersonPageUrl}
                target="_blank"
                rel="noreferrer"
                className="person-detail-avatar-link"
              >
                <img className="person-detail-avatar" src={personThumbnailUrl(person.id)} alt={person.name} />
              </a>
            ) : (
              <img className="person-detail-avatar" src={personThumbnailUrl(person.id)} alt={person.name} />
            )}
            <div className="person-detail-heading">
              <h3>
                {immichPersonPageUrl ? (
                  <a
                    href={immichPersonPageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="person-detail-name-link"
                  >
                    {person.name}
                  </a>
                ) : (
                  person.name
                )}
              </h3>
              <div className="person-detail-meta">
                <span className="person-detail-meta-item">Immich birth date: {sourceBirthDate}</span>
                <span className="person-detail-meta-item">
                  {familyRelatives.length + extendedFamily.length} relative
                  {familyRelatives.length + extendedFamily.length === 1 ? "" : "s"}
                  {inLaws.length > 0 ? `, ${inLaws.length} in-law${inLaws.length === 1 ? "" : "s"}` : ""}
                  {friends.length > 0 ? `, ${friends.length} friend${friends.length === 1 ? "" : "s"}` : ""}
                  {pets.length > 0 ? `, ${pets.length} pet${pets.length === 1 ? "" : "s"}` : ""}
                </span>
              </div>
            </div>
          </div>
          <CollapsibleSection
            sectionKey="profile"
            title="Profile"
            isCollapsed={collapsedSections.profile}
            onToggleCollapsed={() => toggleSectionCollapsed("profile")}
          >
            <div className="person-detail-form-grid">
              <label className="field-group">
                <span className="field-label">Gender</span>
                <select
                  value={genderValue}
                  onChange={(event) => onGenderChange(event.target.value as Gender)}
                >
                  {genders.map((gender) => (
                    <option key={gender} value={gender}>
                      {formatGenderLabel(gender)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-group">
                <span className="field-label">Birth date override</span>
                <input
                  type="date"
                  value={birthDateValue}
                  onChange={(event) => onBirthDateChange(event.target.value)}
                />
              </label>
              <label className="field-group">
                <span className="field-label">Death date</span>
                <input
                  type="date"
                  value={deathDateValue}
                  onChange={(event) => onDeathDateChange(event.target.value)}
                />
              </label>
              <label className="field-group">
                <span className="field-label">Given name</span>
                <input value={givenNameValue} onChange={(event) => onGivenNameChange(event.target.value)} />
              </label>
              <label className="field-group">
                <span className="field-label">Surname</span>
                <input value={surnameValue} onChange={(event) => onSurnameChange(event.target.value)} />
              </label>
              <label className="field-group">
                <span className="field-label">Nicknames</span>
                <input value={nicknamesValue} onChange={(event) => onNicknamesChange(event.target.value)} />
              </label>
              <label className="field-group">
                <span className="field-label">Birth city</span>
                <input value={birthCityValue} onChange={(event) => onBirthCityChange(event.target.value)} />
              </label>
              <label className="field-group">
                <span className="field-label">Birth country</span>
                <input
                  value={birthCountryValue}
                  onChange={(event) => onBirthCountryChange(event.target.value)}
                />
              </label>
            </div>
            <p className="hint">
              {hasBirthDateOverride
                ? `Override shown in Treemich: ${formatBirthDate(birthDateValue)}`
                : "No override set. Treemich will use the birth date from Immich when available."}
            </p>
            {immichPersonPageUrl ? (
              <a
                className="text-link-button person-detail-immich-link"
                href={immichPersonPageUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open this person in Immich
              </a>
            ) : null}
            {person && primaryFamilyOptions.length > 0 ? (
              <label className="field-group">
                <span className="field-label">Show in family</span>
                <select
                  value={selectedPrimaryFamilyUnit}
                  onChange={(event) => onPrimaryFamilyUnitChange(person.id, event.target.value || null)}
                >
                  {primaryFamilyOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="hint">
                  Choose which parent pair branch this person follows in tree layout.
                </span>
              </label>
            ) : null}
            <button
              className="person-detail-primary-action"
              onClick={onProfileSave}
              disabled={isSavingProfile}
            >
              {isSavingProfile ? "Saving..." : "Save profile"}
            </button>
          </CollapsibleSection>
          <RelativesSection
            sectionKey="relatives"
            title="Relatives"
            items={familyRelatives}
            extendedFamily={extendedFamily}
            isCollapsed={collapsedSections.relatives}
            onToggleCollapsed={() => toggleSectionCollapsed("relatives")}
            onFocusPerson={onFocusPerson}
            isSavingRelationship={isSavingRelationship}
            onStartEditing={startEditingRelationship}
            onStartDeleting={(key) => setPendingDeleteKey(key)}
            emptyMessage="No relatives found yet."
          />
          <RelativesSection
            sectionKey="in-laws"
            title="In-Laws"
            items={[]}
            extendedFamily={inLaws}
            isCollapsed={collapsedSections.inLaws}
            onToggleCollapsed={() => toggleSectionCollapsed("inLaws")}
            onFocusPerson={onFocusPerson}
            resolveExtendedLabel={(member) =>
              getInLawRelationshipLabel(
                member.label,
                peopleById.get(member.personId)?.profile?.gender ?? "UNKNOWN"
              )
            }
            isSavingRelationship={isSavingRelationship}
            onStartEditing={startEditingRelationship}
            onStartDeleting={(key) => setPendingDeleteKey(key)}
            emptyMessage="No in-laws found yet."
          />
          {suggestions.length > 0 ? (
            <CollapsibleSection
              sectionKey="suggestions"
              title="Suggested Relationships"
              subtitle="Suggestions are inferred from the existing family graph."
              count={
                suggestions.length > visibleSuggestions.length
                  ? `${visibleSuggestions.length} of ${suggestions.length}`
                  : suggestions.length
              }
              isCollapsed={collapsedSections.suggestions}
              onToggleCollapsed={() => toggleSectionCollapsed("suggestions")}
            >
              <ul className="relatives-list">
                {visibleSuggestions.map((suggestion) => {
                  const acceptLabel = isSavingRelationship
                    ? "Saving..."
                    : `Add as ${getSuggestionRelationshipLabel(suggestion.suggestedType)}`;
                  return (
                    <li key={suggestion.key} className="relative-card suggestion-card">
                      <div className="relative-main suggestion-main">
                        <div className="relative-summary">
                          <img
                            className="relative-avatar"
                            src={personThumbnailUrl(suggestion.personId)}
                            alt={suggestion.personName}
                          />
                          <button
                            type="button"
                            className="text-link-button relative-name-button"
                            onClick={() => onFocusPerson(suggestion.personId)}
                          >
                            {suggestion.personName}
                          </button>
                          <span className="relative-pill">
                            {getSuggestionRelationshipLabel(suggestion.suggestedType)}
                          </span>
                        </div>
                        <p className="hint suggestion-reason">{suggestion.reason}</p>
                      </div>
                      <div className="relative-actions suggestion-actions">
                        <button
                          type="button"
                          className="icon-action-button suggestion-accept-button"
                          disabled={isSavingRelationship}
                          onClick={() => void handleSuggestionAccept(suggestion)}
                          aria-label={acceptLabel}
                          title={acceptLabel}
                        >
                          <span aria-hidden="true">✓</span>
                        </button>
                        <button
                          type="button"
                          className="icon-action-button suggestion-dismiss-button"
                          disabled={isSavingRelationship}
                          onClick={() => handleSuggestionDismiss(suggestion.key)}
                          aria-label="Dismiss"
                          title="Dismiss"
                        >
                          <span aria-hidden="true">✕</span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {remainingSuggestionCount > 0 ? (
                <button
                  type="button"
                  className="secondary-button suggestion-show-more-button"
                  onClick={() => setVisibleSuggestionCount(suggestions.length)}
                  disabled={isSavingRelationship}
                >
                  Show {remainingSuggestionCount} more suggestion
                  {remainingSuggestionCount === 1 ? "" : "s"}
                </button>
              ) : null}
            </CollapsibleSection>
          ) : null}
          {friends.length > 0 ? (
            <RelativesSection
              sectionKey="friends"
              title="Friends"
              items={friends}
              isCollapsed={collapsedSections.friends}
              onToggleCollapsed={() => toggleSectionCollapsed("friends")}
              onFocusPerson={onFocusPerson}
              isSavingRelationship={isSavingRelationship}
              onStartEditing={startEditingRelationship}
              onStartDeleting={(key) => setPendingDeleteKey(key)}
            />
          ) : null}
          {pets.length > 0 ? (
            <RelativesSection
              sectionKey="pets"
              title="Pets"
              items={pets}
              isCollapsed={collapsedSections.pets}
              onToggleCollapsed={() => toggleSectionCollapsed("pets")}
              onFocusPerson={onFocusPerson}
              isSavingRelationship={isSavingRelationship}
              onStartEditing={startEditingRelationship}
              onStartDeleting={(key) => setPendingDeleteKey(key)}
            />
          ) : null}
          {activeRelationship ? (
            <CollapsibleSection
              sectionKey="edit-relationship"
              title="Edit relationship"
              subtitle={`Change how ${person.name} is related to ${activeRelationship.relatedName}.`}
              isCollapsed={collapsedSections.editRelationship}
              onToggleCollapsed={() => toggleSectionCollapsed("editRelationship")}
              className="relationship-editor"
            >
              <button type="button" className="text-link-button" onClick={stopEditingRelationship}>
                Close
              </button>
              <div className="person-detail-inline-summary">
                <span className="relative-pill">{activeRelationship.relationshipLabel}</span>
                <span className="hint">Editing link with {activeRelationship.relatedName}</span>
              </div>
              <p className="hint">
                {activeRelationship.editableRelationshipType === "PARENT_OF" ||
                activeRelationship.editableRelationshipType === "CHILD_OF"
                  ? "Parent and child links can be swapped."
                  : activeRelationship.editableRelationshipType === "SPOUSE_OF" ||
                      activeRelationship.editableRelationshipType === "SIBLING_OF"
                    ? "Spouse and sibling links can be swapped."
                    : "Friend and pet links can be swapped."}
              </p>
              <label className="field-group">
                <span className="field-label">Relationship type</span>
                <select
                  value={editingRelationshipType}
                  onChange={(event) => setEditingRelationshipType(event.target.value as RelationshipType)}
                >
                  {allowedRelationshipOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {editingRelationshipType === "SPOUSE_OF" ? (
                <div className="person-detail-form-grid">
                  <label className="field-group">
                    <span className="field-label">Marriage anniversary</span>
                    <input
                      type="date"
                      value={editingMarriageAnniversaryDate}
                      onChange={(event) => setEditingMarriageAnniversaryDate(event.target.value)}
                    />
                  </label>
                  <label className="field-group">
                    <span className="field-label">Divorce date</span>
                    <input
                      type="date"
                      value={editingDivorceDate}
                      onChange={(event) => setEditingDivorceDate(event.target.value)}
                    />
                  </label>
                </div>
              ) : null}
              <div className="add-relative-actions">
                <button
                  type="button"
                  disabled={
                    isSavingRelationship ||
                    (editingRelationshipType === activeRelationship.editableRelationshipType &&
                      (editingRelationshipType !== "SPOUSE_OF" || !spouseDatesChanged))
                  }
                  onClick={() => void handleRelationshipSave()}
                >
                  {isSavingRelationship ? "Saving..." : "Save relationship"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={stopEditingRelationship}
                  disabled={isSavingRelationship}
                >
                  Cancel
                </button>
              </div>
            </CollapsibleSection>
          ) : null}
          {pendingDeleteRelationship ? (
            <CollapsibleSection
              sectionKey="remove-relationship"
              title="Remove relationship"
              subtitle={`Remove the relationship between ${person.name} and ${pendingDeleteRelationship.relatedName}.`}
              isCollapsed={collapsedSections.removeRelationship}
              onToggleCollapsed={() => toggleSectionCollapsed("removeRelationship")}
              className="relationship-editor danger-surface"
            >
              <button
                type="button"
                className="text-link-button"
                onClick={() => setPendingDeleteKey(null)}
                disabled={isSavingRelationship}
              >
                Close
              </button>
              <p className="hint">This will remove the link in both directions for this pair.</p>
              <div className="add-relative-actions">
                <button
                  type="button"
                  className="secondary-button danger-button"
                  disabled={isSavingRelationship}
                  onClick={() => void handleRelationshipDelete(pendingDeleteRelationship)}
                >
                  {isSavingRelationship ? "Removing..." : "Remove relationship"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setPendingDeleteKey(null)}
                  disabled={isSavingRelationship}
                >
                  Cancel
                </button>
              </div>
            </CollapsibleSection>
          ) : null}
        </div>
      ) : (
        <p className="hint">Click a person in the graph to see their details.</p>
      )}
    </section>
  );
};

export const PersonDetailPanel = memo(PersonDetailPanelComponent);
