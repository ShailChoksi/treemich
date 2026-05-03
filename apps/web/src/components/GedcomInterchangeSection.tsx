/**
 * @file GEDCOM import wizard (preview session → match/create Treemich people → job) and export.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiHttpError,
  createGedcomImportPreview,
  deleteGedcomImportPreviewSession,
  downloadGedcomExportJobResult,
  fetchGedcomExportDownload,
  getGedcomExportJob,
  getGedcomImportJob,
  getGedcomPreviewIndisPage,
  postGedcomExportJob,
  postGedcomImportJobFromPreview,
  type GedcomDryRunDiff,
  type GedcomImportPreviewSummary,
  type GedcomPreviewIndisPageResponse
} from "../lib/api";
import type { Person } from "../lib/api";
import { GedcomPersonMatchCombobox } from "./gedcom/GedcomPersonMatchCombobox";

type Props = {
  people: Person[];
  onTreeChanged?: () => void;
};

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

const triggerBlobDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const isDryRunDiff = (value: unknown): value is GedcomDryRunDiff => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const obj = value as Partial<GedcomDryRunDiff>;
  return (
    typeof obj.creates === "object" &&
    typeof obj.updates === "object" &&
    typeof obj.reuses === "object" &&
    typeof obj.skips === "object" &&
    typeof obj.conflicts === "object"
  );
};

const formatDryRunDiff = (diff: GedcomDryRunDiff) => {
  const rows = [
    ["Creates", diff.creates],
    ["Updates", diff.updates],
    ["Reuses", diff.reuses],
    ["Skips", diff.skips],
    ["Conflicts", diff.conflicts]
  ] as const;
  return rows
    .map(([label, counts]) => {
      const parts = Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => `${key}: ${count}`)
        .join(", ");
      return parts ? `${label}: ${parts}` : null;
    })
    .filter(Boolean)
    .join(" | ");
};

export const GedcomInterchangeSection = ({ people, onTreeChanged }: Props) => {
  const [importApiAvailable, setImportApiAvailable] = useState<boolean | null>(null);

  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewIdRef = useRef<string | null>(null);
  const [previewSummary, setPreviewSummary] = useState<GedcomImportPreviewSummary | null>(null);
  const [lineLog, setLineLog] = useState<unknown[]>([]);
  const [archiveMediaFiles, setArchiveMediaFiles] = useState<
    { path: string; byteSize: number; mimeType: string | null }[]
  >([]);
  const [page, setPage] = useState<GedcomPreviewIndisPageResponse | null>(null);
  const [pageOffset, setPageOffset] = useState(0);
  const pageLimit = 50;

  const [gedcomSearch, setGedcomSearch] = useState("");
  const [gedcomSearchDebounced, setGedcomSearchDebounced] = useState("");

  const [matchByXref, setMatchByXref] = useState<Record<string, string>>({});
  const [dryRun, setDryRun] = useState(false);
  const [skipImported, setSkipImported] = useState(false);
  const [allowPartialMatches, setAllowPartialMatches] = useState(true);
  const [createMissingPeople, setCreateMissingPeople] = useState(true);
  const [showOnlyUnmatched, setShowOnlyUnmatched] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [lastChosenFile, setLastChosenFile] = useState<File | null>(null);

  const probeDone = useRef(false);

  useEffect(() => {
    previewIdRef.current = previewId;
  }, [previewId]);

  useEffect(() => {
    return () => {
      const id = previewIdRef.current;
      if (id) {
        void deleteGedcomImportPreviewSession(id).catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setGedcomSearchDebounced(gedcomSearch.trim()), 300);
    return () => window.clearTimeout(t);
  }, [gedcomSearch]);

  const probeImport = useCallback(async () => {
    if (probeDone.current) {
      return;
    }
    probeDone.current = true;
    try {
      const file = new File(["0 HEAD\n0 TRLR\n"], "probe.ged", { type: "text/plain" });
      const created = await createGedcomImportPreview(file);
      await deleteGedcomImportPreviewSession(created.previewId);
      setImportApiAvailable(true);
    } catch (e) {
      if (e instanceof ApiHttpError && e.statusCode === 404) {
        setImportApiAvailable(false);
      } else {
        setImportApiAvailable(true);
      }
    }
  }, []);

  useEffect(() => {
    void probeImport();
  }, [probeImport]);

  const matchedXrefList = useMemo(
    () =>
      Object.entries(matchByXref)
        .filter(([, v]) => v.trim())
        .map(([k]) => k),
    [matchByXref]
  );

  const matchedCount = matchedXrefList.length;

  const loadPreviewPage = useCallback(
    async (offset: number) => {
      if (!previewId) {
        return;
      }
      const data = await getGedcomPreviewIndisPage(previewId, {
        offset,
        limit: pageLimit,
        filter: showOnlyUnmatched ? "unmatched" : "all",
        q: gedcomSearchDebounced.length >= 2 ? gedcomSearchDebounced : undefined,
        matchedXrefs: matchedXrefList
      });
      setPage(data);
      setPageOffset(offset);
      setMatchByXref((cur) => {
        let changed = false;
        const next = { ...cur };
        for (const row of data.rows) {
          const h = (row.personHint ?? row.immichHint)?.trim();
          if (h && !next[row.xref]?.trim()) {
            next[row.xref] = h;
            changed = true;
          }
        }
        return changed ? next : cur;
      });
    },
    [gedcomSearchDebounced, matchedXrefList, previewId, showOnlyUnmatched]
  );

  useEffect(() => {
    setPageOffset(0);
  }, [showOnlyUnmatched, gedcomSearchDebounced, previewId]);

  useEffect(() => {
    if (!previewId) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await loadPreviewPage(pageOffset);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load preview page");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPreviewPage, pageOffset, previewId]);

  const runPreviewFromFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setPreviewError(null);
    setStatusNote(null);
    setPreviewId(null);
    setPreviewSummary(null);
    setPage(null);
    setLineLog([]);
    setArchiveMediaFiles([]);
    setMatchByXref({});
    try {
      const created = await createGedcomImportPreview(file);
      setPreviewId(created.previewId);
      setPreviewSummary(created.summary);
      setLineLog(created.lineLog);
      setArchiveMediaFiles(created.archiveMediaFiles);
      const hints: Record<string, string> = {};
      for (const xref of created.initialMatchedXrefs) {
        const row = created.page.rows.find((r) => r.xref === xref);
        const legacy = row?.personHint ?? row?.immichHint;
        if (legacy?.trim()) {
          hints[xref] = legacy.trim();
        }
      }
      for (const row of created.page.rows) {
        const legacyProviderHint = row.personHint ?? row.immichHint;
        const h = legacyProviderHint?.trim();
        if (h) {
          hints[row.xref] = h;
        }
      }
      setMatchByXref(hints);
      setPage({
        previewId: created.previewId,
        ...created.page,
        summary: {
          totalIndis: created.summary.totalIndis,
          totalFams: created.summary.totalFams,
          totalMedia: created.summary.totalMedia,
          famMatchError: created.summary.famMatchError
        }
      });
      setPageOffset(0);
      if (created.summary.famMatchError && !allowPartialMatches && !createMissingPeople) {
        setStatusNote(created.summary.famMatchError);
      }
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const onFileChosen = async (file: File | null) => {
    setError(null);
    setPreviewError(null);
    setStatusNote(null);
    if (!file) {
      setLastChosenFile(null);
      return;
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith(".ged") && !name.endsWith(".zip")) {
      setError("Please choose a .ged file (UTF-8 GEDCOM) or a .zip media bundle.");
      return;
    }
    setLastChosenFile(file);
    await runPreviewFromFile(file);
  };

  const retryPreview = async () => {
    if (!lastChosenFile) {
      setPreviewError("Choose a file again.");
      return;
    }
    await runPreviewFromFile(lastChosenFile);
  };

  const setMatch = (xref: string, personId: string) => {
    setMatchByXref((cur) => ({ ...cur, [xref]: personId }));
  };

  const totalIndis = previewSummary?.totalIndis ?? 0;
  const pageTotal = page?.total ?? 0;
  const rows = page?.rows ?? [];

  const unmatchedForPolicy = Math.max(0, totalIndis - matchedCount);
  const filterActive = showOnlyUnmatched || gedcomSearchDebounced.length >= 2;

  const submitImport = async () => {
    if (!previewId) {
      setError("Choose a file before importing.");
      return;
    }
    if (!dryRun && createMissingPeople && unmatchedForPolicy > 0) {
      const ok = window.confirm(
        `This import will create up to ${unmatchedForPolicy} new Treemich people for unmatched GEDCOM records (based on current matches). Continue?`
      );
      if (!ok) {
        return;
      }
    }
    if (!allowPartialMatches && !createMissingPeople) {
      if (unmatchedForPolicy > 0) {
        setError(`Match every INDI to a Treemich person (${unmatchedForPolicy} still unmatched).`);
        return;
      }
    }
    if (previewSummary?.famMatchError && !allowPartialMatches && !createMissingPeople) {
      setError(previewSummary.famMatchError);
      return;
    }
    setBusy(true);
    setError(null);
    setStatusNote(null);
    try {
      const indiMatches: Record<string, string> = {};
      for (const [xref, v] of Object.entries(matchByXref)) {
        const t = v.trim();
        if (t) {
          indiMatches[xref] = t;
        }
      }
      const importOptions = {
        dryRun,
        skipAlreadyImportedIndis: skipImported,
        allowPartialMatches,
        unmatchedIndiPolicy: createMissingPeople ? ("CREATE" as const) : ("MATCH_ONLY" as const)
      };
      const job = await postGedcomImportJobFromPreview({ previewId, indiMatches, importOptions });
      setPreviewId(null);
      setPreviewSummary(null);
      setPage(null);
      let state = await getGedcomImportJob(job.id);
      for (let i = 0; i < 120 && state.status !== "COMPLETED" && state.status !== "FAILED"; i += 1) {
        await sleep(250);
        state = await getGedcomImportJob(job.id);
      }
      if (state.status === "FAILED") {
        setError(state.errorMessage ?? "Import job failed");
        return;
      }
      const dryRunDiff = isDryRunDiff(state.summary?.dryRunDiff) ? state.summary.dryRunDiff : null;
      setStatusNote(
        dryRunDiff
          ? `Dry-run complete. ${formatDryRunDiff(dryRunDiff)}`
          : `Job completed. Summary: ${JSON.stringify(state.summary ?? {})}`
      );
      if (!dryRun) {
        onTreeChanged?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const immediateExport = async (format: "ged" | "zip") => {
    setBusy(true);
    setError(null);
    try {
      const blob = await fetchGedcomExportDownload(format);
      triggerBlobDownload(blob, format === "zip" ? "treemich-export.zip" : "treemich-export.ged");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export download failed");
    } finally {
      setBusy(false);
    }
  };

  const runAsyncExport = async () => {
    setBusy(true);
    setError(null);
    setStatusNote(null);
    try {
      const job = await postGedcomExportJob({ redactLiving: false, includeTreemichCustomTags: true });
      let state = await getGedcomExportJob(job.id);
      for (let i = 0; i < 120 && state.status !== "COMPLETED" && state.status !== "FAILED"; i += 1) {
        await sleep(250);
        state = await getGedcomExportJob(job.id);
      }
      if (state.status === "FAILED") {
        setError(state.errorMessage ?? "Export job failed");
        return;
      }
      const blob = await downloadGedcomExportJobResult(job.id, state.downloadUrl);
      triggerBlobDownload(blob, `treemich-export-${job.id}.ged`);
      setStatusNote(
        `Async export ready (${state.byteSize ?? blob.size} bytes).${
          state.downloadTokenExpiresAt ? ` Link expires ${state.downloadTokenExpiresAt}.` : ""
        }`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Async export failed");
    } finally {
      setBusy(false);
    }
  };

  const canPrev = pageOffset > 0;
  const canNext = page ? pageOffset + pageLimit < pageTotal : false;
  const rangeLabel =
    pageTotal === 0
      ? "Showing 0 of 0"
      : `Showing ${pageOffset + 1}-${pageOffset + rows.length} of ${pageTotal}`;

  return (
    <section className="evidence-libraries-details gedcom-interchange-panel">
      <div className="field-label">GEDCOM import / export</div>
      {error ? <p className="hint hint--danger">{error}</p> : null}
      {previewError ? <p className="hint hint--danger">{previewError}</p> : null}
      {statusNote ? <p className="hint hint--tight-below">{statusNote}</p> : null}
      <div className="stack evidence-panel-stack">
        <p className="hint hint--tight-below">
          Import can attach GEDCOM data to existing Treemich people or create missing people. Server needs{" "}
          <code className="inline-code">TREEMICH_GEDCOM_IMPORT_ENABLED</code> for preview and jobs.
        </p>
        {importApiAvailable === false ? (
          <p className="hint">GEDCOM import API is not available on this server.</p>
        ) : (
          <>
            <label className="field-group">
              <span className="field-label">GEDCOM file (.ged) or media bundle (.zip)</span>
              <input
                type="file"
                accept=".ged,.zip,text/plain,application/zip"
                disabled={busy}
                onChange={(ev) => void onFileChosen(ev.target.files?.[0] ?? null)}
              />
            </label>
            {previewError && lastChosenFile ? (
              <div className="workspace-action-row">
                <button
                  type="button"
                  className="secondary-button workspace-action-button"
                  disabled={busy}
                  onClick={() => void retryPreview()}
                >
                  Retry preview
                </button>
              </div>
            ) : null}
            <label className="field-group inline-checkbox-row">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                disabled={busy}
              />
              <span>Dry run (no database writes)</span>
            </label>
            <label className="field-group inline-checkbox-row">
              <input
                type="checkbox"
                checked={skipImported}
                onChange={(e) => setSkipImported(e.target.checked)}
                disabled={busy}
              />
              <span>Skip INDI already stamped with gedcomIndi</span>
            </label>
            <label className="field-group inline-checkbox-row">
              <input
                type="checkbox"
                checked={allowPartialMatches}
                onChange={(e) => setAllowPartialMatches(e.target.checked)}
                disabled={busy || createMissingPeople}
              />
              <span>Import only matched people (skip unmatched families)</span>
            </label>
            <label className="field-group inline-checkbox-row">
              <input
                type="checkbox"
                checked={createMissingPeople}
                onChange={(e) => setCreateMissingPeople(e.target.checked)}
                disabled={busy}
              />
              <span>Create missing Treemich people from unmatched GEDCOM INDI records</span>
            </label>
            {previewId && previewSummary ? (
              <div className="stack evidence-panel-divider">
                <div className="field-label">Match each INDI to a Treemich person</div>
                <div className="gedcom-preview-summary card stack">
                  <p className="hint hint--tight-below">
                    {previewSummary.totalIndis} people · {previewSummary.totalFams} families ·{" "}
                    {previewSummary.totalMedia} OBJE records
                    {previewSummary.archiveMediaFileCount > 0
                      ? ` · ${previewSummary.archiveMediaFileCount} archive media files`
                      : ""}
                    {previewSummary.matchedByHintCount > 0
                      ? ` · ${previewSummary.matchedByHintCount} matched from file hints`
                      : ""}
                  </p>
                </div>
                {previewSummary.totalMedia > 0 || archiveMediaFiles.length > 0 ? (
                  <p className="hint hint--tight-below">
                    Media in GEDCOM: {previewSummary.totalMedia} OBJE records
                    {archiveMediaFiles.length > 0
                      ? `; archive contains ${archiveMediaFiles.length} candidate media files.`
                      : "."}
                  </p>
                ) : null}
                <label className="field-group">
                  <span className="field-label">Search people in file</span>
                  <input
                    type="search"
                    className="gedcom-source-search-input"
                    placeholder="Type at least 2 characters…"
                    value={gedcomSearch}
                    onChange={(e) => setGedcomSearch(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="field-group inline-checkbox-row">
                  <input
                    type="checkbox"
                    checked={showOnlyUnmatched}
                    onChange={(e) => setShowOnlyUnmatched(e.target.checked)}
                    disabled={busy}
                  />
                  <span>
                    Show only unmatched rows ({pageTotal} shown of {totalIndis} total in file
                    {showOnlyUnmatched ? "" : " — filter off"})
                  </span>
                </label>
                <table className="gedcom-match-table">
                  <thead>
                    <tr>
                      <th>Name in file</th>
                      <th>Person</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.xref} aria-label={`GEDCOM person ${row.xref}`}>
                        <td>
                          <div className="gedcom-source-name">{row.fullName ?? row.displayName ?? "-"}</div>
                          {row.alternateNames.length > 0 ? (
                            <p className="hint hint--tight-below">Also: {row.alternateNames.join(" · ")}</p>
                          ) : null}
                          {row.birthDate ? (
                            <p className="hint hint--tight-below">Born {row.birthDate}</p>
                          ) : null}
                          {row.relatedPeople.length > 0 ? (
                            <p className="hint hint--tight-below">
                              {row.relatedPeople.map((r) => `${r.label}: ${r.name}`).join(" · ")}
                            </p>
                          ) : null}
                          {(() => {
                            const legacyProviderHint = row.personHint ?? row.immichHint;
                            return legacyProviderHint ? (
                              <p className="hint hint--tight-below">Hint in file: {legacyProviderHint}</p>
                            ) : null;
                          })()}
                        </td>
                        <td>
                          <GedcomPersonMatchCombobox
                            value={matchByXref[row.xref] ?? ""}
                            onChange={(id) => setMatch(row.xref, id)}
                            disabled={busy}
                            ariaLabel={`Treemich person match for ${row.xref}`}
                            people={people}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 ? (
                  <p className="hint hint--tight-below">No rows to show for the current filter.</p>
                ) : null}
                {allowPartialMatches && !createMissingPeople ? (
                  <p className="hint hint--tight-below">
                    Unmatched INDI/FAM rows are skipped during import and logged as warnings.
                  </p>
                ) : null}
                {createMissingPeople ? (
                  <p className="hint hint--tight-below">
                    Unmatched GEDCOM people will be created as Treemich people before family and life-event
                    import.
                  </p>
                ) : null}
                {lineLog.length > 0 ? (
                  <details className="gedcom-line-log">
                    <summary className="hint">Parser log ({lineLog.length} entries, first 40 shown)</summary>
                    <pre className="gedcom-line-pre">{JSON.stringify(lineLog.slice(0, 40), null, 2)}</pre>
                  </details>
                ) : null}
                <div className="gedcom-preview-pagination workspace-action-row">
                  <span className="hint">{rangeLabel}</span>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy || !canPrev}
                    onClick={() => setPageOffset((o) => Math.max(0, o - pageLimit))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy || !canNext}
                    onClick={() => setPageOffset((o) => o + pageLimit)}
                  >
                    Next {pageLimit}
                  </button>
                </div>
                {filterActive ? (
                  <p className="hint hint--danger">
                    Import applies all {totalIndis} people in this preview, not just the {pageTotal} currently
                    listed.
                  </p>
                ) : null}
                <p className="hint hint--tight-below">
                  Applying <strong>all {totalIndis} people</strong>; {matchedCount} matched
                  {unmatchedForPolicy > 0 ? `, ${unmatchedForPolicy} unmatched` : ""}.
                </p>
                <div className="workspace-action-row">
                  <button
                    type="button"
                    className="secondary-button workspace-action-button"
                    disabled={busy || !previewId}
                    onClick={() => void submitImport()}
                  >
                    {busy ? "Working..." : dryRun ? "Run dry-run" : "Apply import"}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}

        <div className="stack evidence-panel-divider">
          <div className="field-label">Export</div>
          <p className="hint hint--tight-below">
            Immediate download calls <code className="inline-code">GET /export/gedcom</code>. Async export
            stores UTF-8 server-side (same byte cap as import) for large trees.
          </p>
          <div className="workspace-action-row">
            <button
              type="button"
              className="secondary-button workspace-action-button"
              disabled={busy}
              onClick={() => void immediateExport("ged")}
            >
              Download .ged
            </button>
            <button
              type="button"
              className="secondary-button workspace-action-button"
              disabled={busy}
              onClick={() => void immediateExport("zip")}
            >
              Download ZIP
            </button>
            <button
              type="button"
              className="secondary-button workspace-action-button"
              disabled={busy}
              onClick={() => void runAsyncExport()}
            >
              Async .ged job
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
