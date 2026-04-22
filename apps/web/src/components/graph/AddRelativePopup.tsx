/**
 * @file Popup flow to pick relative type and target when adding an edge from the graph.
 */

import { useEffect, useState } from "react";
import type { RelationshipType } from "../../lib/api";
import type { AddRelativeSlot } from "./NodeActionButtons";

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
      <div className="add-relative-backdrop" onClick={onCancel} />
      <div className="add-relative-popup" role="dialog" aria-modal="true" aria-label={slotTitle[slot]}>
        <h3>
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
          {error ? <p className="hint add-relative-error">{error}</p> : null}
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
