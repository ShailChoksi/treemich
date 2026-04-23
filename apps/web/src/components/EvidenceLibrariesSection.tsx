/**
 * @file Collapsible list of genealogy repositories and shared sources (Phase 3 evidence).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { listEvidenceRepositories, listEvidenceSources } from "../lib/api";
import type { RepositoryRecord, SourceRecord } from "../lib/api";

export const EvidenceLibrariesSection = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repositories, setRepositories] = useState<RepositoryRecord[]>([]);
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const loadAttempted = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [repos, src] = await Promise.all([listEvidenceRepositories(), listEvidenceSources()]);
      setRepositories(repos);
      setSources(src);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load evidence libraries");
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

  return (
    <details
      className="evidence-libraries-details"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="field-label" style={{ cursor: "pointer" }}>
        Sources &amp; repositories
      </summary>
      {error ? (
        <p className="hint" style={{ color: "var(--danger, #c62828)" }}>
          {error}
        </p>
      ) : null}
      {open && loading ? <p className="hint">Loading…</p> : null}
      {open && !loading ? (
        <div className="stack" style={{ marginTop: "0.5rem" }}>
          <div>
            <div className="field-label" style={{ marginBottom: "0.25rem" }}>
              Repositories
            </div>
            {repositories.length === 0 ? (
              <p className="hint">
                No repositories yet. They are created when you cite an archive name on an event.
              </p>
            ) : (
              <ul className="evidence-list">
                {repositories.map((r) => (
                  <li key={r.id}>
                    <strong>{r.name}</strong>
                    {r.url ? (
                      <>
                        {" "}
                        <a href={r.url} target="_blank" rel="noreferrer">
                          link
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="field-label" style={{ marginBottom: "0.25rem" }}>
              Shared sources
            </div>
            {sources.length === 0 ? (
              <p className="hint">
                No sources yet. Add citations on life events or pick an existing source in the event editor.
              </p>
            ) : (
              <ul className="evidence-list">
                {sources.map((s) => (
                  <li key={s.id}>
                    <strong>{s.title}</strong>
                    {s.repository ? <span className="hint"> — {s.repository.name}</span> : null}
                    {s.url ? (
                      <>
                        {" "}
                        <a href={s.url} target="_blank" rel="noreferrer">
                          URL
                        </a>
                      </>
                    ) : null}
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
