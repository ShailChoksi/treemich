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

type BirthdayFilter = "all" | "filled" | "equal" | "conflict" | "malformed" | "absent" | "skipped" | "failed";

type AppliedPerson = {
  personResult?: string;
  birthdayResult?: string;
  birthDate?: string | null;
  rawBirthDate?: string;
  birthYear?: number | null;
  birthMonth?: number | null;
  birthDay?: number | null;
  message?: string;
};

const emptyBirthdays = { filled: 0, equal: 0, conflict: 0, malformed: 0, absent: 0 };

const formatRunLine = (
  created: number,
  birthdays: typeof emptyBirthdays | undefined,
  skipped: number,
  failed: number
) => {
  const totals = birthdays ?? emptyBirthdays;
  const head = created > 0 ? `${created} new ${created === 1 ? "person" : "people"} added` : "No new people";
  return `${head}, ${totals.filled} imported, ${totals.equal} unchanged, ${totals.conflict} conflicts kept, ${totals.malformed} invalid, ${totals.absent} with no Immich birthday, ${skipped} skipped, ${failed} failed.`;
};

const formatTreemichDate = (
  year: number | null | undefined,
  month: number | null | undefined,
  day: number | null | undefined
) => {
  if (year == null && month == null && day == null) {
    return "none";
  }
  const parts: string[] = [];
  if (year != null) {
    parts.push(String(year));
  }
  if (month != null) {
    parts.push(String(month).padStart(2, "0"));
  }
  if (day != null) {
    parts.push(String(day).padStart(2, "0"));
  }
  return parts.join("-");
};

const formatImmichDate = (
  birthDate: string | null | undefined,
  birthdayResult?: string,
  rawBirthDate?: string
) => {
  if (birthdayResult === "malformed" || rawBirthDate) {
    return "invalid";
  }
  return birthDate || "none";
};

const birthdayFilters: Array<{ id: BirthdayFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "filled", label: "Imported" },
  { id: "equal", label: "Unchanged" },
  { id: "conflict", label: "Conflicts" },
  { id: "malformed", label: "Invalid" },
  { id: "absent", label: "No Immich birthday" },
  { id: "skipped", label: "Skipped" },
  { id: "failed", label: "Failed" }
];

export const ImmichImportWorkspace = ({ people, onImported }: Props) => {
  const [preview, setPreview] = useState<ImmichImportPreviewResponse | null>(null);
  const [actions, setActions] = useState<Record<string, RowAction>>({});
  const [selectedPersonIds, setSelectedPersonIds] = useState<Record<string, string>>({});
  const [showFilter, setShowFilter] = useState<"all" | "unlinked" | "linked">("unlinked");
  const [birthdayFilter, setBirthdayFilter] = useState<BirthdayFilter>("all");
  const [applied, setApplied] = useState<Record<string, AppliedPerson>>({});
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

  const loadPreview = async (options?: { preserveRun?: boolean }) => {
    setBusy(true);
    setError(null);
    if (!options?.preserveRun) {
      setMessage(null);
      setApplied({});
    }
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
      if (!options?.preserveRun) {
        setMessage(`Loaded ${next.totals.immichPeople} Immich people.`);
      }
    } catch (e) {
      if (e instanceof ApiHttpError && e.statusCode === 401) {
        setError("Link or refresh your Immich account before importing people.");
      } else {
        setError(e instanceof Error ? e.message : "Immich preview failed");
      }
      if (options?.preserveRun) {
        throw e;
      }
    } finally {
      setBusy(false);
    }
  };

  const reviewedRows = useMemo(() => {
    const reviewOf = (row: NonNullable<typeof preview>["people"][number]): BirthdayFilter => {
      const overlay = applied[row.providerPersonId];
      if (overlay?.personResult === "error") {
        return "failed";
      }
      if (overlay?.personResult === "skipped") {
        return "skipped";
      }
      if (overlay?.birthdayResult) {
        return overlay.birthdayResult as BirthdayFilter;
      }
      if (row.personResult === "skipped") {
        return "skipped";
      }
      if (row.personResult === "alreadyLinked") {
        return (row.birthdayResult ?? "absent") as BirthdayFilter;
      }
      if ((actions[row.providerPersonId] ?? "skip") === "skip") {
        return "skipped";
      }
      return (row.birthdayResult ?? "absent") as BirthdayFilter;
    };
    return (preview?.people ?? []).map((row) => ({ row, review: reviewOf(row) }));
  }, [actions, applied, preview]);

  const reviewCounts = useMemo(() => {
    const counts: Record<BirthdayFilter, number> = {
      all: reviewedRows.length,
      filled: 0,
      equal: 0,
      conflict: 0,
      malformed: 0,
      absent: 0,
      skipped: 0,
      failed: 0
    };
    for (const item of reviewedRows) {
      if (item.review !== "all") {
        counts[item.review] += 1;
      }
    }
    return counts;
  }, [reviewedRows]);

  const visibleRows = useMemo(() => {
    const birthdayMatched =
      birthdayFilter === "all" ? reviewedRows : reviewedRows.filter((item) => item.review === birthdayFilter);
    if (birthdayFilter !== "all") {
      return birthdayMatched;
    }
    if (showFilter === "linked") {
      return birthdayMatched.filter((item) => item.row.linkedPersonId);
    }
    if (showFilter === "unlinked") {
      return birthdayMatched.filter((item) => !item.row.linkedPersonId);
    }
    return birthdayMatched;
  }, [birthdayFilter, reviewedRows, showFilter]);

  const submitImport = async () => {
    if (!preview) {
      return;
    }
    if (visibleRows.length === 0) {
      setError("There are no visible Immich rows to import.");
      return;
    }
    const decisions: ImmichImportDecision[] = visibleRows.map(({ row }) => {
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
      const line = formatRunLine(
        result.summary.created,
        result.summary.birthdays,
        result.summary.skipped,
        result.summary.errors
      );
      setApplied((current) => ({
        ...current,
        ...Object.fromEntries(result.results.map((row) => [row.providerPersonId, row]))
      }));
      setMessage(line);
      onImported?.();
      try {
        await loadPreview({ preserveRun: true });
      } catch {
        /* Preview refresh is best-effort after import. */
      } finally {
        setMessage(line);
      }
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
      const failed = (result.results ?? []).filter((row) => row.personResult === "error").length;
      const line = formatRunLine(result.created, result.birthdays, result.skippedUnnamed, failed);
      if (result.results) {
        setApplied((current) => ({
          ...current,
          ...Object.fromEntries(result.results.map((row) => [row.providerPersonId, row]))
        }));
      }
      setMessage(line);
      window.dispatchEvent(new Event(IMMICH_PEOPLE_SYNCED_EVENT));
      onImported?.();
      try {
        await loadPreview({ preserveRun: true });
      } catch {
        /* Preview refresh is best-effort after sync. */
      } finally {
        setMessage(line);
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
            Preview Immich people, link them to Treemich people, and fill a missing birthday. An existing
            Treemich birthday is kept.
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
          <div className="toolbar-row" role="group" aria-label="Birthday result filters">
            {birthdayFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                className="button"
                aria-pressed={birthdayFilter === filter.id}
                onClick={() => setBirthdayFilter(filter.id)}
              >
                {filter.label} ({reviewCounts[filter.id]})
              </button>
            ))}
          </div>

          <div className="toolbar-row">
            <label>
              Show{" "}
              <select
                value={showFilter}
                onChange={(e) => setShowFilter(e.target.value as typeof showFilter)}
                aria-label="Immich people link filter"
              >
                <option value="unlinked">Not linked to Treemich</option>
                <option value="linked">Only linked people</option>
                <option value="all">All Immich people</option>
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
            {visibleRows.map(({ row }) => {
              const overlay = applied[row.providerPersonId];
              const showRunDates =
                overlay && overlay.personResult !== "skipped" && overlay.personResult !== "error";
              const birthDate = showRunDates ? (overlay.birthDate ?? row.birthDate) : row.birthDate;
              const rawBirthDate = showRunDates ? overlay.rawBirthDate : row.rawBirthDate;
              const birthdayResult = showRunDates ? overlay.birthdayResult : row.birthdayResult;
              const birthYear = showRunDates ? (overlay.birthYear ?? row.birthYear) : row.birthYear;
              const birthMonth = showRunDates ? (overlay.birthMonth ?? row.birthMonth) : row.birthMonth;
              const birthDay = showRunDates ? (overlay.birthDay ?? row.birthDay) : row.birthDay;
              return (
                <div className="import-row" key={row.providerPersonId}>
                  <img
                    alt=""
                    className="import-row__thumbnail"
                    src={
                      row.linkedPersonId ? personThumbnailUrl(row.linkedPersonId) : row.thumbnailPath || ""
                    }
                  />
                  <div className="import-row__body">
                    <strong>{row.name || "Unnamed Immich person"}</strong>
                    <span className="hint">
                      {row.linkedPersonId
                        ? `Linked to ${row.linkedPersonName ?? row.linkedPersonId}`
                        : "Not linked"}
                    </span>
                    <span className="hint">
                      Immich birthday: {formatImmichDate(birthDate, birthdayResult, rawBirthDate)}
                    </span>
                    <span className="hint">
                      Treemich birthday: {formatTreemichDate(birthYear, birthMonth, birthDay)}
                    </span>
                    {rawBirthDate ? <span className="hint">Raw Immich birthday: {rawBirthDate}</span> : null}
                    {overlay?.personResult === "error" && overlay.message ? (
                      <span className="hint">{overlay.message}</span>
                    ) : null}
                    <span className="hint">
                      {row.candidates.length > 0
                        ? `Best match: ${row.candidates[0]?.name} (${row.candidates[0]?.reason})`
                        : "No suggested match"}
                    </span>
                  </div>
                  <select
                    aria-label={`Decision for ${row.name || "Unnamed Immich person"}`}
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
              );
            })}
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
