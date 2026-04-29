/**
 * @file Create/edit rich life event with partial dates, place, and citations.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  createLifeEventBodySchema,
  dateQualifierValues,
  lifeEventTypeLabels,
  lifeEventTypePickerGroups,
  lifeEventTypeValues,
  patchLifeEventBodySchema,
  type CreateLifeEventBody,
  type DateQualifierValue,
  type LifeEventTypeValue,
  type PatchLifeEventBody
} from "@treemich/shared";
import type { LifeEventRecord, SourceRecord } from "../../lib/api";
import { listEvidenceSources } from "../../lib/api";
import { nullIfEmpty, optionalFloat, optionalInt } from "../../lib/lifeEventFormHelpers";

type Props = {
  variant: "create" | "edit";
  initialEvent?: LifeEventRecord;
  /** Create: limit types (e.g. exclude BIRTH/DEATH when already present) */
  allowedCreateTypes?: LifeEventTypeValue[];
  /** Create: hide type dropdown */
  fixedEventType?: LifeEventTypeValue;
  onSubmitCreate: (body: CreateLifeEventBody) => Promise<void>;
  onSubmitPatch: (eventId: string, body: PatchLifeEventBody) => Promise<void>;
  onDelete?: (eventId: string) => Promise<void>;
  onCancel: () => void;
  disabled?: boolean;
};

type CitationFormRow = {
  id: string;
  citationMode: "inline" | "existing";
  sourceId: string;
  title: string;
  repository: string;
  url: string;
  page: string;
  notes: string;
  citedAt: string;
};

type ValidationField = "customLabel" | "placeName" | "placeLat" | "placeLng" | `citation-${string}-source`;

const defaultCreateType = (allowed: LifeEventTypeValue[] | undefined): LifeEventTypeValue => {
  const list = allowed?.length ? allowed : [...lifeEventTypeValues];
  return list[0] ?? "CUSTOM";
};

export const LifeEventRichForm = ({
  variant,
  initialEvent,
  allowedCreateTypes,
  fixedEventType,
  onSubmitCreate,
  onSubmitPatch,
  onDelete,
  onCancel,
  disabled = false
}: Props) => {
  const [error, setError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<ValidationField | null>(null);
  const errorId = useId();
  const citationIdRef = useRef(0);
  const nextCitationRowId = useCallback(() => {
    citationIdRef.current += 1;
    return `citation-${initialEvent?.id ?? variant}-${citationIdRef.current}`;
  }, [initialEvent?.id, variant]);

  const [eventType, setEventType] = useState<LifeEventTypeValue>(
    fixedEventType ?? initialEvent?.eventType ?? defaultCreateType(allowedCreateTypes)
  );
  const [dateQualifier, setDateQualifier] = useState<DateQualifierValue>(
    initialEvent?.dateQualifier ?? "EXACT"
  );
  const [year, setYear] = useState(initialEvent?.year != null ? String(initialEvent.year) : "");
  const [month, setMonth] = useState(initialEvent?.month != null ? String(initialEvent.month) : "");
  const [day, setDay] = useState(initialEvent?.day != null ? String(initialEvent.day) : "");
  const [endYear, setEndYear] = useState(initialEvent?.endYear != null ? String(initialEvent.endYear) : "");
  const [endMonth, setEndMonth] = useState(
    initialEvent?.endMonth != null ? String(initialEvent.endMonth) : ""
  );
  const [endDay, setEndDay] = useState(initialEvent?.endDay != null ? String(initialEvent.endDay) : "");
  const [notes, setNotes] = useState(initialEvent?.notes ?? "");
  const [customLabel, setCustomLabel] = useState(initialEvent?.customLabel ?? "");

  const [placeName, setPlaceName] = useState(initialEvent?.place?.name ?? "");
  const [placeLocality, setPlaceLocality] = useState(initialEvent?.place?.locality ?? "");
  const [placeCountryCode, setPlaceCountryCode] = useState(initialEvent?.place?.countryCode ?? "");
  const [placeAddressLine1, setPlaceAddressLine1] = useState(initialEvent?.place?.addressLine1 ?? "");
  const [placeAdminArea, setPlaceAdminArea] = useState(initialEvent?.place?.adminArea ?? "");
  const [placePostalCode, setPlacePostalCode] = useState(initialEvent?.place?.postalCode ?? "");
  const [placeLat, setPlaceLat] = useState(
    initialEvent?.place?.latitude != null ? String(initialEvent.place.latitude) : ""
  );
  const [placeLng, setPlaceLng] = useState(
    initialEvent?.place?.longitude != null ? String(initialEvent.place.longitude) : ""
  );
  const [placeNotes, setPlaceNotes] = useState(initialEvent?.place?.notes ?? "");

  const [sourceCatalog, setSourceCatalog] = useState<SourceRecord[]>([]);

  const [citationRows, setCitationRows] = useState<CitationFormRow[]>(() =>
    (initialEvent?.citations ?? []).map((c) => {
      const sid = c.sourceId?.trim() || c.source?.id;
      const stableId =
        "id" in c && typeof c.id === "string" ? c.id : `citation-initial-${citationIdRef.current++}`;
      if (sid) {
        return {
          id: stableId,
          citationMode: "existing",
          sourceId: sid,
          title: c.title ?? "",
          repository: c.repository ?? "",
          url: c.url ?? "",
          page: c.page ?? "",
          notes: c.notes ?? "",
          citedAt: c.citedAt ?? ""
        };
      }
      return {
        id: stableId,
        citationMode: "inline",
        sourceId: "",
        title: c.title ?? "",
        repository: c.repository ?? "",
        url: c.url ?? "",
        page: c.page ?? "",
        notes: c.notes ?? "",
        citedAt: c.citedAt ?? ""
      };
    })
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await listEvidenceSources();
        if (!cancelled) {
          setSourceCatalog(list);
        }
      } catch {
        /* catalog is optional for editing */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const typeOptions = useMemo(() => {
    if (fixedEventType) {
      return [fixedEventType];
    }
    if (allowedCreateTypes?.length) {
      return allowedCreateTypes;
    }
    return [...lifeEventTypeValues];
  }, [allowedCreateTypes, fixedEventType]);

  const setFormError = useCallback((message: string, field: ValidationField | null = null) => {
    setError(message);
    setInvalidField(field);
  }, []);

  const clearFormError = useCallback(() => {
    setError(null);
    setInvalidField(null);
  }, []);

  const fieldErrorProps = useCallback(
    (field: ValidationField) => ({
      "aria-invalid": invalidField === field ? true : undefined,
      "aria-describedby": invalidField === field ? errorId : undefined,
      className: invalidField === field ? "input-error" : undefined
    }),
    [errorId, invalidField]
  );

  const buildPlacePayload = (
    lat: number | null,
    lng: number | null
  ): { value: NonNullable<CreateLifeEventBody["place"]> | null; error: string | null } => {
    const name = nullIfEmpty(placeName);
    const locality = nullIfEmpty(placeLocality);
    const countryRaw = nullIfEmpty(placeCountryCode);
    const countryCode = countryRaw && countryRaw.length === 2 ? countryRaw.toUpperCase() : null;
    const addressLine1 = nullIfEmpty(placeAddressLine1);
    const adminArea = nullIfEmpty(placeAdminArea);
    const postalCode = nullIfEmpty(placePostalCode);
    const pNotes = nullIfEmpty(placeNotes);
    const hasAnyPlaceInput =
      !!name ||
      !!locality ||
      !!countryCode ||
      !!addressLine1 ||
      !!adminArea ||
      !!postalCode ||
      lat != null ||
      lng != null ||
      !!pNotes;
    if (!hasAnyPlaceInput) {
      return { value: null, error: null };
    }
    if (!name) {
      return { value: null, error: "Place name is required when entering place details." };
    }
    return {
      value: {
        name,
        locality,
        countryCode,
        addressLine1,
        adminArea,
        postalCode,
        latitude: lat,
        longitude: lng,
        notes: pNotes
      },
      error: null
    };
  };

  const mapRowToPayload = (row: CitationFormRow) => {
    if (row.citationMode === "existing") {
      const sid = row.sourceId.trim();
      if (!sid) {
        return null;
      }
      return {
        sourceId: sid,
        title: null,
        repository: null,
        url: null,
        page: nullIfEmpty(row.page),
        notes: nullIfEmpty(row.notes),
        citedAt: nullIfEmpty(row.citedAt)
      };
    }
    return {
      sourceId: null,
      title: nullIfEmpty(row.title),
      repository: nullIfEmpty(row.repository),
      url: nullIfEmpty(row.url),
      page: nullIfEmpty(row.page),
      notes: nullIfEmpty(row.notes),
      citedAt: nullIfEmpty(row.citedAt)
    };
  };

  const buildCitationsPayloadForCreate = () => {
    const rows = citationRows
      .map(mapRowToPayload)
      .filter(
        (row): row is NonNullable<typeof row> =>
          row != null &&
          Boolean(
            row.sourceId || row.title || row.repository || row.url || row.page || row.notes || row.citedAt
          )
      );
    return rows.length ? rows : undefined;
  };

  const buildCitationsPayloadForPatch = () => {
    return citationRows
      .map(mapRowToPayload)
      .filter(
        (row): row is NonNullable<typeof row> =>
          row != null &&
          Boolean(
            row.sourceId || row.title || row.repository || row.url || row.page || row.notes || row.citedAt
          )
      );
  };

  const handleSubmit = useCallback(async () => {
    clearFormError();
    const y = optionalInt(year);
    const m = optionalInt(month);
    const d = optionalInt(day);
    const ey = optionalInt(endYear);
    const em = optionalInt(endMonth);
    const ed = optionalInt(endDay);
    const latRaw = placeLat.trim();
    const lngRaw = placeLng.trim();
    const lat = optionalFloat(placeLat);
    const lng = optionalFloat(placeLng);
    if (latRaw && lat == null) {
      setFormError("Latitude must be a valid number (e.g. 40.7128).", "placeLat");
      return;
    }
    if (lngRaw && lng == null) {
      setFormError("Longitude must be a valid number (e.g. -74.0060).", "placeLng");
      return;
    }
    if (lat != null && (lat < -90 || lat > 90)) {
      setFormError("Latitude must be between -90 and 90.", "placeLat");
      return;
    }
    if (lng != null && (lng < -180 || lng > 180)) {
      setFormError("Longitude must be between -180 and 180.", "placeLng");
      return;
    }
    const placeResult = buildPlacePayload(lat, lng);
    if (placeResult.error) {
      setFormError(placeResult.error, "placeName");
      return;
    }
    const place = placeResult.value;

    for (let i = 0; i < citationRows.length; i += 1) {
      const row = citationRows[i]!;
      if (row.citationMode === "existing" && !row.sourceId.trim()) {
        setFormError(
          `Citation ${i + 1}: choose a source or switch to inline entry.`,
          `citation-${row.id}-source`
        );
        return;
      }
    }

    const effectiveType =
      variant === "create" ? (fixedEventType ?? eventType) : (initialEvent?.eventType ?? eventType);
    if (effectiveType === "CUSTOM" && !nullIfEmpty(customLabel)) {
      setFormError("Custom events need a short display label.", "customLabel");
      return;
    }

    if (variant === "create") {
      const body: CreateLifeEventBody = {
        eventType: fixedEventType ?? eventType,
        dateQualifier,
        year: y,
        month: m,
        day: d,
        endYear: ey,
        endMonth: em,
        endDay: ed,
        place: place ?? undefined,
        placeId: undefined,
        notes: nullIfEmpty(notes),
        ...(effectiveType === "CUSTOM" ? { customLabel: nullIfEmpty(customLabel) } : {}),
        citations: buildCitationsPayloadForCreate()
      };
      const parsed = createLifeEventBodySchema.safeParse(body);
      if (!parsed.success) {
        setFormError(parsed.error.issues[0]?.message ?? "Invalid life event");
        return;
      }
      await onSubmitCreate(parsed.data);
      return;
    }

    if (!initialEvent) {
      return;
    }
    const patch: PatchLifeEventBody = {
      dateQualifier,
      year: y,
      month: m,
      day: d,
      endYear: ey,
      endMonth: em,
      endDay: ed,
      notes: nullIfEmpty(notes),
      citations: buildCitationsPayloadForPatch(),
      ...(initialEvent.eventType === "CUSTOM" ? { customLabel: nullIfEmpty(customLabel) } : {}),
      ...(initialEvent.place && !place
        ? { placeId: null, place: null }
        : place
          ? { placeId: null, place }
          : {})
    };
    const parsed = patchLifeEventBodySchema.safeParse(patch);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Invalid life event");
      return;
    }
    await onSubmitPatch(initialEvent.id, parsed.data);
  }, [
    buildPlacePayload,
    buildCitationsPayloadForCreate,
    buildCitationsPayloadForPatch,
    citationRows,
    clearFormError,
    customLabel,
    dateQualifier,
    day,
    endDay,
    endMonth,
    endYear,
    eventType,
    fixedEventType,
    initialEvent,
    month,
    notes,
    onSubmitCreate,
    onSubmitPatch,
    placeLat,
    placeLng,
    setFormError,
    variant,
    year
  ]);

  const handleDelete = useCallback(async () => {
    if (!initialEvent || !onDelete) {
      return;
    }
    clearFormError();
    await onDelete(initialEvent.id);
  }, [clearFormError, initialEvent, onDelete]);

  const addCitationRow = useCallback(() => {
    setCitationRows((rows) => [
      ...rows,
      {
        id: nextCitationRowId(),
        citationMode: "inline",
        sourceId: "",
        title: "",
        repository: "",
        url: "",
        page: "",
        notes: "",
        citedAt: ""
      }
    ]);
  }, [nextCitationRowId]);

  const updateCitation = useCallback((index: number, key: keyof CitationFormRow, value: string) => {
    setCitationRows((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }, []);

  const setCitationMode = useCallback((index: number, mode: "inline" | "existing") => {
    setCitationRows((rows) =>
      rows.map((row, i) =>
        i === index
          ? {
              ...row,
              citationMode: mode,
              ...(mode === "inline" ? { sourceId: "" } : {})
            }
          : row
      )
    );
  }, []);

  const removeCitation = useCallback((index: number) => {
    setCitationRows((rows) => rows.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="life-event-rich-form stack">
      {error ? (
        <p id={errorId} className="hint hint--danger" aria-live="polite">
          {error}
        </p>
      ) : null}
      <div className="person-detail-form-grid">
        {variant === "create" && !fixedEventType ? (
          <label className="field-group">
            <span className="field-label">Event type</span>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as LifeEventTypeValue)}
              disabled={disabled}
            >
              {lifeEventTypePickerGroups.map((group) => {
                const opts = group.types.filter((t) => typeOptions.includes(t));
                if (opts.length === 0) {
                  return null;
                }
                return (
                  <optgroup key={group.id} label={group.label}>
                    {opts.map((t) => (
                      <option key={t} value={t}>
                        {lifeEventTypeLabels[t]}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
              {typeOptions
                .filter(
                  (t) => !lifeEventTypePickerGroups.some((g) => (g.types as readonly string[]).includes(t))
                )
                .map((t) => (
                  <option key={t} value={t}>
                    {lifeEventTypeLabels[t]}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
        {(variant === "create" && (fixedEventType ?? eventType) === "CUSTOM") ||
        (variant === "edit" && initialEvent?.eventType === "CUSTOM") ? (
          <label className="field-group">
            <span className="field-label">Custom label</span>
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="e.g. Military discharge"
              maxLength={200}
              disabled={disabled}
              {...fieldErrorProps("customLabel")}
            />
          </label>
        ) : null}
        <label className="field-group">
          <span className="field-label">Date qualifier</span>
          <select
            value={dateQualifier}
            onChange={(e) => setDateQualifier(e.target.value as DateQualifierValue)}
            disabled={disabled}
          >
            {dateQualifierValues.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </label>
        <label className="field-group">
          <span className="field-label">Year</span>
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            disabled={disabled}
            inputMode="numeric"
          />
        </label>
        <label className="field-group">
          <span className="field-label">Month</span>
          <input
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            disabled={disabled}
            inputMode="numeric"
          />
        </label>
        <label className="field-group">
          <span className="field-label">Day</span>
          <input
            value={day}
            onChange={(e) => setDay(e.target.value)}
            disabled={disabled}
            inputMode="numeric"
          />
        </label>
        {dateQualifier === "BETWEEN" ? (
          <>
            <label className="field-group">
              <span className="field-label">End year</span>
              <input value={endYear} onChange={(e) => setEndYear(e.target.value)} disabled={disabled} />
            </label>
            <label className="field-group">
              <span className="field-label">End month</span>
              <input value={endMonth} onChange={(e) => setEndMonth(e.target.value)} disabled={disabled} />
            </label>
            <label className="field-group">
              <span className="field-label">End day</span>
              <input value={endDay} onChange={(e) => setEndDay(e.target.value)} disabled={disabled} />
            </label>
          </>
        ) : null}
        <label className="field-group field-group--full">
          <span className="field-label">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={disabled} rows={3} />
        </label>
      </div>
      <fieldset className="life-event-place-fieldset">
        <legend className="field-label">Place (inline)</legend>
        <div className="person-detail-form-grid">
          <label className="field-group">
            <span className="field-label">Name</span>
            <input
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
              disabled={disabled}
              {...fieldErrorProps("placeName")}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Locality</span>
            <input
              value={placeLocality}
              onChange={(e) => setPlaceLocality(e.target.value)}
              disabled={disabled}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Country code</span>
            <input
              value={placeCountryCode}
              onChange={(e) => setPlaceCountryCode(e.target.value)}
              disabled={disabled}
              maxLength={2}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Address line 1</span>
            <input
              value={placeAddressLine1}
              onChange={(e) => setPlaceAddressLine1(e.target.value)}
              disabled={disabled}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Admin area</span>
            <input
              value={placeAdminArea}
              onChange={(e) => setPlaceAdminArea(e.target.value)}
              disabled={disabled}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Postal code</span>
            <input
              value={placePostalCode}
              onChange={(e) => setPlacePostalCode(e.target.value)}
              disabled={disabled}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Latitude</span>
            <input
              value={placeLat}
              onChange={(e) => setPlaceLat(e.target.value)}
              disabled={disabled}
              {...fieldErrorProps("placeLat")}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Longitude</span>
            <input
              value={placeLng}
              onChange={(e) => setPlaceLng(e.target.value)}
              disabled={disabled}
              {...fieldErrorProps("placeLng")}
            />
          </label>
          <label className="field-group field-group--full">
            <span className="field-label">Place notes</span>
            <textarea
              value={placeNotes}
              onChange={(e) => setPlaceNotes(e.target.value)}
              disabled={disabled}
              rows={2}
            />
          </label>
        </div>
      </fieldset>
      <div className="life-event-citations stack">
        <span className="field-label">Citations</span>
        {citationRows.map((row, index) => (
          <div key={row.id} className="person-detail-form-grid citation-row">
            <label className="field-group">
              <span className="field-label">Entry mode</span>
              <select
                value={row.citationMode}
                onChange={(e) => setCitationMode(index, e.target.value as "inline" | "existing")}
                disabled={disabled}
              >
                <option value="inline">Inline (new source)</option>
                <option value="existing">Existing source</option>
              </select>
            </label>
            {row.citationMode === "existing" ? (
              <label className="field-group field-group--full">
                <span className="field-label">Source</span>
                <select
                  value={row.sourceId}
                  onChange={(e) => updateCitation(index, "sourceId", e.target.value)}
                  disabled={disabled}
                  {...fieldErrorProps(`citation-${row.id}-source`)}
                >
                  <option value="">Select…</option>
                  {sourceCatalog.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                      {s.repository ? ` (${s.repository.name})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {row.citationMode === "inline" ? (
              <>
                <label className="field-group">
                  <span className="field-label">Title</span>
                  <input
                    value={row.title}
                    onChange={(e) => updateCitation(index, "title", e.target.value)}
                    disabled={disabled}
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Repository</span>
                  <input
                    value={row.repository}
                    onChange={(e) => updateCitation(index, "repository", e.target.value)}
                    disabled={disabled}
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">URL</span>
                  <input
                    value={row.url}
                    onChange={(e) => updateCitation(index, "url", e.target.value)}
                    disabled={disabled}
                  />
                </label>
              </>
            ) : null}
            <label className="field-group">
              <span className="field-label">Page</span>
              <input
                value={row.page}
                onChange={(e) => updateCitation(index, "page", e.target.value)}
                disabled={disabled}
              />
            </label>
            <label className="field-group">
              <span className="field-label">Cited at</span>
              <input
                value={row.citedAt}
                onChange={(e) => updateCitation(index, "citedAt", e.target.value)}
                disabled={disabled}
              />
            </label>
            <label className="field-group field-group--full">
              <span className="field-label">Citation notes</span>
              <textarea
                value={row.notes}
                onChange={(e) => updateCitation(index, "notes", e.target.value)}
                disabled={disabled}
                rows={2}
              />
            </label>
            <button
              type="button"
              className="secondary-button"
              onClick={() => removeCitation(index)}
              disabled={disabled}
            >
              Remove citation
            </button>
          </div>
        ))}
        <button type="button" className="secondary-button" onClick={addCitationRow} disabled={disabled}>
          Add citation
        </button>
      </div>
      <div className="add-relative-actions">
        <button type="button" onClick={() => void handleSubmit()} disabled={disabled}>
          {variant === "create" ? "Create event" : "Save changes"}
        </button>
        <button type="button" className="secondary-button" onClick={onCancel} disabled={disabled}>
          Cancel
        </button>
        {variant === "edit" && onDelete ? (
          <button
            type="button"
            className="secondary-button danger-button"
            onClick={() => void handleDelete()}
            disabled={disabled}
          >
            Delete event
          </button>
        ) : null}
      </div>
    </div>
  );
};
