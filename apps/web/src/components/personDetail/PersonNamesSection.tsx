/**
 * @file Alternate names CRUD and primary display name selection.
 */

import { useCallback, useEffect, useState } from "react";
import {
  createPersonName,
  deletePersonName,
  getPersonNames,
  type CreatePersonNameBody,
  type PersonNameRecord,
  setPrimaryPersonName
} from "../../lib/api";
import { personNameTypeLabels, type PersonNameTypeValue } from "@treemich/shared";

type Props = {
  personId: string;
  disabled?: boolean;
  onNamesChanged?: () => void;
};

const nameTypes: PersonNameTypeValue[] = ["BIRTH", "MARRIED", "AKA", "MAIDEN", "RELIGIOUS", "OTHER"];

export const PersonNamesSection = ({ personId, disabled, onNamesChanged }: Props) => {
  const [names, setNames] = useState<PersonNameRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<CreatePersonNameBody>({
    type: "AKA",
    givenName: null,
    surname: null,
    isPrimary: false
  });

  const load = useCallback(() => {
    setLoadError(null);
    void getPersonNames(personId)
      .then(setNames)
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : "Failed to load names");
        setNames([]);
      });
  }, [personId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      onNamesChanged?.();
      load();
    } finally {
      setBusy(false);
    }
  };

  if (names === null && !loadError) {
    return (
      <div className="skeleton-card sidebar-skeleton" aria-label="Loading names">
        <span className="sr-only">Loading names…</span>
      </div>
    );
  }

  if (loadError) {
    return <p className="hint person-names-error">{loadError}</p>;
  }

  return (
    <div className="person-names-section stack">
      {creating ? (
        <div className="person-names-create stack">
          <label className="field-group">
            <span className="field-label">Type</span>
            <select
              value={draft.type}
              onChange={(e) =>
                setDraft((d: CreatePersonNameBody) => ({ ...d, type: e.target.value as PersonNameTypeValue }))
              }
            >
              {nameTypes.map((t) => (
                <option key={t} value={t}>
                  {personNameTypeLabels[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="field-group">
            <span className="field-label">Given</span>
            <input
              value={draft.givenName ?? ""}
              onChange={(e) =>
                setDraft((d: CreatePersonNameBody) => ({ ...d, givenName: e.target.value || null }))
              }
            />
          </label>
          <label className="field-group">
            <span className="field-label">Surname</span>
            <input
              value={draft.surname ?? ""}
              onChange={(e) =>
                setDraft((d: CreatePersonNameBody) => ({ ...d, surname: e.target.value || null }))
              }
            />
          </label>
          <label className="person-names-primary-toggle">
            <input
              type="checkbox"
              checked={draft.isPrimary ?? false}
              onChange={(e) => setDraft((d: CreatePersonNameBody) => ({ ...d, isPrimary: e.target.checked }))}
            />
            <span>Set as primary</span>
          </label>
          <div className="person-names-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={disabled || busy}
              onClick={() => run(() => createPersonName(personId, draft).then(() => setCreating(false)))}
            >
              Save name
            </button>
            <button
              type="button"
              className="text-link-button person-names-cancel"
              onClick={() => setCreating(false)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="secondary-button"
          disabled={disabled || busy}
          onClick={() => setCreating(true)}
        >
          Add alternate name
        </button>
      )}
      <ul className="person-names-list">
        {(names ?? []).map((n) => (
          <li key={n.id} className="person-names-row">
            <span className="person-names-type-tag">{personNameTypeLabels[n.type]}</span>
            <span className="person-names-display">{n.display || "(empty)"}</span>
            {n.isPrimary ? <span className="person-names-primary-badge">Primary</span> : null}
            {!n.isPrimary ? (
              <button
                type="button"
                className="text-link-button"
                disabled={disabled || busy}
                onClick={() => run(() => setPrimaryPersonName(personId, n.id).then(() => undefined))}
              >
                Make primary
              </button>
            ) : null}
            {!n.isPrimary ? (
              <button
                type="button"
                className="text-link-button"
                disabled={disabled || busy}
                onClick={() => run(() => deletePersonName(personId, n.id))}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
};
