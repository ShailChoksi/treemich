/**
 * @file People page sidebar: profile, relatives, life events, timeline, names, research tasks, validation.
 */

import type { CreateLifeEventBody, CreateResearchTaskBody, PatchLifeEventBody } from "@treemich/shared";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type {
  FamilyRecord,
  Gender,
  Person,
  LifeEventRecord,
  MediaObjectRecord,
  PatchFamilyBody,
  RelationshipRecord,
  RelationshipType,
  ResearchTaskRecord,
  TargetMediaLinkRecord,
  TimelineEventRecord
} from "../lib/api";
import { immichPersonUrl, personThumbnailUrl } from "../lib/api";
import { deriveSpouseDatesFromRelationshipEvents } from "../lib/lifeEventUi";
import { getPersonDisplayLabel } from "../lib/personDisplay";
import { FAMILY_RELATIONSHIP_TYPES, RELATIONSHIP_TYPES } from "../lib/relationshipConstants";
import { LifeEventsSection } from "./personDetail/LifeEventsSection";
import { PersonNamesSection } from "./personDetail/PersonNamesSection";
import { PersonTimelineSection } from "./personDetail/PersonTimelineSection";
import { FamiliesSection } from "./personDetail/FamiliesSection";
import { ConnectedResearchTasksSection, ResearchTasksSection } from "./personDetail/ResearchTasksSection";
import { SpouseLifeEventsRichPane } from "./personDetail/SpouseLifeEventsRichPane";
import { computeExtendedFamily, computeInLawFamily } from "./graph/extendedFamily";
import { inverseRelationshipType } from "./graph/layout";
import {
  computeSuggestions,
  getSuggestionRelationshipLabel,
  type RelationshipSuggestion
} from "./graph/relationshipSuggestions";
import { usePersonDetailPanelProps } from "../pages/usePersonDetailPanelProps";
import { CollapsibleSection } from "./personDetail/CollapsibleSection";
import {
  buildPrimaryFamilyOptions,
  formatBirthDate,
  formatGenderLabel,
  getAllowedRelationshipOptions,
  getInLawRelationshipLabel,
  getRelativeRelationshipLabel,
  indexRelationshipsByPersonId
} from "./personDetail/personDetailHelpers";
import { RelativesSection } from "./personDetail/RelativesSection";
import type { RelativeItem } from "./personDetail/types";
import { DestructiveConfirmDialog } from "./DestructiveConfirmDialog";

export {
  getRelativeRelationshipLabel,
  indexRelationshipsByPersonId
} from "./personDetail/personDetailHelpers";

const DEFAULT_COLLAPSED_SECTIONS = {
  profile: false,
  names: true,
  relatives: false,
  inLaws: false,
  suggestions: false,
  friends: false,
  pets: false,
  editRelationship: false,
  removeRelationship: false,
  lifeEvents: true,
  timeline: true,
  researchTasks: true,
  families: true
} as const;

type SectionCollapseKey = keyof typeof DEFAULT_COLLAPSED_SECTIONS;
type SectionCollapsedState = Record<SectionCollapseKey, boolean>;

export type PersonDetailPanelProps = {
  person: Person | null;
  people: Person[];
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
  onDeletePerson?: () => Promise<void>;
  onThumbnailUpload?: (file: File) => Promise<void>;
  onImmichThumbnailImport?: () => Promise<void>;
  onImmichIdentityLink?: (providerPersonId: string) => Promise<void>;
  onImmichIdentityUnlink?: (identityId: string) => Promise<void>;
  onDismissSuggestion: (suggestionKey: string) => void;
  isSavingRelationship: boolean;
  immichBaseUrl?: string | null;
  primaryFamilyUnitByPersonId: Record<string, string>;
  onPrimaryFamilyUnitChange: (personId: string, unitKey: string | null) => void;
  /** Cached relationship-scoped life events (marriage/divorce), keyed by relationship id */
  relationshipLifeEventsById?: Record<string, LifeEventRecord[]>;
  personLifeEvents?: LifeEventRecord[];
  onPersonLifeEventCreate?: (body: CreateLifeEventBody) => Promise<void>;
  onPersonLifeEventPatch?: (eventId: string, body: PatchLifeEventBody) => Promise<void>;
  onPersonLifeEventDelete?: (eventId: string) => Promise<void>;
  onRelationshipLifeEventCreate?: (relationshipId: string, body: CreateLifeEventBody) => Promise<void>;
  onRelationshipLifeEventPatch?: (
    relationshipId: string,
    eventId: string,
    body: PatchLifeEventBody
  ) => Promise<void>;
  onRelationshipLifeEventDelete?: (relationshipId: string, eventId: string) => Promise<void>;
  onPersonNamesChanged?: () => void;
  personTimeline?: TimelineEventRecord[];
  researchTasks?: ResearchTaskRecord[];
  /** Loaded family unions for this person; omit until fetched from `GET /people/:id/families`. */
  families?: FamilyRecord[];
  onFamilyPatch?: (familyId: string, body: PatchFamilyBody) => Promise<void>;
  onFamilyDelete?: (familyId: string) => Promise<void>;
  savingFamilyId?: string | null;
  familyMediaLinksById?: Partial<Record<string, TargetMediaLinkRecord[]>>;
  mediaObjects?: MediaObjectRecord[];
  mediaManagementEnabled?: boolean;
  onFamilyMediaLinkCreate?: (familyId: string, mediaObjectId: string) => Promise<void>;
  onFamilyMediaLinkDelete?: (linkId: string) => Promise<void>;
  /** Cached family-scoped life events (residence/census/custom), keyed by family id */
  familyLifeEventsById?: Partial<Record<string, LifeEventRecord[]>>;
  onFamilyLifeEventCreate?: (familyId: string, body: CreateLifeEventBody) => Promise<void>;
  onFamilyLifeEventPatch?: (familyId: string, eventId: string, body: PatchLifeEventBody) => Promise<void>;
  onFamilyLifeEventDelete?: (familyId: string, eventId: string) => Promise<void>;
  onResearchTaskCreate?: (body: CreateResearchTaskBody) => Promise<void>;
  onResearchTaskUpdate?: (
    taskId: string,
    patch: Partial<Pick<ResearchTaskRecord, "title" | "status" | "dueDate" | "notes" | "personId">>
  ) => Promise<void>;
  onResearchTaskDelete?: (taskId: string) => Promise<void>;
  /** When set, merged into collapsed-section state when the selected person changes (true = collapsed). */
  sectionCollapsedOverrides?: Partial<SectionCollapsedState>;
};

type Props = PersonDetailPanelProps;

const maxVisibleSuggestions = 5;

/**
 * People-page sidebar: profile quick edit, relatives, life events, timeline, names, tasks, validation.
 * The default export `PersonDetailPanel` is `memo()` of this component to limit re-renders.
 */
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
  onDeletePerson,
  onThumbnailUpload,
  onImmichThumbnailImport,
  onImmichIdentityLink,
  onImmichIdentityUnlink,
  onDismissSuggestion,
  isSavingRelationship,
  immichBaseUrl,
  primaryFamilyUnitByPersonId,
  onPrimaryFamilyUnitChange,
  relationshipLifeEventsById = {},
  personLifeEvents,
  onPersonLifeEventCreate,
  onPersonLifeEventPatch,
  onPersonLifeEventDelete,
  onRelationshipLifeEventCreate,
  onRelationshipLifeEventPatch,
  onRelationshipLifeEventDelete,
  onPersonNamesChanged,
  personTimeline,
  researchTasks,
  families,
  onFamilyPatch,
  onFamilyDelete,
  savingFamilyId,
  familyMediaLinksById,
  mediaObjects,
  mediaManagementEnabled,
  onFamilyMediaLinkCreate,
  onFamilyMediaLinkDelete,
  familyLifeEventsById,
  onFamilyLifeEventCreate,
  onFamilyLifeEventPatch,
  onFamilyLifeEventDelete,
  onResearchTaskCreate,
  onResearchTaskUpdate,
  onResearchTaskDelete,
  sectionCollapsedOverrides
}: Props) => {
  const [editingRelationshipKey, setEditingRelationshipKey] = useState<string | null>(null);
  const [editingRelationshipType, setEditingRelationshipType] = useState<RelationshipType>(
    RELATIONSHIP_TYPES.siblingOf
  );
  const [editingMarriageAnniversaryDate, setEditingMarriageAnniversaryDate] = useState("");
  const [editingDivorceDate, setEditingDivorceDate] = useState("");
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const [showDeletePersonConfirm, setShowDeletePersonConfirm] = useState(false);
  const [isDeletingPerson, setIsDeletingPerson] = useState(false);
  const [isSavingProviderLink, setIsSavingProviderLink] = useState(false);
  const [immichProviderPersonId, setImmichProviderPersonId] = useState("");
  const [visibleSuggestionCount, setVisibleSuggestionCount] = useState(maxVisibleSuggestions);
  const [collapsedSections, setCollapsedSections] = useState<SectionCollapsedState>(() => ({
    ...DEFAULT_COLLAPSED_SECTIONS,
    ...sectionCollapsedOverrides
  }));
  const relationshipEditorFirstFieldRef = useRef<HTMLSelectElement | null>(null);
  const relationshipDeleteConfirmRef = useRef<HTMLButtonElement | null>(null);
  const relationshipActionReturnFocusRef = useRef<HTMLElement | null>(null);
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
    () => relatives.filter((r) => FAMILY_RELATIONSHIP_TYPES.has(r.displayRelationshipType)),
    [relatives]
  );
  const friends = useMemo(
    () => relatives.filter((r) => r.displayRelationshipType === RELATIONSHIP_TYPES.friendOf),
    [relatives]
  );
  const pets = useMemo(
    () => relatives.filter((r) => r.displayRelationshipType === RELATIONSHIP_TYPES.petOf),
    [relatives]
  );

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
  const immichIdentity =
    person?.externalIdentities?.find((identity) => identity.provider === "IMMICH") ?? null;
  const immichPersonPageUrl = immichIdentity
    ? immichPersonUrl(immichIdentity.providerPersonId, immichBaseUrl)
    : null;
  const spouseDisplay = useMemo(() => {
    if (!activeRelationship || activeRelationship.record.type !== RELATIONSHIP_TYPES.spouseOf) {
      return { marriage: "", divorce: "" };
    }
    const rid = activeRelationship.record.id;
    const events = rid ? (relationshipLifeEventsById[rid] ?? []) : [];
    return deriveSpouseDatesFromRelationshipEvents(events);
  }, [activeRelationship, relationshipLifeEventsById]);

  const spouseDatesChanged =
    editingMarriageAnniversaryDate !== spouseDisplay.marriage || editingDivorceDate !== spouseDisplay.divorce;

  useEffect(() => {
    setEditingRelationshipKey(null);
    setPendingDeleteKey(null);
    setShowDeletePersonConfirm(false);
    setVisibleSuggestionCount(maxVisibleSuggestions);
    setCollapsedSections({ ...DEFAULT_COLLAPSED_SECTIONS, ...sectionCollapsedOverrides });
    // Intentionally depends on `person?.id` only: `sectionCollapsedOverrides` is often a new object
    // literal in JSX; including it would reset collapse state every parent render.
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
    if (!activeRelationship || activeRelationship.record.type !== RELATIONSHIP_TYPES.spouseOf) {
      setEditingMarriageAnniversaryDate("");
      setEditingDivorceDate("");
      return;
    }

    setEditingMarriageAnniversaryDate(spouseDisplay.marriage);
    setEditingDivorceDate(spouseDisplay.divorce);
  }, [activeRelationship, spouseDisplay.marriage, spouseDisplay.divorce]);

  useEffect(() => {
    if (activeRelationship) {
      relationshipEditorFirstFieldRef.current?.focus();
    }
  }, [activeRelationship]);

  useEffect(() => {
    if (pendingDeleteRelationship) {
      relationshipDeleteConfirmRef.current?.focus();
    }
  }, [pendingDeleteRelationship]);

  const startEditingRelationship = (relationship: RelativeItem) => {
    relationshipActionReturnFocusRef.current = document.activeElement as HTMLElement | null;
    setEditingRelationshipKey(relationship.key);
    setEditingRelationshipType(relationship.editableRelationshipType);
  };

  const stopEditingRelationship = () => {
    setEditingRelationshipKey(null);
    relationshipActionReturnFocusRef.current?.focus?.();
  };

  const startDeletingRelationship = (key: string) => {
    relationshipActionReturnFocusRef.current = document.activeElement as HTMLElement | null;
    setPendingDeleteKey(key);
  };

  const stopDeletingRelationship = () => {
    setPendingDeleteKey(null);
    relationshipActionReturnFocusRef.current?.focus?.();
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
      editingRelationshipType === RELATIONSHIP_TYPES.spouseOf
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

  const handleDeletePerson = async () => {
    if (!onDeletePerson) {
      return;
    }
    setIsDeletingPerson(true);
    try {
      await onDeletePerson();
      setShowDeletePersonConfirm(false);
    } finally {
      setIsDeletingPerson(false);
    }
  };

  const handleThumbnailUpload = async (file: File | null | undefined) => {
    if (!file || !onThumbnailUpload) {
      return;
    }
    setIsSavingProviderLink(true);
    try {
      await onThumbnailUpload(file);
    } finally {
      setIsSavingProviderLink(false);
    }
  };

  const handleImportImmichThumbnail = async () => {
    if (!onImmichThumbnailImport) {
      return;
    }
    setIsSavingProviderLink(true);
    try {
      await onImmichThumbnailImport();
    } finally {
      setIsSavingProviderLink(false);
    }
  };

  const handleLinkImmichIdentity = async () => {
    const providerPersonId = immichProviderPersonId.trim();
    if (!providerPersonId || !onImmichIdentityLink) {
      return;
    }
    setIsSavingProviderLink(true);
    try {
      await onImmichIdentityLink(providerPersonId);
      setImmichProviderPersonId("");
    } finally {
      setIsSavingProviderLink(false);
    }
  };

  const handleUnlinkImmichIdentity = async () => {
    if (!immichIdentity || !onImmichIdentityUnlink) {
      return;
    }
    setIsSavingProviderLink(true);
    try {
      await onImmichIdentityUnlink(immichIdentity.id);
    } finally {
      setIsSavingProviderLink(false);
    }
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
                    {getPersonDisplayLabel(person)}
                  </a>
                ) : (
                  getPersonDisplayLabel(person)
                )}
              </h3>
              <div className="person-detail-meta">
                <span className="person-detail-meta-item">Birth date: {sourceBirthDate}</span>
                <span className="person-detail-meta-item">
                  {familyRelatives.length + extendedFamily.length} relative
                  {familyRelatives.length + extendedFamily.length === 1 ? "" : "s"}
                  {inLaws.length > 0 ? `, ${inLaws.length} in-law${inLaws.length === 1 ? "" : "s"}` : ""}
                  {friends.length > 0 ? `, ${friends.length} friend${friends.length === 1 ? "" : "s"}` : ""}
                  {pets.length > 0 ? `, ${pets.length} pet${pets.length === 1 ? "" : "s"}` : ""}
                </span>
              </div>
            </div>
            {onDeletePerson ? (
              <button
                type="button"
                className="secondary-button danger-button"
                onClick={() => setShowDeletePersonConfirm(true)}
                disabled={isSavingProfile || isSavingRelationship || isDeletingPerson}
              >
                Delete person
              </button>
            ) : null}
          </div>
          <DestructiveConfirmDialog
            open={showDeletePersonConfirm}
            title={`Delete ${getPersonDisplayLabel(person)}?`}
            description={`This will permanently delete ${getPersonDisplayLabel(
              person
            )} and all their life events, relationships, and research notes. Family units they belonged to will lose them as a member but the family itself will not be deleted.`}
            confirmLabel="Delete person"
            busy={isDeletingPerson}
            onConfirm={handleDeletePerson}
            onCancel={() => setShowDeletePersonConfirm(false)}
          />
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
                <span className="field-label">Birth date</span>
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
            <div className="person-provider-controls">
              <label className="field-group">
                <span className="field-label">Treemich thumbnail</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={!onThumbnailUpload || isSavingProviderLink}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    void handleThumbnailUpload(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              {immichIdentity ? (
                <div className="provider-link-card">
                  <span className="field-label">Linked Immich identity</span>
                  <span className="hint">
                    {immichIdentity.displayName || immichIdentity.providerPersonId}
                  </span>
                  <div className="toolbar-row">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!onImmichThumbnailImport || isSavingProviderLink}
                      onClick={() => void handleImportImmichThumbnail()}
                    >
                      Import Immich thumbnail
                    </button>
                    <button
                      type="button"
                      className="secondary-button danger-button"
                      disabled={!onImmichIdentityUnlink || isSavingProviderLink}
                      onClick={() => void handleUnlinkImmichIdentity()}
                    >
                      Unlink Immich
                    </button>
                  </div>
                </div>
              ) : (
                <div className="provider-link-card">
                  <label className="field-group">
                    <span className="field-label">Immich person ID</span>
                    <input
                      value={immichProviderPersonId}
                      onChange={(event) => setImmichProviderPersonId(event.target.value)}
                      placeholder="Optional provider identity"
                      disabled={!onImmichIdentityLink || isSavingProviderLink}
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!onImmichIdentityLink || !immichProviderPersonId.trim() || isSavingProviderLink}
                    onClick={() => void handleLinkImmichIdentity()}
                  >
                    Link Immich identity
                  </button>
                </div>
              )}
            </div>
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
            onStartDeleting={startDeletingRelationship}
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
            onStartDeleting={startDeletingRelationship}
            emptyMessage="No in-laws found yet."
          />
          {person ? (
            <CollapsibleSection
              sectionKey="names"
              title="Names (Treemich)"
              infoTooltip="Add alternate names used for display and search. Immich names are unchanged."
              isCollapsed={collapsedSections.names}
              onToggleCollapsed={() => toggleSectionCollapsed("names")}
            >
              <PersonNamesSection
                personId={person.id}
                onNamesChanged={onPersonNamesChanged}
                disabled={isSavingProfile || isSavingRelationship}
              />
            </CollapsibleSection>
          ) : null}
          {person ? (
            <CollapsibleSection
              sectionKey="timeline"
              title="Timeline"
              infoTooltip="Chronological list of this person’s life events."
              isCollapsed={collapsedSections.timeline}
              onToggleCollapsed={() => toggleSectionCollapsed("timeline")}
            >
              <PersonTimelineSection timeline={personTimeline} />
            </CollapsibleSection>
          ) : null}
          {person ? (
            <CollapsibleSection
              sectionKey="research-tasks"
              title="Research tasks"
              infoTooltip="Track unresolved questions and next research steps."
              isCollapsed={collapsedSections.researchTasks}
              onToggleCollapsed={() => toggleSectionCollapsed("researchTasks")}
            >
              {onResearchTaskCreate && onResearchTaskUpdate && onResearchTaskDelete ? (
                <ResearchTasksSection
                  personId={person.id}
                  tasks={researchTasks}
                  disabled={isSavingProfile || isSavingRelationship}
                  onCreate={onResearchTaskCreate}
                  onUpdate={onResearchTaskUpdate}
                  onDelete={onResearchTaskDelete}
                />
              ) : (
                <ConnectedResearchTasksSection
                  personId={person.id}
                  disabled={isSavingProfile || isSavingRelationship}
                />
              )}
            </CollapsibleSection>
          ) : null}
          {person && families !== undefined ? (
            <CollapsibleSection
              sectionKey="families"
              title="Family units"
              infoTooltip="GEDCOM-style unions (parents + children + pedigree). Graph parent/child edges are derived from these rows."
              isCollapsed={collapsedSections.families}
              onToggleCollapsed={() => toggleSectionCollapsed("families")}
            >
              <FamiliesSection
                person={person}
                people={people}
                families={families}
                onPatchFamily={onFamilyPatch}
                onDeleteFamily={onFamilyDelete}
                savingFamilyId={savingFamilyId}
                familyMediaLinksById={familyMediaLinksById}
                mediaObjects={mediaObjects}
                mediaManagementEnabled={mediaManagementEnabled}
                onFamilyMediaLinkCreate={onFamilyMediaLinkCreate}
                onFamilyMediaLinkDelete={onFamilyMediaLinkDelete}
                familyLifeEventsById={familyLifeEventsById}
                onFamilyLifeEventCreate={onFamilyLifeEventCreate}
                onFamilyLifeEventPatch={onFamilyLifeEventPatch}
                onFamilyLifeEventDelete={onFamilyLifeEventDelete}
              />
            </CollapsibleSection>
          ) : null}
          {person && onPersonLifeEventCreate && onPersonLifeEventPatch && onPersonLifeEventDelete ? (
            <CollapsibleSection
              sectionKey="life-events"
              title="Life events (advanced)"
              infoTooltip="Advanced editor for partial dates, notes, place details, and citations."
              isCollapsed={collapsedSections.lifeEvents}
              onToggleCollapsed={() => toggleSectionCollapsed("lifeEvents")}
            >
              <LifeEventsSection
                personId={person.id}
                personLifeEvents={personLifeEvents}
                onCreate={onPersonLifeEventCreate}
                onPatch={onPersonLifeEventPatch}
                onDelete={onPersonLifeEventDelete}
                disabled={isSavingProfile || isSavingRelationship}
              />
            </CollapsibleSection>
          ) : null}
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
              onStartDeleting={startDeletingRelationship}
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
              onStartDeleting={startDeletingRelationship}
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
                {activeRelationship.editableRelationshipType === RELATIONSHIP_TYPES.parentOf ||
                activeRelationship.editableRelationshipType === RELATIONSHIP_TYPES.childOf
                  ? "Parent and child links can be swapped."
                  : activeRelationship.editableRelationshipType === RELATIONSHIP_TYPES.spouseOf ||
                      activeRelationship.editableRelationshipType === RELATIONSHIP_TYPES.siblingOf
                    ? "Spouse and sibling links can be swapped."
                    : "Friend and pet links can be swapped."}
              </p>
              <label className="field-group">
                <span className="field-label">Relationship type</span>
                <select
                  ref={relationshipEditorFirstFieldRef}
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
              {editingRelationshipType === RELATIONSHIP_TYPES.spouseOf ? (
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
              {editingRelationshipType === RELATIONSHIP_TYPES.spouseOf &&
              activeRelationship.record.id &&
              onRelationshipLifeEventCreate &&
              onRelationshipLifeEventPatch &&
              onRelationshipLifeEventDelete ? (
                <SpouseLifeEventsRichPane
                  events={relationshipLifeEventsById[activeRelationship.record.id] ?? []}
                  onCreate={(body) => onRelationshipLifeEventCreate(activeRelationship.record.id!, body)}
                  onPatch={(eventId, body) =>
                    onRelationshipLifeEventPatch(activeRelationship.record.id!, eventId, body)
                  }
                  onDelete={(eventId) =>
                    onRelationshipLifeEventDelete(activeRelationship.record.id!, eventId)
                  }
                  disabled={isSavingRelationship}
                />
              ) : null}
              <div className="add-relative-actions">
                <button
                  type="button"
                  disabled={
                    isSavingRelationship ||
                    (editingRelationshipType === activeRelationship.editableRelationshipType &&
                      (editingRelationshipType !== RELATIONSHIP_TYPES.spouseOf || !spouseDatesChanged))
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
                onClick={stopDeletingRelationship}
                disabled={isSavingRelationship}
              >
                Close
              </button>
              <p className="hint">This will remove the link in both directions for this pair.</p>
              <div className="add-relative-actions">
                <button
                  ref={relationshipDeleteConfirmRef}
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
                  onClick={stopDeletingRelationship}
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

/** Memoized sidebar when props are supplied explicitly (tests, stories). */
export const PersonDetailPanelWithProps = memo(PersonDetailPanelComponent);

const PersonDetailPanelConnected = () => <PersonDetailPanelWithProps {...usePersonDetailPanelProps()} />;

/** Default people-page sidebar: reads graph + detail context via {@link usePersonDetailPanelProps}. */
export const PersonDetailPanel = memo(PersonDetailPanelConnected);
