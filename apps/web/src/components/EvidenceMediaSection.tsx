/**
 * @file Collapsible list of evidence media objects (Phase 3) with optional manual registration of a URL.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createEvidenceMediaObject, listEvidenceMediaLinks, listEvidenceMediaObjects } from "../lib/api";
import type { MediaLinkRecord, MediaObjectRecord } from "../lib/api";

export const EvidenceMediaSection = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<MediaObjectRecord[]>([]);
  const [linksByMediaId, setLinksByMediaId] = useState<Record<string, MediaLinkRecord[]>>({});
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
      const linkRows = await Promise.all(
        list.map((item) => listEvidenceMediaLinks(item.id).then((links) => [item.id, links] as const))
      );
      setLinksByMediaId(Object.fromEntries(linkRows));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load media");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loadAttempted.current) {
      return;
    }
    loadAttempted.current = true;
    void load();
  }, [load]);

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
    <section className="evidence-media-details">
      <div className="field-label">Evidence media</div>
      {error ? <p className="hint hint--danger">{error}</p> : null}
      {loading ? (
        <div className="skeleton-card sidebar-skeleton" aria-label="Loading evidence media">
          <span className="sr-only">Loading...</span>
        </div>
      ) : null}
      {!loading ? (
        <div className="stack evidence-panel-stack">
          <p className="hint hint--tight-below">
            Register a stable URL (e.g. PDF or image in your archive). Open links in a new tab to verify
            access.
          </p>
          <div className="person-detail-form-grid person-detail-form-grid--limit-sm">
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
          <div className="workspace-action-row">
            <button
              type="button"
              className="secondary-button workspace-action-button"
              onClick={() => void onAdd()}
              disabled={saving}
            >
              {saving ? "Saving..." : "Add media URL"}
            </button>
          </div>
          <div className="evidence-panel-divider">
            <div className="field-label field-label--spaced">Registered media</div>
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
                    {linksByMediaId[m.id]?.some((link) => link.targetType === "FAMILY") ? (
                      <span className="hint"> · linked to family</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="workspace-action-row">
            <button
              type="button"
              className="secondary-button workspace-action-button"
              onClick={() => {
                loadAttempted.current = true;
                void load();
              }}
              disabled={loading}
            >
              Refresh
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
};
