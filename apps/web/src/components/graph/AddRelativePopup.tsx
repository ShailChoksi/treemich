/**
 * @file Popup flow to pick relative type and target when adding an edge from the graph.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { RelationshipType } from "../../lib/api";
import type { AddRelativeSlot } from "./NodeActionButtons";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Props = {
  slot: AddRelativeSlot;
  selectedPersonName: string;
  people: Array<{ id: string; name: string }>;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (personName: string, relationshipType?: RelationshipType) => Promise<void>;
};

const slotTitle: Record<AddRelativeSlot, string> = {
  parent: "Add Parent",
  siblingOrSpouse: "Add Connection",
  child: "Add Child"
};

const getFirstName = (fullName: string) => fullName.trim().split(/\s+/)[0] ?? fullName;

export const AddRelativePopup = ({ slot, selectedPersonName, people, busy, onCancel, onSubmit }: Props) => {
  const [personName, setPersonName] = useState("");
  const [relationshipType, setRelationshipType] = useState<RelationshipType>("SIBLING_OF");
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
    setRelationshipType("SIBLING_OF");
    setError(null);
  }, [slot, selectedPersonName]);

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
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
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await onSubmit(personName, slot === "siblingOrSpouse" ? relationshipType : undefined);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to add relationship");
    }
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
          {slot === "siblingOrSpouse" ? (
            <label className="field-group">
              <span className="field-label">Relationship type</span>
              <select
                value={relationshipType}
                onChange={(event) => setRelationshipType(event.target.value as RelationshipType)}
              >
                <option value="SIBLING_OF">Sibling</option>
                <option value="SPOUSE_OF">Spouse</option>
                <option value="FRIEND_OF">Friend</option>
                <option value="PET_OF">Pet</option>
              </select>
            </label>
          ) : null}
          {error ? (
            <p id={errorId} className="hint add-relative-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="add-relative-actions">
            <button type="submit" className="add-relative-submit" disabled={busy || !personName.trim()}>
              {busy ? "Adding..." : "Add"}
            </button>
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
