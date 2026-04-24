/**
 * @file Household / family-scoped life events (RESIDENCE, CENSUS, CUSTOM) for one family union.
 */

import { useState } from "react";
import type { CreateLifeEventBody, PatchLifeEventBody } from "@treemich/shared";
import { familyAttachableLifeEventTypeValues, lifeEventTypeUiGlyph } from "@treemich/shared";
import type { LifeEventRecord } from "../../lib/api";
import { summarizeLifeEvent } from "../../lib/lifeEventFormHelpers";
import { LifeEventRichForm } from "./LifeEventRichForm";

const allowedFamilyLifeEventTypes = [...familyAttachableLifeEventTypeValues];

type Props = {
  familyId: string;
  events: LifeEventRecord[] | undefined;
  onCreate: (body: CreateLifeEventBody) => Promise<void>;
  onPatch: (eventId: string, body: PatchLifeEventBody) => Promise<void>;
  onDelete: (eventId: string) => Promise<void>;
  disabled?: boolean;
};

export const FamilyLifeEventsBlock = ({ familyId, events, onCreate, onPatch, onDelete, disabled }: Props) => {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    setLocalError(null);
    try {
      await fn();
      setCreating(false);
      setEditingId(null);
    } catch (error: unknown) {
      setLocalError(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  if (events === undefined) {
    return <p className="hint">Loading household events…</p>;
  }

  return (
    <div className="life-events-section stack family-household-events" data-family-id={familyId}>
      <div className="field-group">
        <span className="field-label">Household events</span>
        <p className="hint family-household-events__lede">
          Residence, census, or custom facts for this family unit (shared household sheet).
        </p>
      </div>
      {localError ? <p className="hint hint--danger">{localError}</p> : null}
      {!creating && !editingId ? (
        <button
          type="button"
          className="secondary-button"
          disabled={disabled || busy}
          onClick={() => setCreating(true)}
        >
          Add household event
        </button>
      ) : null}

      {creating ? (
        <LifeEventRichForm
          variant="create"
          allowedCreateTypes={allowedFamilyLifeEventTypes}
          onSubmitCreate={(body) => wrap(() => onCreate(body))}
          onSubmitPatch={() => Promise.resolve()}
          onCancel={() => setCreating(false)}
          disabled={disabled || busy}
        />
      ) : null}

      <ul className="life-events-list">
        {events.map((event) => (
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
                <span
                  className="life-events-glyph"
                  title={event.eventType}
                  aria-label={`Event type ${event.eventType}`}
                >
                  {lifeEventTypeUiGlyph[event.eventType]}
                </span>
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
