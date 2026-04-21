import { useMemo, useState } from "react";
import {
  createLifeEventBodySchema,
  dateQualifierValues,
  lifeEventTypeValues,
  patchLifeEventBodySchema,
  type CreateLifeEventBody,
  type DateQualifierValue,
  type LifeEventTypeValue,
  type PatchLifeEventBody
} from "@treemich/shared";
import type { LifeEventRecord } from "../../lib/api";
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
  const [endMonth, setEndMonth] = useState(initialEvent?.endMonth != null ? String(initialEvent.endMonth) : "");
  const [endDay, setEndDay] = useState(initialEvent?.endDay != null ? String(initialEvent.endDay) : "");
  const [notes, setNotes] = useState(initialEvent?.notes ?? "");

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

  const [citationRows, setCitationRows] = useState<
    { title: string; repository: string; url: string; page: string; notes: string; citedAt: string }[]
  >(() =>
    (initialEvent?.citations ?? []).map((c) => ({
      title: c.title ?? "",
      repository: c.repository ?? "",
      url: c.url ?? "",
      page: c.page ?? "",
      notes: c.notes ?? "",
      citedAt: c.citedAt ?? ""
    }))
  );

  const typeOptions = useMemo(() => {
    if (fixedEventType) {
      return [fixedEventType];
    }
    if (allowedCreateTypes?.length) {
      return allowedCreateTypes;
    }
    return [...lifeEventTypeValues];
  }, [allowedCreateTypes, fixedEventType]);

  const buildPlacePayload = () => {
    const name = nullIfEmpty(placeName);
    const locality = nullIfEmpty(placeLocality);
    const countryRaw = nullIfEmpty(placeCountryCode);
    const countryCode =
      countryRaw && countryRaw.length === 2 ? countryRaw.toUpperCase() : null;
    const addressLine1 = nullIfEmpty(placeAddressLine1);
    const adminArea = nullIfEmpty(placeAdminArea);
    const postalCode = nullIfEmpty(placePostalCode);
    const lat = optionalFloat(placeLat);
    const lng = optionalFloat(placeLng);
    const pNotes = nullIfEmpty(placeNotes);
    if (!name && !locality && !countryCode && !addressLine1 && !adminArea && !postalCode && lat == null && lng == null && !pNotes) {
      return null;
    }
    if (!name) {
      return null;
    }
    return {
      name,
      locality,
      countryCode,
      addressLine1,
      adminArea,
      postalCode,
      latitude: lat,
      longitude: lng,
      notes: pNotes
    };
  };

  const buildCitationsPayloadForCreate = () => {
    const rows = citationRows
      .map((row) => ({
        title: nullIfEmpty(row.title),
        repository: nullIfEmpty(row.repository),
        url: nullIfEmpty(row.url),
        page: nullIfEmpty(row.page),
        notes: nullIfEmpty(row.notes),
        citedAt: nullIfEmpty(row.citedAt)
      }))
      .filter(
        (row) =>
          row.title ||
          row.repository ||
          row.url ||
          row.page ||
          row.notes ||
          row.citedAt
      );
    return rows.length ? rows : undefined;
  };

  const buildCitationsPayloadForPatch = () => {
    const rows = citationRows.map((row) => ({
      title: nullIfEmpty(row.title),
      repository: nullIfEmpty(row.repository),
      url: nullIfEmpty(row.url),
      page: nullIfEmpty(row.page),
      notes: nullIfEmpty(row.notes),
      citedAt: nullIfEmpty(row.citedAt)
    }));
    return rows.filter(
      (row) =>
        row.title ||
        row.repository ||
        row.url ||
        row.page ||
        row.notes ||
        row.citedAt
    );
  };

  const handleSubmit = async () => {
    setError(null);
    const y = optionalInt(year);
    const m = optionalInt(month);
    const d = optionalInt(day);
    const ey = optionalInt(endYear);
    const em = optionalInt(endMonth);
    const ed = optionalInt(endDay);
    const place = buildPlacePayload();

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
        citations: buildCitationsPayloadForCreate()
      };
      const parsed = createLifeEventBodySchema.safeParse(body);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Invalid life event");
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
      ...(initialEvent.place && !place
        ? { placeId: null, place: null }
        : place
          ? { placeId: null, place }
          : {})
    };
    const parsed = patchLifeEventBodySchema.safeParse(patch);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid life event");
      return;
    }
    await onSubmitPatch(initialEvent.id, parsed.data);
  };

  const handleDelete = async () => {
    if (!initialEvent || !onDelete) {
      return;
    }
    setError(null);
    await onDelete(initialEvent.id);
  };

  const addCitationRow = () => {
    setCitationRows((rows) => [...rows, { title: "", repository: "", url: "", page: "", notes: "", citedAt: "" }]);
  };

  const updateCitation = (index: number, key: keyof (typeof citationRows)[0], value: string) => {
    setCitationRows((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const removeCitation = (index: number) => {
    setCitationRows((rows) => rows.filter((_, i) => i !== index));
  };

  return (
    <div className="life-event-rich-form stack">
      {error ? <p className="hint" style={{ color: "var(--danger, #c62828)" }}>{error}</p> : null}
      <div className="person-detail-form-grid">
        {variant === "create" && !fixedEventType ? (
          <label className="field-group">
            <span className="field-label">Event type</span>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as LifeEventTypeValue)}
              disabled={disabled}
            >
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
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
          <input value={year} onChange={(e) => setYear(e.target.value)} disabled={disabled} inputMode="numeric" />
        </label>
        <label className="field-group">
          <span className="field-label">Month</span>
          <input value={month} onChange={(e) => setMonth(e.target.value)} disabled={disabled} inputMode="numeric" />
        </label>
        <label className="field-group">
          <span className="field-label">Day</span>
          <input value={day} onChange={(e) => setDay(e.target.value)} disabled={disabled} inputMode="numeric" />
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
        <label className="field-group" style={{ gridColumn: "1 / -1" }}>
          <span className="field-label">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={disabled} rows={3} />
        </label>
      </div>
      <fieldset className="life-event-place-fieldset">
        <legend className="field-label">Place (inline)</legend>
        <div className="person-detail-form-grid">
          <label className="field-group">
            <span className="field-label">Name</span>
            <input value={placeName} onChange={(e) => setPlaceName(e.target.value)} disabled={disabled} />
          </label>
          <label className="field-group">
            <span className="field-label">Locality</span>
            <input value={placeLocality} onChange={(e) => setPlaceLocality(e.target.value)} disabled={disabled} />
          </label>
          <label className="field-group">
            <span className="field-label">Country code</span>
            <input value={placeCountryCode} onChange={(e) => setPlaceCountryCode(e.target.value)} disabled={disabled} maxLength={2} />
          </label>
          <label className="field-group">
            <span className="field-label">Address line 1</span>
            <input value={placeAddressLine1} onChange={(e) => setPlaceAddressLine1(e.target.value)} disabled={disabled} />
          </label>
          <label className="field-group">
            <span className="field-label">Admin area</span>
            <input value={placeAdminArea} onChange={(e) => setPlaceAdminArea(e.target.value)} disabled={disabled} />
          </label>
          <label className="field-group">
            <span className="field-label">Postal code</span>
            <input value={placePostalCode} onChange={(e) => setPlacePostalCode(e.target.value)} disabled={disabled} />
          </label>
          <label className="field-group">
            <span className="field-label">Latitude</span>
            <input value={placeLat} onChange={(e) => setPlaceLat(e.target.value)} disabled={disabled} />
          </label>
          <label className="field-group">
            <span className="field-label">Longitude</span>
            <input value={placeLng} onChange={(e) => setPlaceLng(e.target.value)} disabled={disabled} />
          </label>
          <label className="field-group" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Place notes</span>
            <textarea value={placeNotes} onChange={(e) => setPlaceNotes(e.target.value)} disabled={disabled} rows={2} />
          </label>
        </div>
      </fieldset>
      <div className="life-event-citations stack">
        <span className="field-label">Citations</span>
        {citationRows.map((row, index) => (
          <div key={index} className="person-detail-form-grid" style={{ borderBottom: "1px solid rgba(0,0,0,0.08)", paddingBottom: "0.5rem" }}>
            <label className="field-group">
              <span className="field-label">Title</span>
              <input value={row.title} onChange={(e) => updateCitation(index, "title", e.target.value)} disabled={disabled} />
            </label>
            <label className="field-group">
              <span className="field-label">Repository</span>
              <input value={row.repository} onChange={(e) => updateCitation(index, "repository", e.target.value)} disabled={disabled} />
            </label>
            <label className="field-group">
              <span className="field-label">URL</span>
              <input value={row.url} onChange={(e) => updateCitation(index, "url", e.target.value)} disabled={disabled} />
            </label>
            <label className="field-group">
              <span className="field-label">Page</span>
              <input value={row.page} onChange={(e) => updateCitation(index, "page", e.target.value)} disabled={disabled} />
            </label>
            <label className="field-group">
              <span className="field-label">Cited at</span>
              <input value={row.citedAt} onChange={(e) => updateCitation(index, "citedAt", e.target.value)} disabled={disabled} />
            </label>
            <label className="field-group" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Citation notes</span>
              <textarea value={row.notes} onChange={(e) => updateCitation(index, "notes", e.target.value)} disabled={disabled} rows={2} />
            </label>
            <button type="button" className="secondary-button" onClick={() => removeCitation(index)} disabled={disabled}>
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
          <button type="button" className="secondary-button danger-button" onClick={() => void handleDelete()} disabled={disabled}>
            Delete event
          </button>
        ) : null}
      </div>
    </div>
  );
};
