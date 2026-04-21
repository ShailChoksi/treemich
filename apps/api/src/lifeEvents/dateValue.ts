/** Sort key for ordering life events (higher granularity sorts after lower when same year). */
export type PartialDateParts = {
  year?: number | null;
  month?: number | null;
  day?: number | null;
  endYear?: number | null;
  endMonth?: number | null;
  endDay?: number | null;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Deterministic numeric sort key; missing month/day use 0. */
export function lifeEventDateSortKey(parts: PartialDateParts): number {
  const y = parts.year ?? 0;
  const m = parts.month ?? 0;
  const d = parts.day ?? 0;
  return y * 10000 + m * 100 + d;
}

export function compareLifeEventDates(a: PartialDateParts, b: PartialDateParts): number {
  return lifeEventDateSortKey(a) - lifeEventDateSortKey(b);
}

/** Parse YYYY-MM-DD from HTML date inputs; returns null if invalid or empty. */
export function parseIsoDateToParts(iso: string | null | undefined): PartialDateParts | null {
  if (!iso || !iso.trim()) {
    return null;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) {
    return null;
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!isValidYmd(year, month, day)) {
    return null;
  }
  return { year, month, day };
}

export function isValidYmd(year: number, month: number, day: number): boolean {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

/**
 * If day set, month and year required. If month set, year required.
 * Returns error message or null if valid.
 */
export function validatePartialDateTriplet(
  year: number | null | undefined,
  month: number | null | undefined,
  day: number | null | undefined
): string | null {
  if (year == null && month == null && day == null) {
    return null;
  }
  if (year == null) {
    return "year is required when month or day is set";
  }
  if (day != null && month == null) {
    return "month is required when day is set";
  }
  if (month != null && (month < 1 || month > 12)) {
    return "month must be 1–12";
  }
  if (day != null) {
    if (!isValidYmd(year, month!, day)) {
      return "invalid calendar date";
    }
  }
  return null;
}

/** When all three set, ISO string for legacy bridge; otherwise null. */
export function partialDateToIsoString(parts: PartialDateParts): string | null {
  if (
    parts.year != null &&
    parts.month != null &&
    parts.day != null &&
    isValidYmd(parts.year, parts.month, parts.day)
  ) {
    return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  }
  return null;
}

/**
 * Comparable Date for age filters when partial dates exist.
 * Full ISO → that instant; year+month only → first of month UTC; year only → Jan 1 UTC.
 */
export function partialDateToComparableDate(parts: PartialDateParts): Date | null {
  if (parts.year == null) {
    return null;
  }
  if (parts.month != null && parts.day != null && isValidYmd(parts.year, parts.month, parts.day)) {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  }
  if (parts.month != null) {
    return new Date(Date.UTC(parts.year, parts.month - 1, 1));
  }
  return new Date(Date.UTC(parts.year, 0, 1));
}
