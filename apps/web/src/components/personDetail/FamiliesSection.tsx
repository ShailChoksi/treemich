import { useState } from "react";
import type { CreateLifeEventBody, PatchLifeEventBody } from "@treemich/shared";
import type { FamilyRecord, ImmichPerson, LifeEventRecord, PatchFamilyBody } from "../../lib/api";
import { getPersonDisplayLabel } from "../../lib/personDisplay";
import { DestructiveConfirmDialog } from "../DestructiveConfirmDialog";
import { FamilyLifeEventsBlock } from "./FamilyLifeEventsBlock";

type Props = {
  person: ImmichPerson;
  people: ImmichPerson[];
  families: FamilyRecord[];
  onPatchFamily?: (familyId: string, body: PatchFamilyBody) => Promise<void>;
  onDeleteFamily?: (familyId: string) => Promise<void>;
  savingFamilyId?: string | null;
  familyLifeEventsById?: Partial<Record<string, LifeEventRecord[]>>;
  onFamilyLifeEventCreate?: (familyId: string, body: CreateLifeEventBody) => Promise<void>;
  onFamilyLifeEventPatch?: (familyId: string, eventId: string, body: PatchLifeEventBody) => Promise<void>;
  onFamilyLifeEventDelete?: (familyId: string, eventId: string) => Promise<void>;
};

const labelFor = (people: ImmichPerson[], immichPersonId: string | null) => {
  if (!immichPersonId) {
    return "—";
  }
  const match = people.find((p) => p.id === immichPersonId);
  return match ? getPersonDisplayLabel(match) : immichPersonId;
};

export const FamiliesSection = ({
  person,
  people,
  families,
  onPatchFamily,
  onDeleteFamily,
  savingFamilyId,
  familyLifeEventsById,
  onFamilyLifeEventCreate,
  onFamilyLifeEventPatch,
  onFamilyLifeEventDelete
}: Props) => {
  const [editingFamilyId, setEditingFamilyId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingDeleteFamilyId, setPendingDeleteFamilyId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const beginEditNotes = (family: FamilyRecord) => {
    setErrorMessage(null);
    setEditingFamilyId(family.id);
    setNotesDraft(family.notes ?? "");
  };

  const cancelEdit = () => {
    setEditingFamilyId(null);
    setNotesDraft("");
    setErrorMessage(null);
  };

  const saveNotes = async (familyId: string) => {
    if (!onPatchFamily) {
      return;
    }
    setErrorMessage(null);
    try {
      await onPatchFamily(familyId, { notes: notesDraft.trim() ? notesDraft.trim() : null });
      cancelEdit();
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : "Could not save notes");
    }
  };

  const requestRemoveFamily = (familyId: string) => {
    if (!onDeleteFamily) {
      return;
    }
    setErrorMessage(null);
    setPendingDeleteFamilyId(familyId);
  };

  const cancelRemoveFamily = () => {
    if (deleteBusy) {
      return;
    }
    setPendingDeleteFamilyId(null);
  };

  const confirmRemoveFamily = async () => {
    if (!onDeleteFamily || !pendingDeleteFamilyId) {
      return;
    }
    setDeleteBusy(true);
    setErrorMessage(null);
    try {
      await onDeleteFamily(pendingDeleteFamilyId);
      setPendingDeleteFamilyId(null);
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : "Could not delete family");
    } finally {
      setDeleteBusy(false);
    }
  };

  if (families.length === 0) {
    return (
      <div className="stack family-units-empty">
        <p className="hint">
          No <strong>family units</strong> yet. These are explicit GEDCOM-style unions (two parent slots +
          children + pedigree), used for household life events and export — they are{" "}
          <strong>not created automatically</strong> from the spouse/parent edges in{" "}
          <strong>Relatives</strong>.
        </p>
        <p className="hint">
          Create one with <code>POST /families</code> (parents + children + pedigree); parent/child lines on
          the graph are then derived from those rows where applicable.
        </p>
      </div>
    );
  }

  return (
    <>
      <DestructiveConfirmDialog
        open={pendingDeleteFamilyId !== null}
        title="Delete family unit?"
        description="Derived parent/child edges for this union will be removed. This cannot be undone from the UI."
        confirmLabel="Delete family"
        cancelLabel="Keep family"
        busy={deleteBusy}
        onCancel={cancelRemoveFamily}
        onConfirm={confirmRemoveFamily}
      />
      {errorMessage ? <p className="hint hint--danger">{errorMessage}</p> : null}
      <p className="hint family-units-intro">
        Unions involving {getPersonDisplayLabel(person)}. Notes can be edited here; changing parents or
        children still uses the API.
      </p>
      <ul className="family-units-list">
        {families.map((family, index) => {
          const busy = savingFamilyId === family.id;
          const editing = editingFamilyId === family.id;
          return (
            <li key={family.id} className="family-unit-block">
              <div className="stack">
                <div className="family-unit-toolbar">
                  {families.length > 1 ? (
                    <span className="field-label family-unit-toolbar-title">Union {index + 1}</span>
                  ) : (
                    <span className="family-unit-toolbar-spacer" aria-hidden="true" />
                  )}
                  {onDeleteFamily ? (
                    <button
                      type="button"
                      className="secondary-button danger-button"
                      disabled={busy}
                      onClick={() => requestRemoveFamily(family.id)}
                    >
                      Delete family
                    </button>
                  ) : null}
                </div>

                <div className="field-group">
                  <span className="field-label">Parents</span>
                  <span className="family-unit-readonly">
                    {labelFor(people, family.parent1ImmichPersonId)}
                    {" · "}
                    {labelFor(people, family.parent2ImmichPersonId)}
                  </span>
                </div>

                {editing ? (
                  <div className="field-group">
                    <label className="field-label" htmlFor={`family-notes-${family.id}`}>
                      Notes
                    </label>
                    <textarea
                      id={`family-notes-${family.id}`}
                      className="input"
                      rows={3}
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      disabled={busy}
                    />
                    <div className="family-unit-actions-inline">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => saveNotes(family.id)}
                      >
                        Save
                      </button>
                      <button type="button" className="text-link-button" disabled={busy} onClick={cancelEdit}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="field-group">
                    <span className="field-label">Notes</span>
                    {family.notes ? (
                      <span className="family-unit-readonly">{family.notes}</span>
                    ) : (
                      <span className="hint">No notes yet.</span>
                    )}
                    {onPatchFamily ? (
                      <div className="family-unit-actions-inline">
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={busy}
                          onClick={() => beginEditNotes(family)}
                        >
                          Edit notes
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}

                <div className="field-group">
                  <span className="field-label">Children ({family.children.length})</span>
                  <ul className="family-unit-children">
                    {family.children.map((child) => (
                      <li key={child.id}>
                        {labelFor(people, child.childImmichPersonId)}
                        <span className="family-unit-pedigree"> — {child.pedigree}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {onFamilyLifeEventCreate && onFamilyLifeEventPatch && onFamilyLifeEventDelete ? (
                  <FamilyLifeEventsBlock
                    familyId={family.id}
                    events={familyLifeEventsById?.[family.id]}
                    disabled={busy}
                    onCreate={(body) => onFamilyLifeEventCreate(family.id, body)}
                    onPatch={(eventId, body) => onFamilyLifeEventPatch(family.id, eventId, body)}
                    onDelete={(eventId) => onFamilyLifeEventDelete(family.id, eventId)}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
};
