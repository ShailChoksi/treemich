import { useEffect, useMemo, useState } from "react";
import type { CreateLifeEventBody, PatchLifeEventBody, LifeEventTypeValue } from "@treemich/shared";
import {
  lifeEventTypeUiGlyph,
  lifeEventTypeValues,
  personAttachableLifeEventTypeValues
} from "@treemich/shared";
import {
  getPersonLifeEventValidation,
  type LifeEventRecord,
  type PersonLifeEventValidationFinding
} from "../../lib/api";
import { summarizeLifeEvent } from "../../lib/lifeEventFormHelpers";
import { LifeEventRichForm } from "./LifeEventRichForm";

type Props = {
  personId: string;
  personLifeEvents: LifeEventRecord[] | undefined;
  onCreate: (body: CreateLifeEventBody) => Promise<void>;
  onPatch: (eventId: string, body: PatchLifeEventBody) => Promise<void>;
  onDelete: (eventId: string) => Promise<void>;
  disabled?: boolean;
};

export const LifeEventsSection = ({
  personId,
  personLifeEvents,
  onCreate,
  onPatch,
  onDelete,
  disabled
}: Props) => {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [validationFindings, setValidationFindings] = useState<PersonLifeEventValidationFinding[] | null>(
    null
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<LifeEventTypeValue | "ALL">("ALL");

  const hasBirth = useMemo(
    () => (personLifeEvents ?? []).some((e) => e.eventType === "BIRTH"),
    [personLifeEvents]
  );
  const hasDeath = useMemo(
    () => (personLifeEvents ?? []).some((e) => e.eventType === "DEATH"),
    [personLifeEvents]
  );

  const allowedCreateTypes = useMemo(() => {
    return personAttachableLifeEventTypeValues.filter((t) => {
      if (t === "BIRTH" && hasBirth) {
        return false;
      }
      if (t === "DEATH" && hasDeath) {
        return false;
      }
      return true;
    });
  }, [hasBirth, hasDeath]);

  const visibleLifeEvents = useMemo(() => {
    if (personLifeEvents === undefined) {
      return undefined;
    }
    if (typeFilter === "ALL") {
      return personLifeEvents;
    }
    return personLifeEvents.filter((e) => e.eventType === typeFilter);
  }, [personLifeEvents, typeFilter]);

  useEffect(() => {
    if (personLifeEvents === undefined) {
      return;
    }
    let cancelled = false;
    setValidationError(null);
    void getPersonLifeEventValidation(personId)
      .then((res) => {
        if (!cancelled) {
          setValidationFindings(res.findings);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setValidationFindings(null);
          setValidationError(err instanceof Error ? err.message : "Validation check failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [personId, personLifeEvents]);

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
      {validationError ? <p className="hint life-events-validation-error">{validationError}</p> : null}
      {validationFindings && validationFindings.length > 0 ? (
        <ul className="life-events-validation-findings stack">
          {validationFindings.map((f) => (
            <li
              key={f.code}
              className={
                f.severity === "error"
                  ? "life-events-validation-finding life-events-validation-finding--error"
                  : "life-events-validation-finding life-events-validation-finding--warning"
              }
            >
              {f.message}
            </li>
          ))}
        </ul>
      ) : null}
      <label className="life-events-filter field-group">
        <span className="field-label">Filter list by type</span>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter((e.target.value as LifeEventTypeValue | "ALL") || "ALL")}
          disabled={disabled || busy}
        >
          <option value="ALL">All types</option>
          {lifeEventTypeValues.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
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
        {(visibleLifeEvents ?? []).map((event) => (
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
