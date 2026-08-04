/**
 * @file Settings surface to list, edit, rotate, copy, and revoke Focus Shares.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  maxFocusBloodlineDepth,
  maxFocusCollateralDepth,
  minFocusBloodlineDepth,
  minFocusCollateralDepth,
  type FocusShareRecord,
  type PersonRecord
} from "@treemich/shared";
import {
  deleteFocusShare,
  focusShareAbsoluteUrl,
  listFocusShares,
  patchFocusShare,
  rotateFocusSharePassword
} from "../lib/api";
import { DestructiveConfirmDialog } from "./DestructiveConfirmDialog";

type Props = {
  people: PersonRecord[];
};

type EditDraft = {
  label: string;
  focusAnchorPersonId: string;
  maxAncestorDepth: number;
  maxDescendantDepth: number;
  maxCollateralDepth: number;
};

const personDisplayName = (person: PersonRecord | undefined, fallbackId: string) =>
  person?.displayName?.trim() || person?.name?.trim() || fallbackId;

const shareTitle = (share: FocusShareRecord, peopleById: Map<string, PersonRecord>) => {
  if (share.label?.trim()) {
    return share.label.trim();
  }
  const anchor = personDisplayName(peopleById.get(share.focusAnchorPersonId), share.focusAnchorPersonId);
  return `Share of ${anchor}`;
};

const formatCreatedAt = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const draftFromShare = (share: FocusShareRecord): EditDraft => ({
  label: share.label ?? "",
  focusAnchorPersonId: share.focusAnchorPersonId,
  maxAncestorDepth: share.maxAncestorDepth,
  maxDescendantDepth: share.maxDescendantDepth,
  maxCollateralDepth: share.maxCollateralDepth
});

export const SharedLinksSettingsPanel = ({ people }: Props) => {
  const [shares, setShares] = useState<FocusShareRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [rotatePassword, setRotatePassword] = useState("");
  const [rotatingBusy, setRotatingBusy] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<FocusShareRecord | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const peopleOptions = useMemo(
    () =>
      [...people].sort((left, right) =>
        personDisplayName(left, left.id).localeCompare(personDisplayName(right, right.id))
      ),
    [people]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await listFocusShares();
      setShares(next);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : "Failed to load shared links");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const beginEdit = (share: FocusShareRecord) => {
    setActionError(null);
    setStatusMessage(null);
    setEditingId(share.id);
    setDraft(draftFromShare(share));
    setRotatingId(null);
    setRotatePassword("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
    setSavingEdit(false);
  };

  const handleSaveEdit = async (event: FormEvent, shareId: string) => {
    event.preventDefault();
    if (!draft) {
      return;
    }
    setSavingEdit(true);
    setActionError(null);
    setStatusMessage(null);
    try {
      const updated = await patchFocusShare(shareId, {
        label: draft.label.trim() ? draft.label.trim() : null,
        focusAnchorPersonId: draft.focusAnchorPersonId,
        maxAncestorDepth: draft.maxAncestorDepth,
        maxDescendantDepth: draft.maxDescendantDepth,
        maxCollateralDepth: draft.maxCollateralDepth
      });
      setShares((current) => current.map((share) => (share.id === shareId ? updated : share)));
      setStatusMessage("Shared link updated.");
      cancelEdit();
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Failed to update shared link");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCopy = async (share: FocusShareRecord) => {
    setActionError(null);
    setStatusMessage(null);
    try {
      await navigator.clipboard.writeText(focusShareAbsoluteUrl(share.publicPath));
      setCopiedId(share.id);
      setStatusMessage("Link copied.");
    } catch {
      setActionError("Could not copy link — select and copy it manually.");
    }
  };

  const handleRotate = async (event: FormEvent, shareId: string) => {
    event.preventDefault();
    if (rotatePassword.length < 8) {
      setActionError("Password must be at least 8 characters.");
      return;
    }
    setRotatingBusy(true);
    setActionError(null);
    setStatusMessage(null);
    try {
      const updated = await rotateFocusSharePassword(shareId, { password: rotatePassword });
      setShares((current) => current.map((share) => (share.id === shareId ? updated : share)));
      setRotatingId(null);
      setRotatePassword("");
      setStatusMessage("Password rotated. Existing guest sessions were ended.");
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Failed to rotate password");
    } finally {
      setRotatingBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) {
      return;
    }
    setRevoking(true);
    setActionError(null);
    setStatusMessage(null);
    try {
      await deleteFocusShare(revokeTarget.id);
      setShares((current) => current.filter((share) => share.id !== revokeTarget.id));
      if (editingId === revokeTarget.id) {
        cancelEdit();
      }
      setStatusMessage("Shared link revoked.");
      setRevokeTarget(null);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Failed to revoke shared link");
    } finally {
      setRevoking(false);
    }
  };

  if (loading) {
    return (
      <section className="card stack workspace-intro-card settings-card" aria-label="Loading shared links">
        <div className="skeleton-card settings-skeleton" />
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="card stack workspace-intro-card settings-card" aria-label="Shared links">
        <div className="stack">
          <h2>Shared links</h2>
          <p className="error-text">{loadError}</p>
          <div className="toolbar-row">
            <button type="button" className="secondary-button" onClick={() => void refresh()}>
              Retry
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="card stack workspace-intro-card settings-card" aria-label="Shared links">
      <div className="stack">
        <h2>Shared links</h2>
        <p className="hint">
          Password-protected Focus Shares. Guests see a read-only graph. Rotate or revoke ends guest sessions
          immediately.
        </p>
      </div>

      {statusMessage ? (
        <p className="hint" role="status" aria-live="polite">
          {statusMessage}
        </p>
      ) : null}
      {actionError ? <p className="error-text">{actionError}</p> : null}

      {shares.length === 0 ? (
        <p className="hint">No shared links yet. Create one from Focus mode on the Tree with Share.</p>
      ) : (
        <ul className="shared-links-list">
          {shares.map((share) => {
            const anchorName = personDisplayName(
              peopleById.get(share.focusAnchorPersonId),
              share.focusAnchorPersonId
            );
            const isEditing = editingId === share.id && draft != null;
            const isRotating = rotatingId === share.id;

            return (
              <li key={share.id} className="shared-links-item">
                <div className="shared-links-item-header">
                  <div className="stack">
                    <strong>{shareTitle(share, peopleById)}</strong>
                    <span className="hint">
                      Focus Anchor: {anchorName} · ↑{share.maxAncestorDepth} ↓{share.maxDescendantDepth}{" "}
                      siblings {share.maxCollateralDepth}
                    </span>
                    <span className="hint">Created {formatCreatedAt(share.createdAt)}</span>
                  </div>
                  <div className="toolbar-row shared-links-actions">
                    <button type="button" className="secondary-button" onClick={() => void handleCopy(share)}>
                      {copiedId === share.id ? "Copied" : "Copy link"}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => beginEdit(share)}
                      disabled={isEditing}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setActionError(null);
                        setStatusMessage(null);
                        setRotatingId(share.id);
                        setRotatePassword("");
                        cancelEdit();
                      }}
                      disabled={isRotating}
                    >
                      Rotate password
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setActionError(null);
                        setRevokeTarget(share);
                      }}
                    >
                      Revoke
                    </button>
                  </div>
                </div>

                <label className="shared-links-url">
                  Public link
                  <input
                    type="text"
                    readOnly
                    value={focusShareAbsoluteUrl(share.publicPath)}
                    aria-label={`Public link for ${shareTitle(share, peopleById)}`}
                  />
                </label>

                {isEditing && draft ? (
                  <form
                    className="stack shared-links-edit"
                    onSubmit={(event) => void handleSaveEdit(event, share.id)}
                  >
                    <label>
                      Label
                      <input
                        type="text"
                        maxLength={200}
                        value={draft.label}
                        onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                        placeholder={`Share of ${anchorName}`}
                      />
                    </label>
                    <label>
                      Focus Anchor
                      <select
                        value={draft.focusAnchorPersonId}
                        onChange={(event) => setDraft({ ...draft, focusAnchorPersonId: event.target.value })}
                      >
                        {!peopleById.has(draft.focusAnchorPersonId) ? (
                          <option value={draft.focusAnchorPersonId}>{draft.focusAnchorPersonId}</option>
                        ) : null}
                        {peopleOptions.map((person) => (
                          <option key={person.id} value={person.id}>
                            {personDisplayName(person, person.id)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="shared-links-depths">
                      <label>
                        Ancestors
                        <input
                          type="number"
                          min={minFocusBloodlineDepth}
                          max={maxFocusBloodlineDepth}
                          value={draft.maxAncestorDepth}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              maxAncestorDepth: event.currentTarget.valueAsNumber
                            })
                          }
                        />
                      </label>
                      <label>
                        Descendants
                        <input
                          type="number"
                          min={minFocusBloodlineDepth}
                          max={maxFocusBloodlineDepth}
                          value={draft.maxDescendantDepth}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              maxDescendantDepth: event.currentTarget.valueAsNumber
                            })
                          }
                        />
                      </label>
                      <label>
                        Siblings
                        <input
                          type="number"
                          min={minFocusCollateralDepth}
                          max={maxFocusCollateralDepth}
                          value={draft.maxCollateralDepth}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              maxCollateralDepth: event.currentTarget.valueAsNumber
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="toolbar-row">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={cancelEdit}
                        disabled={savingEdit}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="confirm-dialog-submit" disabled={savingEdit}>
                        {savingEdit ? "Saving…" : "Save changes"}
                      </button>
                    </div>
                  </form>
                ) : null}

                {isRotating ? (
                  <form
                    className="stack shared-links-edit"
                    onSubmit={(event) => void handleRotate(event, share.id)}
                  >
                    <p className="hint">
                      Set a new password. Anyone with an open guest session will need to unlock again.
                    </p>
                    <label>
                      New password
                      <input
                        type="password"
                        minLength={8}
                        required
                        autoComplete="new-password"
                        value={rotatePassword}
                        onChange={(event) => setRotatePassword(event.target.value)}
                      />
                    </label>
                    <div className="toolbar-row">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={rotatingBusy}
                        onClick={() => {
                          setRotatingId(null);
                          setRotatePassword("");
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="confirm-dialog-submit"
                        disabled={rotatingBusy || rotatePassword.length < 8}
                      >
                        {rotatingBusy ? "Rotating…" : "Rotate password"}
                      </button>
                    </div>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <DestructiveConfirmDialog
        open={revokeTarget != null}
        title="Revoke shared link?"
        description={
          revokeTarget
            ? `Remove “${shareTitle(revokeTarget, peopleById)}”? The public URL stops working and guest sessions end immediately.`
            : ""
        }
        confirmLabel="Revoke"
        busy={revoking}
        onCancel={() => {
          if (!revoking) {
            setRevokeTarget(null);
          }
        }}
        onConfirm={() => void handleRevoke()}
      />
    </section>
  );
};
