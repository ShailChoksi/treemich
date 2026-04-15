import { memo, useEffect, useMemo, useState } from "react";
import type { Gender, ImmichPerson, RelationshipRecord, RelationshipType } from "../lib/api";
import { personThumbnailUrl } from "../lib/api";
import { inverseRelationshipType } from "./graph/layout";

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
  genders: Gender[];
  genderValue: Gender;
  birthDateValue: string;
  onGenderChange: (gender: Gender) => void;
  onBirthDateChange: (birthDate: string) => void;
  onProfileSave: () => void;
  isSavingProfile: boolean;
  onFocusPerson: (personId: string) => void;
  onUpdateRelationship: (
    relationship: RelationshipRecord,
    relatedPersonId: string,
    relationshipType: RelationshipType
  ) => Promise<void>;
  onDeleteRelationship: (relationship: RelationshipRecord, relatedPersonId: string) => Promise<void>;
  isSavingRelationship: boolean;
};

const relationshipLabel: Record<RelationshipRecord["type"], string> = {
  PARENT_OF: "Parent",
  CHILD_OF: "Child",
  SPOUSE_OF: "Spouse",
  SIBLING_OF: "Sibling",
  FRIEND_OF: "Friend",
  PET_OF: "Pet"
};

const relationshipEditorLabel = (
  relationshipType: RelationshipType,
  personName: string,
  relatedName: string
) => {
  if (relationshipType === "PARENT_OF") {
    return `${personName} is parent of ${relatedName}`;
  }
  if (relationshipType === "CHILD_OF") {
    return `${personName} is child of ${relatedName}`;
  }
  if (relationshipType === "SPOUSE_OF") {
    return `${personName} is spouse of ${relatedName}`;
  }
  if (relationshipType === "FRIEND_OF") {
    return `${personName} is friend of ${relatedName}`;
  }
  if (relationshipType === "PET_OF") {
    return `${personName} has pet ${relatedName}`;
  }
  return `${personName} is sibling of ${relatedName}`;
};

const getAllowedRelationshipOptions = (
  relationshipType: RelationshipType,
  personName: string,
  relatedName: string
) => {
  const relationshipOptions: Array<{ value: RelationshipType; label: string }> = [
    { value: "PARENT_OF", label: relationshipEditorLabel("PARENT_OF", personName, relatedName) },
    { value: "CHILD_OF", label: relationshipEditorLabel("CHILD_OF", personName, relatedName) },
    { value: "SPOUSE_OF", label: relationshipEditorLabel("SPOUSE_OF", personName, relatedName) },
    { value: "SIBLING_OF", label: relationshipEditorLabel("SIBLING_OF", personName, relatedName) },
    { value: "FRIEND_OF", label: relationshipEditorLabel("FRIEND_OF", personName, relatedName) },
    { value: "PET_OF", label: relationshipEditorLabel("PET_OF", personName, relatedName) }
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

const PersonDetailPanelComponent = ({
  person,
  people,
  relationships,
  genders,
  genderValue,
  birthDateValue,
  onGenderChange,
  onBirthDateChange,
  onProfileSave,
  isSavingProfile,
  onFocusPerson,
  onUpdateRelationship,
  onDeleteRelationship,
  isSavingRelationship
}: Props) => {
  const [editingRelationshipKey, setEditingRelationshipKey] = useState<string | null>(null);
  const [editingRelationshipType, setEditingRelationshipType] = useState<RelationshipType>("SIBLING_OF");
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);

  const relatives = useMemo<RelativeItem[]>(() => {
    if (!person) {
      return [];
    }

    const peopleById = new Map(people.map((entry) => [entry.id, entry]));
    const itemsByKey = new Map<string, RelativeItem>();

    relationships.forEach((relationship) => {
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
        relationshipLabel: relationshipLabel[displayRelationshipType],
        record: relationship
      });
    });

    return [...itemsByKey.values()].sort(
      (left, right) =>
        left.relationshipLabel.localeCompare(right.relationshipLabel) ||
        left.relatedName.localeCompare(right.relatedName)
    );
  }, [people, person, relationships]);

  const activeRelationship =
    relatives.find((relationship) => relationship.key === editingRelationshipKey) ?? null;
  const pendingDeleteRelationship =
    relatives.find((relationship) => relationship.key === pendingDeleteKey) ?? null;
  const allowedRelationshipOptions = activeRelationship
    ? getAllowedRelationshipOptions(
        activeRelationship.editableRelationshipType,
        person?.name ?? "Selected person",
        activeRelationship.relatedName
      )
    : [];
  const sourceBirthDate = formatBirthDate(person?.birthDate);
  const hasBirthDateOverride = Boolean(birthDateValue);

  useEffect(() => {
    setEditingRelationshipKey(null);
    setPendingDeleteKey(null);
  }, [person?.id]);

  useEffect(() => {
    if (editingRelationshipKey && !activeRelationship) {
      setEditingRelationshipKey(null);
    }
    if (pendingDeleteKey && !pendingDeleteRelationship) {
      setPendingDeleteKey(null);
    }
  }, [activeRelationship, editingRelationshipKey, pendingDeleteKey, pendingDeleteRelationship]);

  const startEditingRelationship = (relationship: RelativeItem) => {
    setEditingRelationshipKey(relationship.key);
    setEditingRelationshipType(relationship.editableRelationshipType);
  };

  const stopEditingRelationship = () => {
    setEditingRelationshipKey(null);
  };

  const handleRelationshipSave = async () => {
    if (!activeRelationship) {
      return;
    }

    await onUpdateRelationship(
      activeRelationship.record,
      activeRelationship.relatedId,
      editingRelationshipType
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

  return (
    <section className="card person-detail-panel">
      {person ? (
        <div className="stack">
          <div className="person-detail-header">
            <img className="person-detail-avatar" src={personThumbnailUrl(person.id)} alt={person.name} />
            <div className="person-detail-heading">
              <h3>{person.name}</h3>
              <div className="person-detail-meta">
                <span className="person-detail-meta-item">Immich birth date: {sourceBirthDate}</span>
                <span className="person-detail-meta-item">
                  {relatives.length} relative{relatives.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>
          <div className="person-detail-section stack">
            <div className="person-detail-section-header person-detail-section-heading-block">
              <div className="stack">
                <h3>Profile</h3>
              </div>
            </div>
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
            </div>
            <p className="hint">
              {hasBirthDateOverride
                ? `Override shown in Treemich: ${formatBirthDate(birthDateValue)}`
                : "No override set. Treemich will use the birth date from Immich when available."}
            </p>
            <button
              className="person-detail-primary-action"
              onClick={onProfileSave}
              disabled={isSavingProfile}
            >
              {isSavingProfile ? "Saving..." : "Save profile"}
            </button>
          </div>
          <div className="person-detail-section stack">
            <div className="person-detail-section-header">
              <div className="stack">
                <h3>Relatives</h3>
              </div>
              <span className="person-detail-count">{relatives.length}</span>
            </div>
            {relatives.length > 0 ? (
              <ul className="relatives-list">
                {relatives.map((relative) => (
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
                        onClick={() => startEditingRelationship(relative)}
                        aria-label={`Edit relationship with ${relative.relatedName}`}
                        title={`Edit relationship with ${relative.relatedName}`}
                      >
                        <span aria-hidden="true">✏</span>
                      </button>
                      <button
                        type="button"
                        className="icon-action-button danger-ghost-button"
                        disabled={isSavingRelationship}
                        onClick={() => setPendingDeleteKey(relative.key)}
                        aria-label={`Remove relationship with ${relative.relatedName}`}
                        title={`Remove relationship with ${relative.relatedName}`}
                      >
                        <span aria-hidden="true">🗑</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">No relationships found yet.</p>
            )}
          </div>
          {activeRelationship ? (
            <div className="relationship-editor stack">
              <div className="person-detail-section-header">
                <div className="stack">
                  <h3>Edit relationship</h3>
                  <p className="hint">
                    Change how {person.name} is related to {activeRelationship.relatedName}.
                  </p>
                </div>
                <button type="button" className="text-link-button" onClick={stopEditingRelationship}>
                  Close
                </button>
              </div>
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
              <div className="add-relative-actions">
                <button
                  type="button"
                  disabled={
                    isSavingRelationship ||
                    editingRelationshipType === activeRelationship.editableRelationshipType
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
            </div>
          ) : null}
          {pendingDeleteRelationship ? (
            <div className="relationship-editor stack danger-surface">
              <div className="person-detail-section-header">
                <div className="stack">
                  <h3>Remove relationship</h3>
                  <p className="hint">
                    Remove the relationship between {person.name} and {pendingDeleteRelationship.relatedName}.
                  </p>
                </div>
                <button
                  type="button"
                  className="text-link-button"
                  onClick={() => setPendingDeleteKey(null)}
                  disabled={isSavingRelationship}
                >
                  Close
                </button>
              </div>
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
            </div>
          ) : null}
        </div>
      ) : (
        <p className="hint">Click a person in the graph to see their details.</p>
      )}
    </section>
  );
};

export const PersonDetailPanel = memo(PersonDetailPanelComponent);
