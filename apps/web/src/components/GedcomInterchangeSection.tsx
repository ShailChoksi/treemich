/**
 * @file Phase 5: GEDCOM import wizard (preview → match Immich people → job) and async export job + immediate download.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ApiHttpError,
  downloadGedcomExportJobResult,
  fetchGedcomExportDownload,
  getGedcomExportJob,
  getGedcomImportJob,
  postGedcomExportJob,
  postGedcomImportJob,
  postGedcomImportPreview,
  type GedcomImportPreviewResponse
} from "../lib/api";
import type { ImmichPerson } from "../lib/api";
import { getPersonDisplayLabel } from "../lib/personDisplay";

type Props = {
  people: ImmichPerson[];
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

export const GedcomInterchangeSection = ({ people, onTreeChanged }: Props) => {
  const [open, setOpen] = useState(false);
  const [importApiAvailable, setImportApiAvailable] = useState<boolean | null>(null);

  const [gedcomUtf8, setGedcomUtf8] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("import.ged");
  const [preview, setPreview] = useState<GedcomImportPreviewResponse | null>(null);
  const [matchByXref, setMatchByXref] = useState<Record<string, string>>({});
  const [dryRun, setDryRun] = useState(false);
  const [skipImported, setSkipImported] = useState(false);
  const [allowPartialMatches, setAllowPartialMatches] = useState(true);
  const [showOnlyUnmatched, setShowOnlyUnmatched] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const probeDone = useRef(false);

  const probeImport = useCallback(async () => {
    if (probeDone.current) {
      return;
    }
    probeDone.current = true;
    try {
      await postGedcomImportPreview("0 HEAD\n0 TRLR\n");
      setImportApiAvailable(true);
    } catch (e) {
      if (e instanceof ApiHttpError && e.statusCode === 404) {
        setImportApiAvailable(false);
      } else {
        setImportApiAvailable(true);
      }
    }
  }, []);

  const initMatchesFromPreview = (p: GedcomImportPreviewResponse) => {
    const next: Record<string, string> = {};
    for (const row of p.indis) {
      next[row.xref] = row.immichHint?.trim() ?? "";
    }
    setMatchByXref(next);
  };

  const onToggle = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      void probeImport();
    }
  };

  const onFileChosen = async (file: File | null) => {
    setError(null);
    setPreview(null);
    setGedcomUtf8(null);
    setStatusNote(null);
    if (!file) {
      return;
    }
    const name = file.name.toLowerCase();
    if (name.endsWith(".zip")) {
      setError(
        "ZIP archives are not read in the browser. Extract the .ged file from the export ZIP and upload that UTF-8 file."
      );
      return;
    }
    if (!name.endsWith(".ged")) {
      setError("Please choose a .ged file (UTF-8 GEDCOM).");
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      setGedcomUtf8(text);
      setFileName(file.name || "import.ged");
    } catch {
      setError("Could not read the selected file.");
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    if (!gedcomUtf8) {
      setError("Choose a .ged file first.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatusNote(null);
    try {
      const p = await postGedcomImportPreview(gedcomUtf8);
      setPreview(p);
      initMatchesFromPreview(p);
      if (p.famMatchError) {
        setStatusNote(p.famMatchError);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const setMatch = (xref: string, immichPersonId: string) => {
    setMatchByXref((cur) => ({ ...cur, [xref]: immichPersonId }));
  };

  const matchablePeopleOptions = useMemo(
    () =>
      people
        .map((p) => ({ id: p.id, label: getPersonDisplayLabel(p).trim() }))
        .filter((p) => p.label.length > 0)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [people]
  );

  const indiRowsIncomplete = (p: GedcomImportPreviewResponse) =>
    p.indis.filter((row) => !(matchByXref[row.xref] ?? "").trim());

  const getVisibleRows = (p: GedcomImportPreviewResponse) =>
    showOnlyUnmatched ? p.indis.filter((row) => !(matchByXref[row.xref] ?? "").trim()) : p.indis;

  const submitImport = async () => {
    if (!gedcomUtf8 || !preview) {
      setError("Run preview after choosing a file.");
      return;
    }
    const incomplete = indiRowsIncomplete(preview);
    if (incomplete.length > 0 && !allowPartialMatches) {
      setError(`Match every INDI to an Immich person (${incomplete.length} missing).`);
      return;
    }
    if (preview.famMatchError && !allowPartialMatches) {
      setError(preview.famMatchError);
      return;
    }
    setBusy(true);
    setError(null);
    setStatusNote(null);
    try {
      const indiMatches: Record<string, string> = {};
      for (const row of preview.indis) {
        const v = (matchByXref[row.xref] ?? "").trim();
        if (v) {
          indiMatches[row.xref] = v;
        }
      }
      const job = await postGedcomImportJob({
        gedcomUtf8,
        fileName,
        indiMatches,
        importOptions: { dryRun, skipAlreadyImportedIndis: skipImported, allowPartialMatches }
      });
      let state = await getGedcomImportJob(job.id);
      for (let i = 0; i < 120 && state.status !== "COMPLETED" && state.status !== "FAILED"; i += 1) {
        await sleep(250);
        state = await getGedcomImportJob(job.id);
      }
      if (state.status === "FAILED") {
        setError(state.errorMessage ?? "Import job failed");
        return;
      }
      setStatusNote(`Job completed. Summary: ${JSON.stringify(state.summary ?? {})}`);
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
      const blob = await downloadGedcomExportJobResult(job.id);
      triggerBlobDownload(blob, `treemich-export-${job.id}.ged`);
      setStatusNote(`Async export ready (${state.byteSize ?? blob.size} bytes).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Async export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details
      className="evidence-libraries-details"
      open={open}
      onToggle={(e) => onToggle(e.currentTarget.open)}
    >
      <summary className="field-label person-detail-details-summary">GEDCOM import / export</summary>
      {error ? <p className="hint hint--danger">{error}</p> : null}
      {statusNote ? <p className="hint hint--tight-below">{statusNote}</p> : null}
      {open ? (
        <div className="stack evidence-panel-stack">
          <p className="hint hint--tight-below">
            Import only attaches data to people already in Immich. Server needs{" "}
            <code className="inline-code">TREEMICH_GEDCOM_IMPORT_ENABLED</code> for preview and jobs.
          </p>
          {importApiAvailable === false ? (
            <p className="hint">GEDCOM import API is not available on this server.</p>
          ) : (
            <>
              <label className="field-group">
                <span className="field-label">GEDCOM file (.ged, UTF-8)</span>
                <input
                  type="file"
                  accept=".ged,text/plain"
                  disabled={busy}
                  onChange={(ev) => void onFileChosen(ev.target.files?.[0] ?? null)}
                />
              </label>
              <div className="person-detail-form-grid person-detail-form-grid--limit">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || !gedcomUtf8}
                  onClick={() => void runPreview()}
                >
                  {busy ? "Working…" : "Preview"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || !preview}
                  onClick={() => void submitImport()}
                >
                  {dryRun ? "Run dry-run" : "Apply import"}
                </button>
              </div>
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
                  disabled={busy}
                />
                <span>Import only matched people (skip unmatched families)</span>
              </label>
              {preview ? (
                <div className="stack evidence-panel-divider">
                  <div className="field-label">Match each INDI to an Immich person</div>
                  <label className="field-group inline-checkbox-row">
                    <input
                      type="checkbox"
                      checked={showOnlyUnmatched}
                      onChange={(e) => setShowOnlyUnmatched(e.target.checked)}
                      disabled={busy}
                    />
                    <span>
                      Show only unmatched rows ({indiRowsIncomplete(preview).length} unmatched of{" "}
                      {preview.indis.length})
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
                      {getVisibleRows(preview).map((row) => (
                        <tr key={row.xref}>
                          <td>
                            <div className="gedcom-source-name">{row.displayName ?? "—"}</div>
                            <p className="hint hint--tight-below">Ref: {row.xref}</p>
                          </td>
                          <td>
                            <select
                              className="gedcom-match-select"
                              value={matchByXref[row.xref] ?? ""}
                              onChange={(e) => setMatch(row.xref, e.target.value)}
                              disabled={busy}
                              aria-label={`Immich match for ${row.xref}`}
                            >
                              <option value="">— choose —</option>
                              {matchablePeopleOptions.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                            {row.immichHint ? (
                              <p className="hint hint--tight-below">Hint in file: {row.immichHint}</p>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {getVisibleRows(preview).length === 0 ? (
                    <p className="hint hint--tight-below">No rows to show for the current filter.</p>
                  ) : null}
                  {allowPartialMatches ? (
                    <p className="hint hint--tight-below">
                      Unmatched INDI/FAM rows are skipped during import and logged as warnings.
                    </p>
                  ) : null}
                  {preview.lineLog.length > 0 ? (
                    <details className="gedcom-line-log">
                      <summary className="hint">
                        Parser log ({preview.lineLog.length} entries, first 40 shown)
                      </summary>
                      <pre className="gedcom-line-pre">
                        {JSON.stringify(preview.lineLog.slice(0, 40), null, 2)}
                      </pre>
                    </details>
                  ) : null}
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
            <div className="person-detail-form-grid person-detail-form-grid--limit">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => void immediateExport("ged")}
              >
                Download .ged
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => void immediateExport("zip")}
              >
                Download ZIP
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => void runAsyncExport()}
              >
                Async .ged job
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </details>
  );
};
