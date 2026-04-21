import type { LifeEventRecord } from "./api";

export const optionalInt = (raw: string): number | null => {
  const t = raw.trim();
  if (!t) {
    return null;
  }
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
};

export const optionalFloat = (raw: string): number | null => {
  const t = raw.trim();
  if (!t) {
    return null;
  }
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
};

export const nullIfEmpty = (raw: string): string | null => {
  const t = raw.trim();
  return t ? t : null;
};

export const summarizeLifeEvent = (event: LifeEventRecord): string => {
  const parts: string[] = [event.eventType];
  const y = event.year != null ? String(event.year) : "?";
  const m = event.month != null ? String(event.month).padStart(2, "0") : "?";
  const d = event.day != null ? String(event.day).padStart(2, "0") : "?";
  if (event.year != null || event.month != null || event.day != null) {
    parts.push(`${y}-${m}-${d}`);
  }
  if (event.dateQualifier && event.dateQualifier !== "EXACT") {
    parts.push(`(${event.dateQualifier})`);
  }
  return parts.join(" · ");
};
