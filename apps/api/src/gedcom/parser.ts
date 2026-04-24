/**
 * @packageDocumentation
 * Minimal GEDCOM 5.5.x line parser for Phase 5b import (UTF-8, CONC/CONT folding).
 */

export type GedcomLineLogEntry = {
  severity: "warn" | "error";
  lineNo: number;
  message: string;
};

export type GedcomPlainLine = {
  lineNo: number;
  level: number;
  tag: string;
  value: string;
  /** Present on `0 @X@ INDI`-style lines only. */
  xref: string | null;
};

export type GedcomRecordBlock = {
  startLineNo: number;
  xref: string | null;
  recordTag: string;
  lines: GedcomPlainLine[];
};

const unescapeAt = (s: string): string => s.replace(/@@/g, "@");

/** Normalize `I1`, `@I1@` → `@I1@`. */
export const normalizeIndiFamXref = (raw: string): string => {
  const t = raw.trim();
  if (!t) {
    return "";
  }
  if (t.startsWith("@") && t.endsWith("@")) {
    return t;
  }
  return `@${t.replace(/^@|@$/g, "")}@`;
};

export const mergeConcCont = (physicalLines: string[], log: GedcomLineLogEntry[]): string[] => {
  const out: string[] = [];
  let lineNo = 0;
  for (const raw of physicalLines) {
    lineNo += 1;
    const line = raw.replace(/\r$/, "");
    if (line === "" || /^\s*$/.test(line)) {
      continue;
    }
    const cont = /^(\d+)\s+CONT\s?(.*)$/i.exec(line);
    if (cont) {
      const piece = cont[2] ?? "";
      if (out.length === 0) {
        log.push({ severity: "warn", lineNo, message: "CONT without preceding line" });
      } else {
        out[out.length - 1] += piece.startsWith(" ") ? piece : ` ${piece}`;
      }
      continue;
    }
    const conc = /^(\d+)\s+CONC\s?(.*)$/i.exec(line);
    if (conc) {
      const piece = conc[2] ?? "";
      if (out.length === 0) {
        log.push({ severity: "warn", lineNo, message: "CONC without preceding line" });
      } else {
        out[out.length - 1] += piece;
      }
      continue;
    }
    out.push(line);
  }
  return out;
};

export const parseDataLine = (line: string, lineNo: number): GedcomPlainLine | null => {
  const withXref = /^(\d+)\s+(@[^@]+@)\s+(\S+)(?:\s+(.*))?$/.exec(line);
  if (withXref) {
    const level = Number(withXref[1]);
    const xref = withXref[2]!;
    const tag = withXref[3]!;
    const value = unescapeAt((withXref[4] ?? "").trimEnd());
    return { lineNo, level, tag, value, xref: level === 0 ? xref : null };
  }
  const m = /^(\d+)\s+(\S+)(?:\s+(.*))?$/.exec(line);
  if (!m) {
    return null;
  }
  const level = Number(m[1]);
  const tag = m[2]!;
  const value = unescapeAt((m[3] ?? "").trimEnd());
  return { lineNo, level, tag, value, xref: null };
};

export const splitPhysicalLines = (gedcomUtf8: string): string[] => {
  const bomStripped = gedcomUtf8.replace(/^\uFEFF/, "");
  return bomStripped.split(/\r\n|\n|\r/);
};

export const parseTopLevelRecords = (
  mergedLines: string[],
  log: GedcomLineLogEntry[]
): GedcomRecordBlock[] => {
  const records: GedcomRecordBlock[] = [];
  let current: GedcomRecordBlock | null = null;
  let lineNo = 0;
  for (const raw of mergedLines) {
    lineNo += 1;
    const parsed = parseDataLine(raw, lineNo);
    if (!parsed) {
      log.push({ severity: "warn", lineNo, message: `Unparseable line: ${raw.slice(0, 120)}` });
      continue;
    }
    if (parsed.level === 0) {
      if (parsed.xref) {
        current = {
          startLineNo: parsed.lineNo,
          xref: parsed.xref,
          recordTag: parsed.tag,
          lines: []
        };
        records.push(current);
      } else {
        current = null;
      }
    } else if (current) {
      current.lines.push(parsed);
    }
  }
  return records;
};

/** Split level-1 (and deeper) lines into chunks starting at each level-1 tag. */
export const chunkByLevel1 = (lines: GedcomPlainLine[]): GedcomPlainLine[][] => {
  const chunks: GedcomPlainLine[][] = [];
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i]!;
    if (ln.level !== 1) {
      i += 1;
      continue;
    }
    const chunk: GedcomPlainLine[] = [ln];
    i += 1;
    while (i < lines.length && lines[i]!.level > 1) {
      chunk.push(lines[i]!);
      i += 1;
    }
    chunks.push(chunk);
  }
  return chunks;
};

export const findSubValue = (chunk: GedcomPlainLine[], tag: string, subLevel = 2): string | null => {
  for (const ln of chunk) {
    if (ln.level === subLevel && ln.tag === tag) {
      return ln.value.trim() || null;
    }
  }
  return null;
};

export const parseGedcomDocument = (
  gedcomUtf8: string,
  options?: { maxLines?: number }
): { records: GedcomRecordBlock[]; lineLog: GedcomLineLogEntry[] } => {
  const maxLines = options?.maxLines ?? 250_000;
  const lineLog: GedcomLineLogEntry[] = [];
  const physical = splitPhysicalLines(gedcomUtf8);
  if (physical.length > maxLines) {
    lineLog.push({
      severity: "error",
      lineNo: 0,
      message: `GEDCOM exceeds maxLines (${maxLines})`
    });
    return { records: [], lineLog };
  }
  const merged = mergeConcCont(physical, lineLog);
  const records = parseTopLevelRecords(merged, lineLog);
  return { records, lineLog };
};
