/**
 * @file Collapsible list of evidence media objects (Phase 3) with optional manual registration of a URL.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createEvidenceMediaObject, listEvidenceMediaObjects } from "../lib/api";
import type { MediaObjectRecord } from "../lib/api";

export const EvidenceMediaSection = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<MediaObjectRecord[]>([]);
  const [storageUrl, setStorageUrl] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const loadAttempted = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listEvidenceMediaObjects();
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load media");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || loadAttempted.current) {
      return;
    }
    loadAttempted.current = true;
    void load();
  }, [open, load]);

  const onAdd = async () => {
    const url = storageUrl.trim();
    if (!url) {
      setError("Storage URL is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createEvidenceMediaObject({
        storageUrl: url,
        title: title.trim() ? title.trim() : null,
        mimeType: null,
        checksum: null,
        immichAssetId: null
      });
      setStorageUrl("");
      setTitle("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add media");
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="evidence-media-details" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="field-label" style={{ cursor: "pointer" }}>
        Evidence media
      </summary>
      {error ? (
        <p className="hint" style={{ color: "var(--danger, #c62828)" }}>
          {error}
        </p>
      ) : null}
      {open && loading ? <p className="hint">Loading…</p> : null}
      {open && !loading ? (
        <div className="stack" style={{ marginTop: "0.5rem" }}>
          <p className="hint" style={{ marginBottom: "0.5rem" }}>
            Register a stable URL (e.g. PDF or image in your archive). Open links in a new tab to verify
            access.
          </p>
          <div className="person-detail-form-grid" style={{ maxWidth: "36rem" }}>
            <label className="field-group">
              <span className="field-label">Storage URL</span>
              <input
                type="url"
                value={storageUrl}
                onChange={(e) => setStorageUrl(e.target.value)}
                placeholder="https://…"
                disabled={saving}
              />
            </label>
            <label className="field-group">
              <span className="field-label">Title (optional)</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short label"
                disabled={saving}
              />
            </label>
          </div>
          <button type="button" className="primary-button" onClick={() => void onAdd()} disabled={saving}>
            {saving ? "Saving…" : "Add media URL"}
          </button>
          <div style={{ marginTop: "0.75rem" }}>
            <div className="field-label" style={{ marginBottom: "0.25rem" }}>
              Registered media
            </div>
            {items.length === 0 ? (
              <p className="hint">No media objects yet.</p>
            ) : (
              <ul className="evidence-list">
                {items.map((m) => (
                  <li key={m.id}>
                    <strong>{m.title?.trim() || "Untitled"}</strong>
                    {" · "}
                    <a href={m.storageUrl} target="_blank" rel="noreferrer">
                      open
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              loadAttempted.current = true;
              void load();
            }}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      ) : null}
    </details>
  );
};
