/**
 * @file Collapsible genealogy repositories and shared sources (Phase 3 evidence), with create and merge.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createEvidenceRepository,
  createEvidenceSource,
  listEvidenceRepositories,
  listEvidenceSources,
  mergeEvidenceSources
} from "../lib/api";
import type { RepositoryRecord, SourceRecord } from "../lib/api";

export const EvidenceLibrariesSection = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repositories, setRepositories] = useState<RepositoryRecord[]>([]);
  const [sources, setSources] = useState<SourceRecord[]>([]);

  const [newRepoName, setNewRepoName] = useState("");
  const [repoSaving, setRepoSaving] = useState(false);

  const [newSourceTitle, setNewSourceTitle] = useState("");
  const [newSourceRepoId, setNewSourceRepoId] = useState("");
  const [sourceSaving, setSourceSaving] = useState(false);

  const [mergeFromId, setMergeFromId] = useState("");
  const [mergeIntoId, setMergeIntoId] = useState("");
  const [mergeSaving, setMergeSaving] = useState(false);

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
    if (loadAttempted.current) {
      return;
    }
    loadAttempted.current = true;
    void load();
  }, [load]);

  const onCreateRepository = async () => {
    const name = newRepoName.trim();
    if (!name) {
      setError("Repository name is required.");
      return;
    }
    setRepoSaving(true);
    setError(null);
    try {
      await createEvidenceRepository({ name, addressLine1: null, url: null, notes: null });
      setNewRepoName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create repository");
    } finally {
      setRepoSaving(false);
    }
  };

  const onCreateSource = async () => {
    const title = newSourceTitle.trim();
    if (!title) {
      setError("Source title is required.");
      return;
    }
    setSourceSaving(true);
    setError(null);
    try {
      await createEvidenceSource({
        title,
        repositoryId: newSourceRepoId.trim() ? newSourceRepoId.trim() : null,
        author: null,
        publication: null,
        url: null,
        notes: null
      });
      setNewSourceTitle("");
      setNewSourceRepoId("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create source");
    } finally {
      setSourceSaving(false);
    }
  };

  const onMergeSources = async () => {
    const from = mergeFromId.trim();
    const into = mergeIntoId.trim();
    if (!from || !into) {
      setError("Choose both a source to merge from and a target source.");
      return;
    }
    if (from === into) {
      setError("Pick two different sources.");
      return;
    }
    setMergeSaving(true);
    setError(null);
    try {
      await mergeEvidenceSources({ fromSourceId: from, intoSourceId: into });
      setMergeFromId("");
      setMergeIntoId("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to merge sources");
    } finally {
      setMergeSaving(false);
    }
  };

  return (
    <section className="evidence-libraries-details">
      <div className="field-label">Sources &amp; repositories</div>
      {error ? <p className="hint hint--danger">{error}</p> : null}
      {loading ? (
        <div className="skeleton-card sidebar-skeleton" aria-label="Loading sources and repositories">
          <span className="sr-only">Loading...</span>
        </div>
      ) : null}
      {!loading ? (
        <div className="stack evidence-panel-stack">
          <div className="person-detail-form-grid person-detail-form-grid--limit">
            <label className="field-group">
              <span className="field-label">New repository name</span>
              <input
                type="text"
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                disabled={repoSaving}
              />
            </label>
            <div className="field-group evidence-field-align-end">
              <button
                type="button"
                className="secondary-button workspace-action-button"
                onClick={() => void onCreateRepository()}
                disabled={repoSaving}
              >
                {repoSaving ? "Saving..." : "Add repository"}
              </button>
            </div>
            <label className="field-group">
              <span className="field-label">New source title</span>
              <input
                type="text"
                value={newSourceTitle}
                onChange={(e) => setNewSourceTitle(e.target.value)}
                disabled={sourceSaving}
              />
            </label>
            <label className="field-group">
              <span className="field-label">Repository (optional)</span>
              <select
                value={newSourceRepoId}
                onChange={(e) => setNewSourceRepoId(e.target.value)}
                disabled={sourceSaving}
              >
                <option value="">— none —</option>
                {repositories.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-group evidence-grid-full-width">
              <button
                type="button"
                className="secondary-button workspace-action-button"
                onClick={() => void onCreateSource()}
                disabled={sourceSaving}
              >
                {sourceSaving ? "Saving..." : "Add source"}
              </button>
            </div>
          </div>

          <div className="stack evidence-panel-divider">
            <div className="field-label">Merge duplicate sources</div>
            <p className="hint hint--tight-below">
              Moves all citations from the first source onto the second, then deletes the first. Use when you
              created the same work twice.
            </p>
            <div className="person-detail-form-grid person-detail-form-grid--limit">
              <label className="field-group">
                <span className="field-label">Merge from (will be removed)</span>
                <select
                  value={mergeFromId}
                  onChange={(e) => setMergeFromId(e.target.value)}
                  disabled={mergeSaving}
                >
                  <option value="">— choose —</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-group">
                <span className="field-label">Into (kept)</span>
                <select
                  value={mergeIntoId}
                  onChange={(e) => setMergeIntoId(e.target.value)}
                  disabled={mergeSaving}
                >
                  <option value="">— choose —</option>
                  {sources.map((s) => (
                    <option key={`into-${s.id}`} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field-group evidence-grid-full-width">
                <button
                  type="button"
                  className="secondary-button workspace-action-button"
                  onClick={() => void onMergeSources()}
                  disabled={mergeSaving}
                >
                  {mergeSaving ? "Merging..." : "Merge sources"}
                </button>
              </div>
            </div>
          </div>

          <div>
            <div className="field-label field-label--spaced">Repositories</div>
            {repositories.length === 0 ? (
              <p className="hint">
                No repositories yet. Add one above or cite an archive name on a life event.
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
            <div className="field-label field-label--spaced">Shared sources</div>
            {sources.length === 0 ? (
              <p className="hint">
                No sources yet. Add one above, or add citations on life events (inline or existing source).
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
