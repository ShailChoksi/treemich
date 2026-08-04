/**
 * @file Read-only person summary for Focus Share guests (graph payload only).
 */

import {
  inverseRelationshipType,
  type FocusShareGuestPerson,
  type FocusShareGuestRelationship,
  type RelationshipType
} from "@treemich/shared";
import { guestFocusShareThumbnailUrl } from "../../lib/api";
import { formatBirthDate, getRelativeRelationshipLabel } from "../personDetail/personDetailHelpers";

type Props = {
  person: FocusShareGuestPerson;
  people: FocusShareGuestPerson[];
  relationships: FocusShareGuestRelationship[];
  onSelectRelative: (personId: string) => void;
  onClose: () => void;
};

/** Formats guest vital dates (`YYYY` / `YYYY-MM` / `YYYY-MM-DD`) for display. */
export const formatGuestVitalDate = (value?: string | null): string | null => {
  if (!value?.trim()) {
    return null;
  }
  const trimmed = value.trim();
  if (/^\d{4}$/.test(trimmed)) {
    return trimmed;
  }
  const yearMonth = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (yearMonth) {
    const year = Number(yearMonth[1]);
    const month = Number(yearMonth[2]);
    const utcDate = new Date(Date.UTC(year, month - 1, 1));
    if (utcDate.getUTCFullYear() === year && utcDate.getUTCMonth() + 1 === month) {
      return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        timeZone: "UTC"
      }).format(utcDate);
    }
  }
  const formatted = formatBirthDate(trimmed);
  return formatted === "Unknown" ? trimmed : formatted;
};

type GuestRelativeRow = {
  personId: string;
  name: string;
  label: string;
  hasThumbnail: boolean;
};

export const buildGuestRelativeRows = (
  personId: string,
  people: FocusShareGuestPerson[],
  relationships: FocusShareGuestRelationship[]
): GuestRelativeRow[] => {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const rows: GuestRelativeRow[] = [];
  // Relationships are stored as direct + inverse pairs (PARENT_OF/CHILD_OF, SIBLING_OF↔SIBLING_OF, …).
  // Dedupe like the owner detail panel so each related person appears once.
  const seenKeys = new Set<string>();
  for (const edge of relationships) {
    let relatedId: string | null = null;
    let labelType: RelationshipType | null = null;
    if (edge.fromPersonId === personId) {
      // Edge is stored from this person; label the *related* person's role (inverse).
      relatedId = edge.toPersonId;
      labelType = inverseRelationshipType(edge.type as RelationshipType);
    } else if (edge.toPersonId === personId) {
      relatedId = edge.fromPersonId;
      labelType = edge.type as RelationshipType;
    }
    if (!relatedId || !labelType) {
      continue;
    }
    const dedupeKey = `${relatedId}:${labelType}`;
    if (seenKeys.has(dedupeKey)) {
      continue;
    }
    const related = peopleById.get(relatedId);
    if (!related) {
      continue;
    }
    seenKeys.add(dedupeKey);
    rows.push({
      personId: related.id,
      name: related.name,
      label: getRelativeRelationshipLabel(labelType, null),
      hasThumbnail: related.hasThumbnail
    });
  }
  rows.sort((left, right) => left.name.localeCompare(right.name));
  return rows;
};

export const GuestPersonDetailPanel = ({
  person,
  people,
  relationships,
  onSelectRelative,
  onClose
}: Props) => {
  // Recompute every render for the selected person — avoid stale memoized relative lists
  // when switching selection while `people`/`relationships` array identities stay stable.
  const relatives = buildGuestRelativeRows(person.id, people, relationships);
  const subtitle = [person.givenName, person.surname].filter(Boolean).join(" ");
  const birthDateLabel = formatGuestVitalDate(person.birthDate);
  const deathDateLabel = formatGuestVitalDate(person.deathDate);
  const hasVitalDates = Boolean(birthDateLabel || deathDateLabel);

  return (
    <aside
      className="guest-person-detail-panel card stack"
      aria-label={`Details for ${person.name}`}
      data-person-id={person.id}
    >
      <div className="guest-person-detail-header">
        <div className="guest-person-detail-identity">
          {person.hasThumbnail ? (
            <img
              key={`avatar-${person.id}`}
              className="guest-person-detail-avatar"
              src={guestFocusShareThumbnailUrl(person.id)}
              alt=""
              width={56}
              height={56}
            />
          ) : (
            <div className="guest-person-detail-avatar guest-person-detail-avatar--placeholder" aria-hidden>
              {person.name.trim().charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <div className="stack">
            <h2>{person.name}</h2>
            {subtitle && subtitle !== person.name ? <p className="hint">{subtitle}</p> : null}
            {hasVitalDates ? (
              <p className="guest-person-vital-dates" aria-label="Birth and death dates">
                {birthDateLabel ? <span>Born {birthDateLabel}</span> : null}
                {birthDateLabel && deathDateLabel ? <span aria-hidden="true"> · </span> : null}
                {deathDateLabel ? <span>Died {deathDateLabel}</span> : null}
              </p>
            ) : null}
            <p className="hint">Read-only shared view</p>
          </div>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={onClose}
          aria-label="Close person details"
        >
          Close
        </button>
      </div>

      <section className="stack" aria-label="Relatives">
        <h3>Relatives</h3>
        {relatives.length === 0 ? (
          <p className="hint">No relatives in this Focus view.</p>
        ) : (
          <ul className="guest-person-relative-list" key={`relatives-${person.id}`}>
            {relatives.map((relative) => (
              <li key={`${person.id}:${relative.personId}:${relative.label}`}>
                <button
                  type="button"
                  className="guest-person-relative-button"
                  onClick={() => onSelectRelative(relative.personId)}
                >
                  {relative.hasThumbnail ? (
                    <img
                      className="guest-person-relative-thumb"
                      src={guestFocusShareThumbnailUrl(relative.personId)}
                      alt=""
                      width={32}
                      height={32}
                    />
                  ) : (
                    <span
                      className="guest-person-relative-thumb guest-person-relative-thumb--placeholder"
                      aria-hidden
                    >
                      {relative.name.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                  )}
                  <span className="guest-person-relative-meta">
                    <strong>{relative.name}</strong>
                    <span className="hint">{relative.label}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
};
