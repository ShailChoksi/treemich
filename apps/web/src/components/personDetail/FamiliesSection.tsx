import { useState } from "react";
import type { CreateLifeEventBody, PatchLifeEventBody } from "@treemich/shared";
import type { FamilyRecord, ImmichPerson, LifeEventRecord, PatchFamilyBody } from "../../lib/api";
import { getPersonDisplayLabel } from "../../lib/personDisplay";
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

  const removeFamily = async (familyId: string) => {
    if (!onDeleteFamily) {
      return;
    }
    if (
      !window.confirm("Delete this family unit? Derived parent/child edges for this union will be removed.")
    ) {
      return;
    }
    setErrorMessage(null);
    try {
      await onDeleteFamily(familyId);
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : "Could not delete family");
    }
  };

  if (families.length === 0) {
    return (
      <p className="hint">
        No family units yet. Create one with <code>POST /families</code> (parents + children + pedigree); the
        graph updates from derived relationships.
      </p>
    );
  }

  return (
    <>
      {errorMessage ? (
        <p className="hint" style={{ color: "var(--danger, #c62828)", marginBottom: "0.5rem" }}>
          {errorMessage}
        </p>
      ) : null}
      <p className="hint" style={{ marginBottom: "0.75rem" }}>
        FAM-style unions involving {getPersonDisplayLabel(person)}. Notes can be edited here; changing members
        still uses the API.
      </p>
      <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: "0.75rem" }}>
        {families.map((family) => {
          const busy = savingFamilyId === family.id;
          const editing = editingFamilyId === family.id;
          return (
            <li key={family.id} className="card" style={{ padding: "0.75rem" }}>
              <div className="stack" style={{ gap: "0.35rem" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                  <span className="hint">Family id</span>
                  <code style={{ fontSize: "0.85rem" }}>{family.id}</code>
                  {onDeleteFamily ? (
                    <button
                      type="button"
                      className="button button-small"
                      disabled={busy}
                      onClick={() => removeFamily(family.id)}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
                <div>
                  <span className="hint">Parents: </span>
                  {labelFor(people, family.parent1ImmichPersonId)}
                  {" · "}
                  {labelFor(people, family.parent2ImmichPersonId)}
                </div>
                {editing ? (
                  <div className="stack" style={{ gap: "0.35rem" }}>
                    <label className="hint" htmlFor={`family-notes-${family.id}`}>
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
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        className="button button-primary button-small"
                        disabled={busy}
                        onClick={() => saveNotes(family.id)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="button button-small"
                        disabled={busy}
                        onClick={cancelEdit}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {family.notes ? (
                      <div>
                        <span className="hint">Notes: </span>
                        {family.notes}
                      </div>
                    ) : (
                      <span className="hint">No notes</span>
                    )}
                    {onPatchFamily ? (
                      <div style={{ marginTop: "0.35rem" }}>
                        <button
                          type="button"
                          className="button button-small"
                          disabled={busy}
                          onClick={() => beginEditNotes(family)}
                        >
                          Edit notes
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
                <div>
                  <span className="hint">Children ({family.children.length})</span>
                  <ul style={{ margin: "0.25rem 0 0 1rem" }}>
                    {family.children.map((child) => (
                      <li key={child.id}>
                        {labelFor(people, child.childImmichPersonId)}
                        <span className="hint"> — {child.pedigree}</span>
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
