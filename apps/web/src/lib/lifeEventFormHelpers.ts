/**
 * @packageDocumentation
 * Small parsers and formatters shared by life-event forms (`optionalInt`, `optionalFloat`, labels).
 */

import { lifeEventTypeLabels } from "@treemich/shared";
import type { LifeEventRecord } from "./api";

/** Parses a trimmed integer string, or `null` if empty / non-finite. */
export const optionalInt = (raw: string): number | null => {
  const t = raw.trim();
  if (!t) {
    return null;
  }
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
};

/**
 * Parses a float from user input; normalizes Unicode minus and comma decimals before `Number()`.
 * Returns `null` for empty input or non-finite values.
 */
export const optionalFloat = (raw: string): number | null => {
  const t = raw.trim();
  if (!t) {
    return null;
  }
  const normalized = t.replace(/[−–—]/g, "-").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

/** Returns `null` when the trimmed string is empty (optional API fields). */
export const nullIfEmpty = (raw: string): string | null => {
  const t = raw.trim();
  return t ? t : null;
};

/** One-line summary for pickers and lists (type label + Y-M-D + qualifier when not exact). */
export const summarizeLifeEvent = (event: LifeEventRecord): string => {
  const parts: string[] = [lifeEventTypeLabels[event.eventType] ?? event.eventType];
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
