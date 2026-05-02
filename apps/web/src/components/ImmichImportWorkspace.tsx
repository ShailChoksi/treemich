import { useMemo, useState } from "react";
import {
  ApiHttpError,
  getImmichImportPreview,
  IMMICH_PEOPLE_SYNCED_EVENT,
  importImmichCooccurrence,
  importImmichPeople,
  importImmichThumbnails,
  personThumbnailUrl,
  syncImmichLabelledPeople,
  type ImmichImportDecision,
  type ImmichImportPreviewResponse,
  type PersonRecord
} from "../lib/api";

type Props = {
  people: PersonRecord[];
  onImported?: () => void;
};

type RowAction = "skip" | "link" | "create";

const splitName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const [givenName, ...surnameParts] = parts;
  return {
    givenName: givenName ?? "Person",
    surname: surnameParts.join(" ") || null
  };
};

export const ImmichImportWorkspace = ({ people, onImported }: Props) => {
  const [preview, setPreview] = useState<ImmichImportPreviewResponse | null>(null);
  const [actions, setActions] = useState<Record<string, RowAction>>({});
  const [selectedPersonIds, setSelectedPersonIds] = useState<Record<string, string>>({});
  const [showFilter, setShowFilter] = useState<"all" | "unlinked" | "linked">("unlinked");
  const [importThumbnails, setImportThumbnails] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const personOptions = useMemo(
    () =>
      [...people].sort(
        (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
      ),
    [people]
  );

  const loadPreview = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const next = await getImmichImportPreview();
      const nextActions: Record<string, RowAction> = {};
      const nextSelected: Record<string, string> = {};
      for (const row of next.people) {
        nextActions[row.providerPersonId] = row.linkedPersonId
          ? "skip"
          : row.candidates[0]
            ? "link"
            : "create";
        nextSelected[row.providerPersonId] = row.linkedPersonId ?? row.candidates[0]?.personId ?? "";
      }
      setPreview(next);
      setActions(nextActions);
      setSelectedPersonIds(nextSelected);
      setMessage(`Loaded ${next.totals.immichPeople} Immich people.`);
    } catch (e) {
      if (e instanceof ApiHttpError && e.statusCode === 401) {
        setError("Link or refresh your Immich account before importing people.");
      } else {
        setError(e instanceof Error ? e.message : "Immich preview failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const visibleRows = useMemo(() => {
    const rows = preview?.people ?? [];
    if (showFilter === "linked") {
      return rows.filter((row) => row.linkedPersonId);
    }
    if (showFilter === "unlinked") {
      return rows.filter((row) => !row.linkedPersonId);
    }
    return rows;
  }, [preview, showFilter]);

  const submitImport = async () => {
    if (!preview) {
      return;
    }
    if (visibleRows.length === 0) {
      setError("There are no visible Immich rows to import.");
      return;
    }
    const decisions: ImmichImportDecision[] = visibleRows.map((row) => {
      const action = actions[row.providerPersonId] ?? "skip";
      if (action === "link") {
        return {
          action,
          providerPersonId: row.providerPersonId,
          personId: selectedPersonIds[row.providerPersonId] || row.candidates[0]?.personId || ""
        };
      }
      if (action === "create") {
        return {
          action,
          providerPersonId: row.providerPersonId,
          ...splitName(row.name)
        };
      }
      return { action: "skip", providerPersonId: row.providerPersonId };
    });
    if (decisions.some((decision) => decision.action === "link" && !decision.personId)) {
      setError("Choose a Treemich person for every Link decision.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await importImmichPeople(decisions, { importThumbnails });
      setMessage(
        `Imported Immich people: ${result.summary.created} created, ${result.summary.linked} linked, ` +
          `${result.summary.alreadyLinked} already linked, ${result.summary.thumbnailsImported} thumbnails.`
      );
      onImported?.();
      await loadPreview();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Immich import failed");
    } finally {
      setBusy(false);
    }
  };

  const refreshThumbnails = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await importImmichThumbnails();
      setMessage(
        `Thumbnail refresh complete: ${result.summary.imported} imported, ${result.summary.errors} errors.`
      );
      onImported?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thumbnail refresh failed");
    } finally {
      setBusy(false);
    }
  };

  const importCooccurrence = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await importImmichCooccurrence();
      setMessage(`Co-occurrence import started (${result.status}).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Co-occurrence import failed");
    } finally {
      setBusy(false);
    }
  };

  const resyncLabelledPeople = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await syncImmichLabelledPeople();
      const headline =
        result.created > 0
          ? `${result.created} new Immich ${result.created === 1 ? "person" : "people"} added.`
          : "No new Immich people added.";
      const detailParts: string[] = [];
      if (result.updated > 0) {
        detailParts.push(`${result.updated} Immich label${result.updated === 1 ? "" : "s"} updated`);
      }
      if (result.alreadyLinked > 0) {
        detailParts.push(`${result.alreadyLinked} already linked`);
      }
      if (result.skippedUnnamed > 0) {
        detailParts.push(`${result.skippedUnnamed} unnamed skipped`);
      }
      const syncSummaryLine = detailParts.length > 0 ? `${headline} (${detailParts.join(", ")}).` : headline;
      setMessage(syncSummaryLine);
      window.dispatchEvent(new Event(IMMICH_PEOPLE_SYNCED_EVENT));
      onImported?.();
      try {
        await loadPreview();
      } catch {
        /* Preview refresh is best-effort after sync. */
      } finally {
        setMessage(syncSummaryLine);
      }
    } catch (e) {
      if (e instanceof ApiHttpError && e.statusCode === 401) {
        setError("Link or refresh your Immich account before re-syncing labelled people.");
      } else {
        setError(e instanceof Error ? e.message : "Immich sync failed");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack">
      <div className="section-heading">
        <div>
          <h2>Immich Import Provider</h2>
          <p className="hint">
            Preview Immich people, link them to Treemich people, create missing people, and import thumbnails.
          </p>
        </div>
        <div className="toolbar-row">
          <button type="button" className="button" disabled={busy} onClick={() => void loadPreview()}>
            Load Immich Preview
          </button>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => void resyncLabelledPeople()}
          >
            Re-sync labelled people
          </button>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {message ? <p className="hint">{message}</p> : null}

      {preview ? (
        <>
          <div className="toolbar-row">
            <label>
              Show{" "}
              <select value={showFilter} onChange={(e) => setShowFilter(e.target.value as typeof showFilter)}>
                <option value="unlinked">Unlinked</option>
                <option value="linked">Linked</option>
                <option value="all">All</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={importThumbnails}
                onChange={(e) => setImportThumbnails(e.target.checked)}
              />{" "}
              Import thumbnails with people
            </label>
          </div>

          <div className="import-table">
            {visibleRows.map((row) => (
              <div className="import-row" key={row.providerPersonId}>
                <img
                  alt=""
                  className="import-row__thumbnail"
                  src={row.linkedPersonId ? personThumbnailUrl(row.linkedPersonId) : row.thumbnailPath || ""}
                />
                <div className="import-row__body">
                  <strong>{row.name || "Unnamed Immich person"}</strong>
                  <span className="hint">
                    {row.linkedPersonId
                      ? `Linked to ${row.linkedPersonName ?? row.linkedPersonId}`
                      : "Not linked"}
                  </span>
                  <span className="hint">
                    {row.candidates.length > 0
                      ? `Best match: ${row.candidates[0]?.name} (${row.candidates[0]?.reason})`
                      : "No suggested match"}
                  </span>
                </div>
                <select
                  value={actions[row.providerPersonId] ?? "skip"}
                  onChange={(e) =>
                    setActions((current) => ({
                      ...current,
                      [row.providerPersonId]: e.target.value as RowAction
                    }))
                  }
                >
                  <option value="skip">Skip</option>
                  <option value="link">Link Existing</option>
                  <option value="create">Create New</option>
                </select>
                {(actions[row.providerPersonId] ?? "skip") === "link" ? (
                  <select
                    value={selectedPersonIds[row.providerPersonId] ?? ""}
                    onChange={(e) =>
                      setSelectedPersonIds((current) => ({
                        ...current,
                        [row.providerPersonId]: e.target.value
                      }))
                    }
                  >
                    <option value="">Choose person...</option>
                    {personOptions.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            ))}
          </div>

          <div className="toolbar-row">
            <button
              type="button"
              className="button button--primary"
              disabled={busy}
              onClick={() => void submitImport()}
            >
              Apply Visible Decisions
            </button>
            <button type="button" className="button" disabled={busy} onClick={() => void refreshThumbnails()}>
              Refresh Linked Thumbnails
            </button>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => void importCooccurrence()}
            >
              Import Co-Occurrence
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
};
