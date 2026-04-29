/**
 * @file Popup flow to pick relative type and target when adding an edge from the graph.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Gender, RelationshipType } from "../../lib/api";
import { RELATIONSHIP_TYPES } from "../../lib/relationshipConstants";
import type { AddRelativeSlot } from "./NodeActionButtons";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Props = {
  slot: AddRelativeSlot;
  selectedPersonName: string;
  people: Array<{ id: string; name: string }>;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: AddRelativeSubmitPayload) => Promise<void>;
};

export type AddRelativeSubmitPayload =
  | { type: "existing"; personName: string; relationshipType?: RelationshipType }
  | {
      type: "new";
      givenName: string | null;
      surname: string | null;
      gender: Gender;
      relationshipType?: RelationshipType;
    };

const slotTitle: Record<AddRelativeSlot, string> = {
  parent: "Add Parent",
  siblingOrSpouse: "Add Connection",
  child: "Add Child"
};

const getFirstName = (fullName: string) => fullName.trim().split(/\s+/)[0] ?? fullName;
const normalizeOptionalString = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};
const splitTypedPersonName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { givenName: null, surname: null };
  }
  if (parts.length === 1) {
    return { givenName: parts[0] ?? null, surname: null };
  }
  return {
    givenName: parts[0] ?? null,
    surname: parts.slice(1).join(" ") || null
  };
};

export const AddRelativePopup = ({ slot, selectedPersonName, people, busy, onCancel, onSubmit }: Props) => {
  const [personName, setPersonName] = useState("");
  const [createMode, setCreateMode] = useState(false);
  const [newGivenName, setNewGivenName] = useState("");
  const [newSurname, setNewSurname] = useState("");
  const [newGender, setNewGender] = useState<Gender>("UNKNOWN");
  const [relationshipType, setRelationshipType] = useState<RelationshipType>(RELATIONSHIP_TYPES.siblingOf);
  const [error, setError] = useState<string | null>(null);
  const selectedPersonFirstName = getFirstName(selectedPersonName);
  const dialogRef = useRef<HTMLDivElement>(null);
  const errorId = useId();
  const titleId = useId();
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const getFocusableElements = useCallback(() => {
    const root = dialogRef.current;
    if (!root) {
      return [] as HTMLElement[];
    }
    return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
      (el) => el.offsetParent !== null || el.getClientRects().length > 0
    );
  }, []);

  useLayoutEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const el = getFocusableElements()[0];
      el?.focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
      previousFocusRef.current?.focus?.();
    };
  }, [getFocusableElements]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  useEffect(() => {
    setPersonName("");
    setCreateMode(false);
    setNewGivenName("");
    setNewSurname("");
    setNewGender("UNKNOWN");
    setRelationshipType(RELATIONSHIP_TYPES.siblingOf);
    setError(null);
  }, [slot, selectedPersonName]);

  const trimmedPersonName = personName.trim();
  const matchingPerson = useMemo(() => {
    const normalized = trimmedPersonName.toLowerCase();
    if (!normalized) {
      return null;
    }
    return people.find((person) => person.name.toLowerCase().includes(normalized)) ?? null;
  }, [people, trimmedPersonName]);
  const showCreateOffer = Boolean(trimmedPersonName && !matchingPerson && !createMode);

  const relationshipTypeForSubmit = slot === "siblingOrSpouse" ? relationshipType : undefined;

  const handleDialogKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }
      const focusables = getFocusableElements();
      if (focusables.length === 0) {
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (first == null || last == null) {
        return;
      }
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [getFocusableElements]
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);
      const givenName = normalizeOptionalString(newGivenName);
      const surname = normalizeOptionalString(newSurname);
      try {
        if (createMode) {
          if (!givenName && !surname) {
            throw new Error("Enter a name for the new person.");
          }
          await onSubmit({
            type: "new",
            givenName,
            surname,
            gender: newGender,
            relationshipType: relationshipTypeForSubmit
          });
        } else if (!matchingPerson) {
          const parsedName = splitTypedPersonName(trimmedPersonName);
          if (!parsedName.givenName && !parsedName.surname) {
            throw new Error("Enter a name for the new person.");
          }
          await onSubmit({
            type: "new",
            givenName: parsedName.givenName,
            surname: parsedName.surname,
            gender: "UNKNOWN",
            relationshipType: relationshipTypeForSubmit
          });
        } else {
          await onSubmit({
            type: "existing",
            personName,
            relationshipType: relationshipTypeForSubmit
          });
        }
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Failed to add relationship");
      }
    },
    [
      createMode,
      newGender,
      newGivenName,
      newSurname,
      matchingPerson,
      onSubmit,
      personName,
      trimmedPersonName,
      relationshipTypeForSubmit
    ]
  );

  const startCreateMode = () => {
    setCreateMode(true);
    setNewGivenName(trimmedPersonName);
    setNewSurname("");
    setNewGender("UNKNOWN");
    setError(null);
  };

  return (
    <>
      <button
        type="button"
        className="add-relative-backdrop"
        aria-label="Close add relative dialog"
        onClick={() => onCancel()}
        disabled={busy}
      />
      <div
        ref={dialogRef}
        className="add-relative-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={error ? errorId : undefined}
        onKeyDown={handleDialogKeyDown}
      >
        <h3 id={titleId}>
          {slotTitle[slot]} of {selectedPersonFirstName}
        </h3>
        <form className="stack add-relative-form" onSubmit={handleSubmit}>
          {createMode ? (
            <>
              <p className="hint">Create a new Treemich person and add them to this relationship.</p>
              <label className="field-group">
                <span className="field-label">Given name</span>
                <input
                  value={newGivenName}
                  onChange={(event) => setNewGivenName(event.target.value)}
                  placeholder="Given name"
                  autoFocus
                />
              </label>
              <label className="field-group">
                <span className="field-label">Surname</span>
                <input
                  value={newSurname}
                  onChange={(event) => setNewSurname(event.target.value)}
                  placeholder="Surname"
                />
              </label>
              <label className="field-group">
                <span className="field-label">Gender</span>
                <select value={newGender} onChange={(event) => setNewGender(event.target.value as Gender)}>
                  <option value="UNKNOWN">Unknown</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label className="field-group">
                <span className="field-label">Name</span>
                <input
                  value={personName}
                  onChange={(event) => setPersonName(event.target.value)}
                  placeholder="Type a person name"
                  list="add-relative-options"
                  autoFocus
                />
              </label>
              <datalist id="add-relative-options">
                {people.map((person) => (
                  <option key={person.id} value={person.name} />
                ))}
              </datalist>
              {showCreateOffer ? (
                <button
                  type="button"
                  className="secondary-button add-relative-create-person"
                  onClick={startCreateMode}
                  disabled={busy}
                >
                  Create "{trimmedPersonName}" as a new person
                </button>
              ) : null}
            </>
          )}
          {slot === "siblingOrSpouse" ? (
            <label className="field-group">
              <span className="field-label">Relationship type</span>
              <select
                value={relationshipType}
                onChange={(event) => setRelationshipType(event.target.value as RelationshipType)}
              >
                <option value={RELATIONSHIP_TYPES.siblingOf}>Sibling</option>
                <option value={RELATIONSHIP_TYPES.spouseOf}>Spouse</option>
                <option value={RELATIONSHIP_TYPES.friendOf}>Friend</option>
                <option value={RELATIONSHIP_TYPES.petOf}>Pet</option>
              </select>
            </label>
          ) : null}
          {error ? (
            <p id={errorId} className="hint add-relative-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="add-relative-actions">
            <button
              type="submit"
              className="add-relative-submit"
              disabled={
                busy ||
                (createMode
                  ? !normalizeOptionalString(newGivenName) && !normalizeOptionalString(newSurname)
                  : !personName.trim())
              }
            >
              {busy ? "Adding..." : createMode || showCreateOffer ? "Create & Add" : "Add"}
            </button>
            {createMode ? (
              <button
                type="button"
                className="secondary-button add-relative-cancel-create"
                onClick={() => setCreateMode(false)}
                disabled={busy}
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              className="secondary-button add-relative-cancel"
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
};
