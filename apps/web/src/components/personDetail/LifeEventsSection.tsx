import { useMemo, useState } from "react";
import type { CreateLifeEventBody, PatchLifeEventBody } from "@treemich/shared";
import { lifeEventTypeValues } from "@treemich/shared";
import type { LifeEventRecord } from "../../lib/api";
import { summarizeLifeEvent } from "../../lib/lifeEventFormHelpers";
import { LifeEventRichForm } from "./LifeEventRichForm";

type Props = {
  personLifeEvents: LifeEventRecord[] | undefined;
  onCreate: (body: CreateLifeEventBody) => Promise<void>;
  onPatch: (eventId: string, body: PatchLifeEventBody) => Promise<void>;
  onDelete: (eventId: string) => Promise<void>;
  disabled?: boolean;
};

export const LifeEventsSection = ({ personLifeEvents, onCreate, onPatch, onDelete, disabled }: Props) => {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hasBirth = useMemo(
    () => (personLifeEvents ?? []).some((e) => e.eventType === "BIRTH"),
    [personLifeEvents]
  );
  const hasDeath = useMemo(
    () => (personLifeEvents ?? []).some((e) => e.eventType === "DEATH"),
    [personLifeEvents]
  );

  const allowedCreateTypes = useMemo(() => {
    return lifeEventTypeValues.filter((t) => {
      if (t === "BIRTH" && hasBirth) {
        return false;
      }
      if (t === "DEATH" && hasDeath) {
        return false;
      }
      return true;
    });
  }, [hasBirth, hasDeath]);

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setCreating(false);
      setEditingId(null);
    } finally {
      setBusy(false);
    }
  };

  if (personLifeEvents === undefined) {
    return <p className="hint">Loading life events…</p>;
  }

  return (
    <div className="life-events-section stack">
      <p className="hint">
        Quick profile fields above still save birth, death, and birth place. This section edits the full
        life-event record (partial dates, qualifiers, notes, place details, citations).
      </p>
      {!creating && !editingId ? (
        <button
          type="button"
          className="secondary-button"
          disabled={disabled || busy}
          onClick={() => setCreating(true)}
        >
          Add life event
        </button>
      ) : null}

      {creating ? (
        <LifeEventRichForm
          variant="create"
          allowedCreateTypes={allowedCreateTypes}
          onSubmitCreate={(body) => wrap(() => onCreate(body))}
          onSubmitPatch={() => Promise.resolve()}
          onCancel={() => setCreating(false)}
          disabled={disabled || busy}
        />
      ) : null}

      <ul className="life-events-list">
        {personLifeEvents.map((event) => (
          <li key={event.id} className="life-events-list-item">
            {editingId === event.id ? (
              <LifeEventRichForm
                variant="edit"
                initialEvent={event}
                onSubmitCreate={() => Promise.resolve()}
                onSubmitPatch={(id, body) => wrap(() => onPatch(id, body))}
                onDelete={(id) => wrap(() => onDelete(id))}
                onCancel={() => setEditingId(null)}
                disabled={disabled || busy}
              />
            ) : (
              <div className="life-events-row">
                <span className="life-events-summary">{summarizeLifeEvent(event)}</span>
                {event.notes ? <span className="hint">{event.notes}</span> : null}
                <button
                  type="button"
                  className="text-link-button"
                  disabled={disabled || busy}
                  onClick={() => setEditingId(event.id)}
                >
                  Edit
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
