/**
 * Parse GEDCOM DATE payload into Treemich partial-date + {@link DateQualifier} fields.
 */

import type { DateQualifier } from "@prisma/client";

const MONTHS: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12
};

export type ParsedGedcomDateParts = {
  dateQualifier: DateQualifier;
  year: number | null;
  month: number | null;
  day: number | null;
  endYear: number | null;
  endMonth: number | null;
  endDay: number | null;
};

const parseOneToken = (s: string): { year: number | null; month: number | null; day: number | null } => {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { year: null, month: null, day: null };
  }
  if (parts.length === 1) {
    const y = Number(parts[0]);
    return { year: Number.isFinite(y) ? y : null, month: null, day: null };
  }
  if (parts.length === 2) {
    const mon = MONTHS[parts[0]!.toUpperCase()];
    const y = Number(parts[1]);
    if (mon && Number.isFinite(y)) {
      return { year: y, month: mon, day: null };
    }
  }
  if (parts.length === 3) {
    const d = Number(parts[0]);
    const mon = MONTHS[parts[1]!.toUpperCase()];
    const y = Number(parts[2]);
    if (Number.isFinite(d) && mon && Number.isFinite(y)) {
      return { year: y, month: mon, day: d };
    }
  }
  return { year: null, month: null, day: null };
};

export const parseGedcomDate = (raw: string | null | undefined): ParsedGedcomDateParts | null => {
  if (!raw?.trim()) {
    return null;
  }
  let s = raw.trim();
  let dateQualifier: DateQualifier = "EXACT";
  const tryPrefix = (prefix: string, q: DateQualifier) => {
    if (s.toUpperCase().startsWith(prefix)) {
      dateQualifier = q;
      s = s.slice(prefix.length).trim();
    }
  };
  tryPrefix("ABT ", "ABOUT");
  tryPrefix("ABOUT ", "ABOUT");
  tryPrefix("BEF ", "BEFORE");
  tryPrefix("AFT ", "AFTER");
  tryPrefix("CAL ", "CALCULATED");
  tryPrefix("EST ", "ESTIMATED");
  const bet = /^BET\s+(.+?)\s+AND\s+(.+)$/i.exec(s);
  if (bet) {
    const a = parseOneToken(bet[1]!);
    const b = parseOneToken(bet[2]!);
    return {
      dateQualifier: "BETWEEN",
      year: a.year,
      month: a.month,
      day: a.day,
      endYear: b.year,
      endMonth: b.month,
      endDay: b.day
    };
  }
  const p = parseOneToken(s);
  return {
    dateQualifier,
    year: p.year,
    month: p.month,
    day: p.day,
    endYear: null,
    endMonth: null,
    endDay: null
  };
};

const MONTH_LABEL = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
] as const;

const formatOne = (year: number | null, month: number | null, day: number | null): string | null => {
  if (year == null) {
    return null;
  }
  if (month != null && day != null) {
    const m = MONTH_LABEL[month];
    return m ? `${day} ${m} ${year}` : `${year}`;
  }
  if (month != null) {
    const m = MONTH_LABEL[month];
    return m ? `${m} ${year}` : `${year}`;
  }
  return `${year}`;
};

/**
 * Compact human-readable birth date for GEDCOM import preview (preserves common GEDCOM qualifiers).
 */
export const formatGedcomBirthDateDisplay = (raw: string | null | undefined): string | null => {
  if (!raw?.trim()) {
    return null;
  }
  const trimmed = raw.trim();
  const parsed = parseGedcomDate(trimmed);
  if (!parsed) {
    return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
  }
  const qPrefix =
    parsed.dateQualifier === "ABOUT"
      ? "abt "
      : parsed.dateQualifier === "BEFORE"
        ? "bef "
        : parsed.dateQualifier === "AFTER"
          ? "aft "
          : parsed.dateQualifier === "CALCULATED"
            ? "cal "
            : parsed.dateQualifier === "ESTIMATED"
              ? "est "
              : "";
  if (parsed.dateQualifier === "BETWEEN") {
    const a = formatOne(parsed.year, parsed.month, parsed.day);
    const b = formatOne(parsed.endYear, parsed.endMonth, parsed.endDay);
    if (a && b) {
      return `${qPrefix}bet ${a} and ${b}`;
    }
    if (a) {
      return `${qPrefix}bet ${a} and …`;
    }
    return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
  }
  const core = formatOne(parsed.year, parsed.month, parsed.day);
  if (!core) {
    return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
  }
  return `${qPrefix}${core}`;
};
