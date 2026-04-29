/**
 * @packageDocumentation
 * GEDCOM import preview + async job apply into Treemich-owned Person records.
 */

import type { FamilyChildPedigree, Gender, LifeEventType } from "@prisma/client";
import { FamilyChildPedigree as FCP } from "@prisma/client";
import type { CreateFamilyBody, CreateFamilyLifeEventBody, CreateLifeEventBody } from "@treemich/shared";
import { rm } from "node:fs/promises";
import { prisma } from "../db/client.js";
import type { AppServices } from "../services.js";
import { storeMediaFile } from "../evidence/mediaStorage.js";
import { HttpConflictError } from "../lifeEvents/errors.js";
import { env, maxGedcomImportLineLogEntries, maxGedcomImportLines } from "../config/env.js";
import { findArchiveMediaFile, type StagedGedcomArchiveMediaFile } from "./archiveImport.js";
import { parseGedcomDate } from "./gedcomDateParse.js";
import {
  chunkByLevel1,
  findSubValue,
  normalizeIndiFamXref,
  parseGedcomDocument,
  type GedcomLineLogEntry,
  type GedcomPlainLine,
  type GedcomRecordBlock
} from "./parser.js";

const lineLogTruncatedMessage = (droppedCount: number) =>
  `GEDCOM import diagnostics truncated; ${droppedCount} additional entries were omitted.`;

export const capGedcomLineLog = (
  log: GedcomLineLogEntry[],
  cap = maxGedcomImportLineLogEntries()
): GedcomLineLogEntry[] => {
  if (log.length <= cap) {
    return log;
  }
  if (cap <= 1) {
    return [{ severity: "warn", lineNo: 0, message: lineLogTruncatedMessage(log.length) }];
  }
  return [
    ...log.slice(0, cap - 1),
    { severity: "warn", lineNo: 0, message: lineLogTruncatedMessage(log.length - cap + 1) }
  ];
};

const pushLog = (log: GedcomLineLogEntry[], entry: GedcomLineLogEntry) => {
  const next = capGedcomLineLog([...log, entry]);
  log.length = 0;
  log.push(...next);
};

const pushLogs = (log: GedcomLineLogEntry[], entries: GedcomLineLogEntry[]) => {
  for (const entry of entries) {
    pushLog(log, entry);
  }
};

const xrefFromPointer = (value: string): string | null => {
  const m = /^(@[^@]+@)/.exec(value.trim());
  return m ? m[1]! : null;
};

const parseNameSlash = (value: string): { given: string | null; surname: string | null } => {
  const t = value.trim();
  const m = /^(.+?)\s*\/([^/]*)\/\s*$/.exec(t);
  if (m) {
    return {
      given: m[1]!.trim() || null,
      surname: m[2]!.trim() || null
    };
  }
  return { given: t || null, surname: null };
};

const sexToGender = (sex: string | null): Gender => {
  const s = (sex ?? "").trim().toUpperCase();
  if (s === "M") {
    return "MALE";
  }
  if (s === "F") {
    return "FEMALE";
  }
  return "UNKNOWN";
};

const pediToPedigree = (raw: string | null): FamilyChildPedigree => {
  const v = (raw ?? "").trim().toLowerCase();
  const m: Record<string, FamilyChildPedigree> = {
    birth: FCP.BIOLOGICAL,
    biological: FCP.BIOLOGICAL,
    adopted: FCP.ADOPTED,
    foster: FCP.FOSTER,
    step: FCP.STEP,
    sealing: FCP.UNKNOWN
  };
  return m[v] ?? FCP.UNKNOWN;
};

const gedTagToLifeEventType = (tag: string): LifeEventType | null => {
  const map: Record<string, LifeEventType> = {
    BIRT: "BIRTH",
    DEAT: "DEATH",
    BURI: "BURIAL",
    CHR: "CHRISTENING",
    BAPM: "BAPTISM",
    RESI: "RESIDENCE",
    IMMI: "IMMIGRATION",
    CENS: "CENSUS",
    MARR: "MARRIAGE",
    DIV: "DIVORCE"
  };
  return map[tag] ?? null;
};

const extractPersonHint = (lines: GedcomPlainLine[]): string | null => {
  for (const ln of lines) {
    if (
      ln.level === 1 &&
      (ln.tag === "_TREEMICH_PERSON_ID" || ln.tag === "_TREEMICH_IMMICH_PERSON_ID" || ln.tag === "_IMMICH")
    ) {
      const v = ln.value.trim();
      return v || null;
    }
  }
  return null;
};

const extractImmichProviderPersonId = (lines: GedcomPlainLine[]): string | null => {
  for (const ln of lines) {
    if (ln.level === 1 && (ln.tag === "_TREEMICH_IMMICH_PERSON_ID" || ln.tag === "_IMMICH")) {
      const v = ln.value.trim();
      return v || null;
    }
  }
  return null;
};

export type GedcomImportPreviewIndi = {
  xref: string;
  displayName: string | null;
  /** Treemich PersonProfile.id or legacy Immich person ID embedded in the GEDCOM as a custom tag. */
  personHint: string | null;
};

export type GedcomImportPreviewFam = {
  xref: string;
  husbXref: string | null;
  wifeXref: string | null;
  childXrefs: string[];
};

export type GedcomImportPreview = {
  indis: GedcomImportPreviewIndi[];
  fams: GedcomImportPreviewFam[];
  media: GedcomImportPreviewMedia[];
  lineLog: GedcomLineLogEntry[];
};

export type GedcomImportPreviewWithRecords = GedcomImportPreview & {
  records: GedcomRecordBlock[];
};

const summarizeIndi = (block: GedcomRecordBlock): GedcomImportPreviewIndi => {
  const xref = block.xref!;
  let display: string | null = null;
  const chunks = chunkByLevel1(block.lines);
  for (const ch of chunks) {
    const head = ch[0]!;
    if (head.tag === "NAME" && head.level === 1) {
      const { given, surname } = parseNameSlash(head.value);
      display = [given, surname].filter(Boolean).join(" ").trim() || display;
      const givn = findSubValue(ch, "GIVN");
      const surn = findSubValue(ch, "SURN");
      if (givn || surn) {
        display = [givn, surn].filter(Boolean).join(" ").trim() || display;
      }
    }
  }
  return { xref, displayName: display, personHint: extractPersonHint(block.lines) };
};

const summarizeFam = (block: GedcomRecordBlock): GedcomImportPreviewFam => {
  const xref = block.xref!;
  let husb: string | null = null;
  let wife: string | null = null;
  const children: string[] = [];
  for (const ch of chunkByLevel1(block.lines)) {
    const head = ch[0]!;
    if (head.tag === "HUSB" && head.level === 1) {
      husb = xrefFromPointer(head.value);
    }
    if (head.tag === "WIFE" && head.level === 1) {
      wife = xrefFromPointer(head.value);
    }
    if (head.tag === "CHIL" && head.level === 1) {
      const cx = xrefFromPointer(head.value);
      if (cx) {
        children.push(cx);
      }
    }
  }
  return { xref, husbXref: husb, wifeXref: wife, childXrefs: children };
};

export const buildGedcomImportPreview = (gedcomUtf8: string): GedcomImportPreviewWithRecords => {
  const { records, lineLog } = parseGedcomDocument(gedcomUtf8, {
    maxLines: maxGedcomImportLines()
  });
  const indis: GedcomImportPreviewIndi[] = [];
  const fams: GedcomImportPreviewFam[] = [];
  const media: GedcomImportPreviewMedia[] = [];
  for (const r of records) {
    if (r.recordTag === "INDI" && r.xref) {
      indis.push(summarizeIndi(r));
    }
    if (r.recordTag === "FAM" && r.xref) {
      fams.push(summarizeFam(r));
    }
    if (r.recordTag === "OBJE" && r.xref) {
      const [obje] = rawObjeRecordsFromRecords([r]);
      if (obje) {
        media.push({ xref: obje.xref, file: obje.file, title: obje.title, form: obje.form });
      }
    }
  }
  return { indis, fams, media, lineLog, records };
};

export const mergeIndiMatches = (
  userMatches: Record<string, string>,
  records: GedcomRecordBlock[]
): Map<string, string> => {
  const out = new Map<string, string>();
  const put = (k: string, v: string) => {
    const nk = normalizeIndiFamXref(k);
    if (nk && v.trim()) {
      out.set(nk, v.trim());
    }
  };
  for (const [k, v] of Object.entries(userMatches)) {
    put(k, v);
  }
  for (const block of records) {
    if (block.recordTag !== "INDI" || !block.xref) {
      continue;
    }
    const hint = extractPersonHint(block.lines);
    if (hint && !out.has(block.xref)) {
      put(block.xref, hint);
    }
  }
  return out;
};

type RawCitation = { sourceXref: string | null; page: string | null; notes: string | null };

export type GedcomImportPreviewMedia = {
  xref: string;
  file: string | null;
  title: string | null;
  form: string | null;
};

type RawObjeRecord = GedcomImportPreviewMedia & {
  startLineNo: number;
};

const rawObjeRecordsFromRecords = (records: GedcomRecordBlock[]): RawObjeRecord[] =>
  records
    .filter((block) => block.recordTag === "OBJE" && block.xref)
    .map((block) => ({
      xref: block.xref!,
      file: block.lines.find((ln) => ln.level === 1 && ln.tag === "FILE")?.value.trim() || null,
      form: block.lines.find((ln) => ln.level === 1 && ln.tag === "FORM")?.value.trim() || null,
      title: block.lines.find((ln) => ln.level === 1 && ln.tag === "TITL")?.value.trim() || null,
      startLineNo: block.startLineNo
    }));

const objePointersFromChunk = (chunk: GedcomPlainLine[], level: number): string[] => {
  const out: string[] = [];
  for (const ln of chunk) {
    if (ln.level !== level || ln.tag !== "OBJE") {
      continue;
    }
    const px = xrefFromPointer(ln.value);
    if (px) {
      out.push(normalizeIndiFamXref(px));
    }
  }
  return out;
};

const isRemoteUrl = (value: string): boolean => /^https?:\/\//i.test(value.trim());

const rawCitationsFromChunk = (chunk: GedcomPlainLine[]): RawCitation[] => {
  const out: RawCitation[] = [];
  for (let i = 0; i < chunk.length; i++) {
    const ln = chunk[i]!;
    if (ln.level === 2 && ln.tag === "SOUR") {
      const px = xrefFromPointer(ln.value);
      let page: string | null = null;
      let notes: string | null = null;
      for (let j = i + 1; j < chunk.length; j++) {
        const s = chunk[j]!;
        if (s.level <= 2) {
          break;
        }
        if (s.level === 3 && s.tag === "PAGE") {
          page = s.value.trim() || null;
        }
        if (s.level === 3 && s.tag === "NOTE") {
          notes = s.value.trim() || null;
        }
      }
      out.push({ sourceXref: px, page, notes });
    }
  }
  return out;
};

const toApiCitations = (
  raw: RawCitation[],
  sourceXrefToId: Map<string, string>
): NonNullable<CreateLifeEventBody["citations"]> =>
  raw.map((c) => {
    const sid = c.sourceXref ? sourceXrefToId.get(normalizeIndiFamXref(c.sourceXref)) : undefined;
    if (sid) {
      return {
        sourceId: sid,
        page: c.page,
        notes: c.notes,
        title: null,
        repository: null,
        url: null,
        citedAt: null
      };
    }
    return {
      sourceId: null,
      title: c.sourceXref ? `GEDCOM ${c.sourceXref}` : "GEDCOM citation",
      page: c.page,
      notes: c.notes,
      repository: null,
      url: null,
      citedAt: null
    };
  });

const chunkToPlace = (chunk: GedcomPlainLine[]): CreateLifeEventBody["place"] => {
  const plac = findSubValue(chunk, "PLAC");
  if (!plac?.trim()) {
    return null;
  }
  return { name: plac.trim() };
};

const chunkToPersonLifeEventBody = (chunk: GedcomPlainLine[]): CreateLifeEventBody | null => {
  const head = chunk[0]!;
  if (head.level !== 1) {
    return null;
  }
  if (head.tag === "EVEN") {
    const type = findSubValue(chunk, "TYPE");
    const label = type?.trim() || "Custom";
    const dt = parseGedcomDate(findSubValue(chunk, "DATE"));
    const isMilitary = label.toLowerCase() === "military";
    const body: CreateLifeEventBody = {
      eventType: isMilitary ? "MILITARY" : "CUSTOM",
      notes: findSubValue(chunk, "NOTE"),
      place: chunkToPlace(chunk),
      citations: toApiCitations(rawCitationsFromChunk(chunk), new Map())
    };
    if (!isMilitary) {
      body.customLabel = label.slice(0, 200);
    }
    if (dt) {
      Object.assign(body, dt);
    }
    return body;
  }
  const lt = gedTagToLifeEventType(head.tag);
  if (!lt || lt === "MARRIAGE" || lt === "DIVORCE") {
    return null;
  }
  const dt = parseGedcomDate(findSubValue(chunk, "DATE"));
  const body: CreateLifeEventBody = {
    eventType: lt,
    notes: findSubValue(chunk, "NOTE"),
    place: chunkToPlace(chunk),
    citations: toApiCitations(rawCitationsFromChunk(chunk), new Map())
  };
  if (dt) {
    Object.assign(body, dt);
  }
  return body;
};

const attachCitations = (
  body: CreateLifeEventBody | CreateFamilyLifeEventBody,
  chunk: GedcomPlainLine[],
  sourceXrefToId: Map<string, string>
) => {
  body.citations = toApiCitations(rawCitationsFromChunk(chunk), sourceXrefToId);
};

const chunkToUnionLifeEventBody = (chunk: GedcomPlainLine[]): CreateLifeEventBody | null => {
  const head = chunk[0]!;
  const lt = gedTagToLifeEventType(head.tag);
  if (lt !== "MARRIAGE" && lt !== "DIVORCE") {
    return null;
  }
  const dt = parseGedcomDate(findSubValue(chunk, "DATE"));
  const body: CreateLifeEventBody = {
    eventType: lt,
    notes: findSubValue(chunk, "NOTE"),
    place: chunkToPlace(chunk),
    citations: []
  };
  if (dt) {
    Object.assign(body, dt);
  }
  return body;
};

const chunkToFamilyLifeEventBody = (chunk: GedcomPlainLine[]): CreateFamilyLifeEventBody | null => {
  const head = chunk[0]!;
  if (head.tag === "EVEN") {
    const type = findSubValue(chunk, "TYPE");
    const label = type?.trim() || "Custom";
    const dt = parseGedcomDate(findSubValue(chunk, "DATE"));
    const body: CreateFamilyLifeEventBody = {
      eventType: "CUSTOM",
      customLabel: label.slice(0, 200),
      notes: findSubValue(chunk, "NOTE"),
      place: chunkToPlace(chunk),
      citations: []
    };
    if (dt) {
      Object.assign(body, dt);
    }
    return body;
  }
  if (head.tag === "RESI") {
    const dt = parseGedcomDate(findSubValue(chunk, "DATE"));
    const body: CreateFamilyLifeEventBody = {
      eventType: "RESIDENCE",
      notes: findSubValue(chunk, "NOTE"),
      place: chunkToPlace(chunk),
      citations: []
    };
    if (dt) {
      Object.assign(body, dt);
    }
    return body;
  }
  if (head.tag === "CENS") {
    const dt = parseGedcomDate(findSubValue(chunk, "DATE"));
    const body: CreateFamilyLifeEventBody = {
      eventType: "CENSUS",
      notes: findSubValue(chunk, "NOTE"),
      place: chunkToPlace(chunk),
      citations: []
    };
    if (dt) {
      Object.assign(body, dt);
    }
    return body;
  }
  return null;
};

async function findSpouseRelationshipId(
  userId: string,
  personA: string,
  personB: string
): Promise<string | null> {
  const [lo, hi] = personA < personB ? [personA, personB] : [personB, personA];
  const rel = await prisma.relationship.findFirst({
    where: {
      userId,
      type: "SPOUSE_OF",
      fromPersonId: lo,
      toPersonId: hi
    },
    select: { id: true }
  });
  return rel?.id ?? null;
}

const mergeExternalIds = (existing: unknown, patch: Record<string, unknown>): Record<string, unknown> => {
  const base =
    existing != null && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  return { ...base, ...patch };
};

type JobLogger = {
  error: (payload: unknown, message?: string) => void;
};

async function claimGedcomImportJob(jobId: string) {
  const staleBefore = new Date(Date.now() - env.TREEMICH_GEDCOM_JOB_STALE_AFTER_MS);
  const claimed = await prisma.gedcomImportJob.updateMany({
    where: {
      id: jobId,
      OR: [{ status: "PENDING" }, { status: "RUNNING", startedAt: { lt: staleBefore } }]
    },
    data: { status: "RUNNING", startedAt: new Date(), completedAt: null, errorMessage: null }
  });

  if (claimed.count !== 1) {
    return null;
  }

  return prisma.gedcomImportJob.findUnique({ where: { id: jobId } });
}

export async function processGedcomImportJob(jobId: string, services: AppServices): Promise<void> {
  const job = await claimGedcomImportJob(jobId);
  if (!job) {
    return;
  }

  const lineLog: GedcomLineLogEntry[] = Array.isArray(job.lineLog)
    ? [...(job.lineLog as GedcomLineLogEntry[])]
    : [];

  const options = (job.importOptions ?? {}) as {
    dryRun?: boolean;
    skipAlreadyImportedIndis?: boolean;
    allowPartialMatches?: boolean;
    /**
     * "MATCH_ONLY": unmatched INDI records are skipped (legacy default).
     * "CREATE": unmatched INDI records are created as new Treemich persons before family/life-event processing.
     */
    unmatchedIndiPolicy?: "MATCH_ONLY" | "CREATE";
    mediaArchive?: {
      archiveDir: string;
      files: StagedGedcomArchiveMediaFile[];
    };
  };
  const dryRun = options.dryRun === true;
  const skipAlreadyImportedIndis = options.skipAlreadyImportedIndis === true;
  const allowPartialMatches = options.allowPartialMatches === true;

  const userMatches = (job.indiMatches ?? {}) as Record<string, string>;
  const { records, lineLog: parseLog } = parseGedcomDocument(job.gedcomUtf8, {
    maxLines: maxGedcomImportLines()
  });
  pushLogs(lineLog, parseLog);

  const indiMap = mergeIndiMatches(userMatches, records);

  type ImportSummary = {
    familiesCreated: number;
    familiesReused: number;
    spouseRelationshipsResolved: number;
    personLifeEventsCreated: number;
    relationshipLifeEventsCreated: number;
    familyLifeEventsCreated: number;
    repositoriesCreated: number;
    sourcesCreated: number;
    mediaObjectsCreated: number;
    mediaLinksCreated: number;
    mediaFilesStored: number;
    mediaObjectsSkipped: number;
    personNamesCreated: number;
    profilesUpdated: number;
    indisSkipped: number;
    indisCreated: number;
  };
  type DryRunDiff = {
    creates: Record<string, number>;
    updates: Record<string, number>;
    reuses: Record<string, number>;
    skips: Record<string, number>;
    conflicts: Record<string, number>;
    warnings: number;
  };
  const summary: ImportSummary = {
    familiesCreated: 0,
    familiesReused: 0,
    spouseRelationshipsResolved: 0,
    personLifeEventsCreated: 0,
    relationshipLifeEventsCreated: 0,
    familyLifeEventsCreated: 0,
    repositoriesCreated: 0,
    sourcesCreated: 0,
    mediaObjectsCreated: 0,
    mediaLinksCreated: 0,
    mediaFilesStored: 0,
    mediaObjectsSkipped: 0,
    personNamesCreated: 0,
    profilesUpdated: 0,
    indisSkipped: 0,
    indisCreated: 0
  };
  const buildDryRunDiff = (): DryRunDiff => ({
    creates: {
      families: summary.familiesCreated,
      persons: summary.indisCreated,
      relationshipLifeEvents: summary.relationshipLifeEventsCreated,
      familyLifeEvents: summary.familyLifeEventsCreated,
      personLifeEvents: summary.personLifeEventsCreated,
      repositories: summary.repositoriesCreated,
      sources: summary.sourcesCreated,
      mediaObjects: summary.mediaObjectsCreated,
      mediaLinks: summary.mediaLinksCreated,
      mediaFiles: summary.mediaFilesStored,
      personNames: summary.personNamesCreated
    },
    updates: {
      profiles: summary.profilesUpdated
    },
    reuses: {
      families: summary.familiesReused,
      spouseRelationships: summary.spouseRelationshipsResolved
    },
    skips: {
      indis: summary.indisSkipped,
      mediaObjects: summary.mediaObjectsSkipped
    },
    conflicts: {
      warnings: lineLog.filter((entry) => /conflict|already|duplicate/i.test(entry.message)).length
    },
    warnings: lineLog.filter((entry) => entry.severity === "warn").length
  });

  const repoXrefToId = new Map<string, string>();
  const sourceXrefToId = new Map<string, string>();
  const famXrefToTreemichFamilyId = new Map<string, string>();
  const mediaXrefToId = new Map<string, string>();
  const mediaArchiveFiles = Array.isArray(options.mediaArchive?.files) ? options.mediaArchive.files : [];

  const tryCatchLog = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      if (e instanceof HttpConflictError) {
        pushLog(lineLog, { severity: "warn", lineNo: 0, message: `${label}: ${e.message}` });
        return;
      }
      throw e;
    }
  };

  const linkObjePointers = async (
    pointers: string[],
    targetType: "PERSON_PROFILE" | "LIFE_EVENT" | "SOURCE" | "FAMILY",
    targetId: string,
    context: string
  ) => {
    for (const pointer of pointers) {
      const mediaObjectId = mediaXrefToId.get(normalizeIndiFamXref(pointer));
      if (!mediaObjectId) {
        pushLog(lineLog, {
          severity: "warn",
          lineNo: 0,
          message: `${context}: OBJE ${pointer} was not imported or could not be resolved`
        });
        continue;
      }
      if (dryRun) {
        summary.mediaLinksCreated += 1;
        continue;
      }
      await services.evidenceService.createMediaLink(job.userId, mediaObjectId, {
        targetType,
        targetId
      });
      summary.mediaLinksCreated += 1;
    }
  };

  try {
    for (const block of records) {
      if (block.recordTag !== "REPO" || !block.xref) {
        continue;
      }
      let repoName = `Repository ${block.xref}`;
      let addr: string | null = null;
      let www: string | null = null;
      let note: string | null = null;
      for (const ln of block.lines) {
        if (ln.level === 1 && ln.tag === "NAME") {
          repoName = ln.value.trim() || repoName;
        }
        if (ln.level === 1 && ln.tag === "ADDR") {
          addr = ln.value.trim() || null;
        }
        if (ln.level === 1 && ln.tag === "WWW") {
          www = ln.value.trim() || null;
        }
        if (ln.level === 1 && ln.tag === "NOTE") {
          note = ln.value.trim() || null;
        }
      }
      if (dryRun) {
        summary.repositoriesCreated += 1;
      } else {
        const created = await services.evidenceService.createRepository(job.userId, {
          name: repoName,
          addressLine1: addr,
          url: www,
          notes: note
        });
        repoXrefToId.set(block.xref, created.id);
        summary.repositoriesCreated += 1;
      }
    }

    for (const block of records) {
      if (block.recordTag !== "SOUR" || !block.xref) {
        continue;
      }
      const chunks = chunkByLevel1(block.lines);
      let title = "Untitled source";
      let author: string | null = null;
      let publication: string | null = null;
      let url: string | null = null;
      let notes: string | null = null;
      let repoXref: string | null = null;
      for (const ch of chunks) {
        const h = ch[0]!;
        if (h.tag === "TITL") {
          title = h.value.trim() || title;
        }
        if (h.tag === "AUTH") {
          author = h.value.trim() || null;
        }
        if (h.tag === "PUBL") {
          publication = h.value.trim() || null;
        }
        if (h.tag === "WWW") {
          url = h.value.trim() || null;
        }
        if (h.tag === "NOTE") {
          notes = h.value.trim() || null;
        }
        if (h.tag === "REPO") {
          repoXref = xrefFromPointer(h.value);
        }
      }
      const repoId = repoXref != null ? (repoXrefToId.get(normalizeIndiFamXref(repoXref)) ?? null) : null;
      if (dryRun) {
        summary.sourcesCreated += 1;
      } else {
        const created = await services.evidenceService.createSource(job.userId, {
          title,
          author,
          publication,
          url,
          notes,
          repositoryId: repoId
        });
        sourceXrefToId.set(block.xref, created.id);
        summary.sourcesCreated += 1;
      }
    }

    for (const obje of rawObjeRecordsFromRecords(records)) {
      if (!obje.file) {
        summary.mediaObjectsSkipped += 1;
        pushLog(lineLog, {
          severity: "warn",
          lineNo: obje.startLineNo,
          message: `OBJE ${obje.xref}: missing FILE; media object skipped`
        });
        continue;
      }

      let storageUrl = obje.file;
      let checksum: string | null = null;
      let mimeType = obje.form && obje.form.includes("/") ? obje.form : null;
      const archiveMatch = findArchiveMediaFile(mediaArchiveFiles, obje.file);
      if (archiveMatch.warning) {
        pushLog(lineLog, {
          severity: "warn",
          lineNo: obje.startLineNo,
          message: `OBJE ${obje.xref}: ${archiveMatch.warning}`
        });
      }

      if (archiveMatch.file && "stagedPath" in archiveMatch.file) {
        if (!dryRun) {
          const stored = await storeMediaFile(archiveMatch.file.stagedPath, {
            originalName: archiveMatch.file.basename
          });
          storageUrl = stored.storageUrl;
          checksum = stored.checksum;
          summary.mediaFilesStored += 1;
        } else {
          storageUrl = `/api/evidence/media/file/dry-run-${obje.xref.replace(/^@|@$/g, "")}`;
        }
        mimeType = archiveMatch.file.mimeType ?? mimeType;
      } else if (!isRemoteUrl(obje.file) && mediaArchiveFiles.length > 0) {
        summary.mediaObjectsSkipped += 1;
        continue;
      } else if (!isRemoteUrl(obje.file) && mediaArchiveFiles.length === 0) {
        summary.mediaObjectsSkipped += 1;
        pushLog(lineLog, {
          severity: "warn",
          lineNo: obje.startLineNo,
          message: `OBJE ${obje.xref}: local FILE requires archive upload; media object skipped`
        });
        continue;
      }

      if (dryRun) {
        mediaXrefToId.set(obje.xref, `dry-run-${obje.xref}`);
        summary.mediaObjectsCreated += 1;
      } else {
        const created = await services.evidenceService.createMediaObject(job.userId, {
          storageUrl,
          mimeType,
          checksum,
          title: obje.title,
          immichAssetId: null
        });
        mediaXrefToId.set(obje.xref, created.id);
        summary.mediaObjectsCreated += 1;
      }
    }

    for (const block of records) {
      if (block.recordTag !== "SOUR" || !block.xref) {
        continue;
      }
      const sourceId = sourceXrefToId.get(block.xref);
      if (!sourceId && !dryRun) {
        continue;
      }
      const pointers = chunkByLevel1(block.lines)
        .filter((ch) => ch[0]?.tag === "OBJE")
        .flatMap((ch) => objePointersFromChunk(ch, 1));
      await linkObjePointers(
        pointers,
        "SOURCE",
        sourceId ?? `dry-run-source-${block.xref}`,
        `SOUR ${block.xref}`
      );
    }

    // Build a map from GEDCOM xref → resolved Treemich PersonProfile.id.
    // indiMap contains either Treemich PersonProfile.ids (via _TREEMICH_PERSON_ID) or legacy Immich
    // person IDs (via _TREEMICH_IMMICH_PERSON_ID / _IMMICH).  We resolve each to a canonical
    // PersonProfile.id here so that downstream family creation always uses Treemich IDs.
    const indiPersonIdMap = new Map<string, string>();
    for (const [xref, rawId] of indiMap.entries()) {
      const profile = await prisma.personProfile.findFirst({
        where: {
          userId: job.userId,
          OR: [
            { id: rawId },
            { externalIdentities: { some: { provider: "IMMICH", providerPersonId: rawId } } }
          ]
        },
        select: { id: true }
      });
      if (profile) {
        indiPersonIdMap.set(xref, profile.id);
      }
    }

    const unmatchedIndiPolicy = options.unmatchedIndiPolicy ?? "MATCH_ONLY";

    // When policy is CREATE, create new PersonProfiles for unmatched INDI records before FAM/INDI
    // processing so that family relationships and life events reference the correct canonical IDs.
    if (unmatchedIndiPolicy === "CREATE") {
      for (const block of records) {
        if (block.recordTag !== "INDI" || !block.xref) continue;
        if (indiPersonIdMap.has(block.xref)) continue; // already matched

        const chunks = chunkByLevel1(block.lines);
        let sex: string | null = null;
        let primaryName: { given: string | null; surname: string | null } | null = null;
        for (const ch of chunks) {
          if (ch[0]!.tag === "SEX" && !sex) sex = ch[0]!.value;
          if (ch[0]!.tag === "NAME" && !primaryName) primaryName = parseNameSlash(ch[0]!.value);
        }

        if (dryRun) {
          const dryRunId = `dry-run-new-person-${block.xref.replace(/[^a-zA-Z0-9-]/g, "")}`;
          indiPersonIdMap.set(block.xref, dryRunId);
          indiMap.set(block.xref, dryRunId);
          summary.indisCreated += 1;
        } else {
          const newPerson = await services.personService.create(job.userId, {
            givenName: primaryName?.given ?? null,
            surname: primaryName?.surname ?? null,
            gender: sexToGender(sex) as "MALE" | "FEMALE" | "UNKNOWN"
          });
          indiPersonIdMap.set(block.xref, newPerson.id);
          indiMap.set(block.xref, newPerson.id);
          summary.indisCreated += 1;
          pushLog(lineLog, {
            severity: "warn",
            lineNo: block.startLineNo,
            message: `Created new person ${newPerson.id} for unmatched INDI ${block.xref}`
          });
        }
      }
    }

    for (const block of records) {
      if (block.recordTag !== "FAM" || !block.xref) {
        continue;
      }
      const fam = summarizeFam(block);
      const husbPersonId = fam.husbXref ? indiPersonIdMap.get(fam.husbXref) : undefined;
      const wifePersonId = fam.wifeXref ? indiPersonIdMap.get(fam.wifeXref) : undefined;
      const childPersonIds = fam.childXrefs
        .map((cx) => indiPersonIdMap.get(cx))
        .filter((x): x is string => Boolean(x));
      const missingPointers: string[] = [];
      if (fam.husbXref && !husbPersonId) {
        missingPointers.push(`HUSB ${fam.husbXref}`);
      }
      if (fam.wifeXref && !wifePersonId) {
        missingPointers.push(`WIFE ${fam.wifeXref}`);
      }
      for (const cx of fam.childXrefs) {
        if (!indiPersonIdMap.get(cx)) {
          missingPointers.push(`CHIL ${cx}`);
        }
      }
      if (missingPointers.length > 0) {
        const msg = `Missing match for ${missingPointers.join(", ")} in FAM ${fam.xref}`;
        if (!allowPartialMatches) {
          throw new Error(msg);
        }
        pushLog(lineLog, {
          severity: "warn",
          lineNo: block.startLineNo,
          message: `${msg}; skipping this family because importOptions.allowPartialMatches=true`
        });
        continue;
      }
      const childPayload = fam.childXrefs.map((cx, i) => {
        const chLines = chunkByLevel1(block.lines).find(
          (c) => c[0]?.tag === "CHIL" && xrefFromPointer(c[0]!.value) === cx
        );
        const pedi = chLines ? findSubValue(chLines, "PEDI") : null;
        return {
          childPersonId: childPersonIds[i]!,
          pedigree: pediToPedigree(pedi)
        };
      });
      const famNotesLine = block.lines.find((l) => l.level === 1 && l.tag === "NOTE");
      const famNotes = famNotesLine?.value?.trim() ?? null;

      const body: CreateFamilyBody = {
        parent1PersonId: husbPersonId ?? null,
        parent2PersonId: wifePersonId ?? null,
        notes: famNotes,
        children: childPayload
      };

      const gedFamKey = fam.xref.replace(/^@|@$/g, "");

      const parentsMatchFamily = (
        row: { parent1PersonId: string | null; parent2PersonId: string | null },
        a: string | null | undefined,
        b: string | null | undefined
      ): boolean => {
        const want = new Set([a, b].filter((x): x is string => Boolean(x)));
        const have = new Set(
          [row.parent1PersonId, row.parent2PersonId].filter((x): x is string => Boolean(x))
        );
        if (want.size !== have.size) {
          return false;
        }
        for (const x of want) {
          if (!have.has(x)) {
            return false;
          }
        }
        return true;
      };

      const childrenMatch = (rows: { childPersonId: string | null }[], wantIds: string[]): boolean => {
        if (rows.length !== wantIds.length) {
          return false;
        }
        const have = new Set(rows.map((r) => r.childPersonId).filter(Boolean));
        return wantIds.every((id) => have.has(id));
      };

      let existingFam = await prisma.family.findFirst({
        where: {
          userId: job.userId,
          externalIds: { path: ["gedcomFam"], equals: gedFamKey }
        },
        include: { children: true }
      });
      if (!existingFam) {
        const parentFilters =
          husbPersonId && wifePersonId
            ? [
                { parent1PersonId: husbPersonId, parent2PersonId: wifePersonId },
                { parent1PersonId: wifePersonId, parent2PersonId: husbPersonId }
              ]
            : husbPersonId || wifePersonId
              ? [
                  { parent1PersonId: husbPersonId ?? wifePersonId ?? null, parent2PersonId: null },
                  { parent1PersonId: null, parent2PersonId: husbPersonId ?? wifePersonId ?? null }
                ]
              : [{ parent1PersonId: null, parent2PersonId: null }];
        const sameShapeFam = await prisma.family.findFirst({
          where: {
            userId: job.userId,
            OR: parentFilters
          },
          include: { children: true }
        });
        if (
          sameShapeFam &&
          parentsMatchFamily(sameShapeFam, husbPersonId ?? null, wifePersonId ?? null) &&
          childrenMatch(sameShapeFam.children, childPersonIds)
        ) {
          existingFam = sameShapeFam;
          if (!dryRun) {
            await prisma.family.update({
              where: { id: sameShapeFam.id },
              data: {
                externalIds: mergeExternalIds(sameShapeFam.externalIds, { gedcomFam: gedFamKey }) as object
              }
            });
          }
          pushLog(lineLog, {
            severity: "warn",
            lineNo: block.startLineNo,
            message: `FAM ${fam.xref}: reused existing Treemich family by matching parents/children and stamped gedcomFam=${gedFamKey}`
          });
        }
      }

      let relId: string | null = null;
      let treemichFamilyId: string | null = null;

      if (existingFam) {
        if (
          !parentsMatchFamily(existingFam, husbPersonId ?? null, wifePersonId ?? null) ||
          !childrenMatch(existingFam.children, childPersonIds)
        ) {
          pushLog(lineLog, {
            severity: "warn",
            lineNo: block.startLineNo,
            message: `FAM ${fam.xref}: existing Treemich family for gedcomFam=${gedFamKey} has different parents or children than this GEDCOM; reusing that family id`
          });
        }
        treemichFamilyId = existingFam.id;
        famXrefToTreemichFamilyId.set(fam.xref, existingFam.id);
        summary.familiesReused += 1;
        if (husbPersonId && wifePersonId) {
          relId = await findSpouseRelationshipId(job.userId, husbPersonId, wifePersonId);
          if (relId) {
            summary.spouseRelationshipsResolved += 1;
          }
        }
      } else if (!dryRun) {
        const created = await services.familyService.createFamily(job.userId, {
          ...body,
          externalIds: { gedcomFam: gedFamKey }
        });
        treemichFamilyId = created.id;
        famXrefToTreemichFamilyId.set(fam.xref, created.id);
        if (husbPersonId && wifePersonId) {
          relId = await findSpouseRelationshipId(job.userId, husbPersonId, wifePersonId);
          if (relId) {
            summary.spouseRelationshipsResolved += 1;
          }
        }
        summary.familiesCreated += 1;
      } else {
        summary.familiesCreated += 1;
      }

      const familyLevelObjePointers = chunkByLevel1(block.lines)
        .filter((ch) => ch[0]?.tag === "OBJE")
        .flatMap((ch) => objePointersFromChunk(ch, 1));
      if (familyLevelObjePointers.length > 0) {
        if (treemichFamilyId || dryRun) {
          await linkObjePointers(
            familyLevelObjePointers,
            "FAMILY",
            treemichFamilyId ?? `dry-run-fam-${fam.xref}`,
            `FAM ${fam.xref}`
          );
        } else {
          pushLog(lineLog, {
            severity: "warn",
            lineNo: block.startLineNo,
            message: `FAM ${fam.xref}: family-level OBJE pointers could not be linked because no Treemich family was resolved`
          });
        }
      }

      for (const ch of chunkByLevel1(block.lines)) {
        const tag = ch[0]!.tag;
        if (tag === "MARR" || tag === "DIV") {
          const b = chunkToUnionLifeEventBody(ch);
          if (b && relId && !dryRun) {
            attachCitations(b, ch, sourceXrefToId);
            await tryCatchLog(`FAM ${fam.xref} ${tag}`, async () => {
              const created = await services.lifeEventService.createRelationshipLifeEvent(
                job.userId,
                relId!,
                b
              );
              summary.relationshipLifeEventsCreated += 1;
              await linkObjePointers(
                objePointersFromChunk(ch, 2),
                "LIFE_EVENT",
                created.id,
                `FAM ${fam.xref} ${tag}`
              );
            });
          } else if (b && relId && dryRun) {
            summary.relationshipLifeEventsCreated += 1;
            await linkObjePointers(
              objePointersFromChunk(ch, 2),
              "LIFE_EVENT",
              `dry-run-fam-${fam.xref}-${tag}`,
              `FAM ${fam.xref} ${tag}`
            );
          }
        }
        if ((tag === "RESI" || tag === "CENS" || tag === "EVEN") && treemichFamilyId && !dryRun) {
          const b = chunkToFamilyLifeEventBody(ch);
          if (b) {
            attachCitations(b, ch, sourceXrefToId);
            await tryCatchLog(`FAM ${fam.xref} ${tag}`, async () => {
              const created = await services.lifeEventService.createFamilyLifeEvent(
                job.userId,
                treemichFamilyId!,
                b
              );
              summary.familyLifeEventsCreated += 1;
              await linkObjePointers(
                objePointersFromChunk(ch, 2),
                "LIFE_EVENT",
                created.id,
                `FAM ${fam.xref} ${tag}`
              );
            });
          }
        } else if ((tag === "RESI" || tag === "CENS" || tag === "EVEN") && treemichFamilyId && dryRun) {
          const b = chunkToFamilyLifeEventBody(ch);
          if (b) {
            summary.familyLifeEventsCreated += 1;
            await linkObjePointers(
              objePointersFromChunk(ch, 2),
              "LIFE_EVENT",
              `dry-run-family-${fam.xref}-${tag}`,
              `FAM ${fam.xref} ${tag}`
            );
          }
        }
      }
    }

    for (const block of records) {
      if (block.recordTag !== "INDI" || !block.xref) {
        continue;
      }
      const rawId = indiMap.get(block.xref);
      if (!rawId) {
        summary.indisSkipped += 1;
        pushLog(lineLog, {
          severity: unmatchedIndiPolicy === "CREATE" ? "error" : "warn",
          lineNo: block.startLineNo,
          message:
            unmatchedIndiPolicy === "CREATE"
              ? `Unmatched INDI ${block.xref} was not created in the preliminary pass (unexpected)`
              : `Unmatched INDI ${block.xref} skipped; import is match-only and does not create people for unmatched entries`
        });
        continue;
      }
      const resolvedPersonId = indiPersonIdMap.get(block.xref);
      const profile = resolvedPersonId
        ? await prisma.personProfile.findFirst({ where: { id: resolvedPersonId, userId: job.userId } })
        : null;
      if (!profile) {
        pushLog(lineLog, {
          severity: "warn",
          lineNo: block.startLineNo,
          message: `No PersonProfile found for matched id ${rawId} (${block.xref}); skipping INDI`
        });
        continue;
      }
      const immichProviderPersonId = extractImmichProviderPersonId(block.lines);
      if (immichProviderPersonId && !dryRun) {
        const existingImmichIdentity = await prisma.personExternalIdentity.findFirst({
          where: {
            userId: job.userId,
            provider: "IMMICH",
            providerPersonId: immichProviderPersonId
          },
          select: { id: true, personId: true }
        });
        if (!existingImmichIdentity) {
          await prisma.personExternalIdentity.create({
            data: {
              userId: job.userId,
              personId: profile.id,
              provider: "IMMICH",
              providerPersonId: immichProviderPersonId,
              metadata: { importedFromGedcomProviderTag: true }
            }
          });
          pushLog(lineLog, {
            severity: "warn",
            lineNo: block.startLineNo,
            message: `Linked GEDCOM Immich provider id ${immichProviderPersonId} to person ${profile.id}`
          });
        } else if (existingImmichIdentity.personId !== profile.id) {
          pushLog(lineLog, {
            severity: "warn",
            lineNo: block.startLineNo,
            message: `Skipped GEDCOM Immich provider id ${immichProviderPersonId}; already linked to person ${existingImmichIdentity.personId}`
          });
        }
      }
      const ext = profile.externalIds;
      const gedKey = block.xref.replace(/^@|@$/g, "");
      if (skipAlreadyImportedIndis) {
        const ex = ext as Record<string, unknown> | null;
        if (ex?.gedcomIndi === gedKey) {
          summary.indisSkipped += 1;
          continue;
        }
      }

      let sex: string | null = null;
      const chunks = chunkByLevel1(block.lines);
      for (const ch of chunks) {
        if (ch[0]!.tag === "SEX") {
          sex = ch[0]!.value;
        }
      }

      if (!dryRun) {
        await services.personService.update(job.userId, profile.id, {
          gender: sexToGender(sex)
        });
        let primaryNameParsed: { given: string | null; surname: string | null } | null = null;
        for (const ch of chunks) {
          if (ch[0]!.tag === "NAME") {
            primaryNameParsed = parseNameSlash(ch[0]!.value);
            break;
          }
        }
        if (primaryNameParsed?.given || primaryNameParsed?.surname) {
          await services.personService.update(job.userId, profile.id, {
            givenName: primaryNameParsed.given,
            surname: primaryNameParsed.surname
          });
        }
        let idx = 0;
        for (const ch of chunks) {
          if (ch[0]!.tag === "NAME") {
            idx += 1;
            if (idx === 1) {
              continue;
            }
            const typ = findSubValue(ch, "TYPE");
            const mapType = (t: string | null): import("@prisma/client").PersonNameType => {
              const x = (t ?? "").toLowerCase();
              if (x === "married") {
                return "MARRIED";
              }
              if (x === "aka") {
                return "AKA";
              }
              if (x === "maiden") {
                return "MAIDEN";
              }
              if (x === "religious") {
                return "RELIGIOUS";
              }
              if (x === "birth") {
                return "BIRTH";
              }
              return "OTHER";
            };
            const { given, surname } = parseNameSlash(ch[0]!.value);
            await tryCatchLog(`alt name ${block.xref} #${idx}`, async () => {
              await services.personNameService.create(job.userId, profile.id, {
                type: mapType(typ),
                givenName: given,
                surname: surname,
                isPrimary: false
              });
              summary.personNamesCreated += 1;
            });
          }
        }
        await linkObjePointers(
          chunks.filter((ch) => ch[0]?.tag === "OBJE").flatMap((ch) => objePointersFromChunk(ch, 1)),
          "PERSON_PROFILE",
          profile.id,
          `INDI ${block.xref}`
        );
        for (const ch of chunks) {
          const tag = ch[0]!.tag;
          if (
            tag === "BIRT" ||
            tag === "DEAT" ||
            tag === "EVEN" ||
            tag === "BURI" ||
            tag === "CHR" ||
            tag === "BAPM" ||
            tag === "RESI" ||
            tag === "IMMI" ||
            tag === "CENS"
          ) {
            const b = chunkToPersonLifeEventBody(ch);
            if (b) {
              attachCitations(b, ch, sourceXrefToId);
              await tryCatchLog(`person ${block.xref} ${tag}`, async () => {
                const created = await services.lifeEventService.createPersonLifeEvent(
                  job.userId,
                  profile.id,
                  b
                );
                summary.personLifeEventsCreated += 1;
                await linkObjePointers(
                  objePointersFromChunk(ch, 2),
                  "LIFE_EVENT",
                  created.id,
                  `INDI ${block.xref} ${tag}`
                );
              });
            }
          }
        }
        await prisma.personProfile.update({
          where: { id: profile.id },
          data: {
            externalIds: mergeExternalIds(ext, { gedcomIndi: gedKey }) as object
          }
        });
        summary.profilesUpdated += 1;
      } else {
        summary.profilesUpdated += 1;
        let nameIndex = 0;
        for (const ch of chunks) {
          if (ch[0]!.tag === "NAME") {
            nameIndex += 1;
            if (nameIndex > 1) {
              summary.personNamesCreated += 1;
            }
          }
        }
        await linkObjePointers(
          chunks.filter((ch) => ch[0]?.tag === "OBJE").flatMap((ch) => objePointersFromChunk(ch, 1)),
          "PERSON_PROFILE",
          profile.id,
          `INDI ${block.xref}`
        );
        for (const ch of chunks) {
          const tag = ch[0]!.tag;
          if (
            tag === "BIRT" ||
            tag === "DEAT" ||
            tag === "EVEN" ||
            tag === "BURI" ||
            tag === "CHR" ||
            tag === "BAPM" ||
            tag === "RESI" ||
            tag === "IMMI" ||
            tag === "CENS"
          ) {
            const b = chunkToPersonLifeEventBody(ch);
            if (b) {
              summary.personLifeEventsCreated += 1;
              await linkObjePointers(
                objePointersFromChunk(ch, 2),
                "LIFE_EVENT",
                `dry-run-indi-${block.xref}-${tag}`,
                `INDI ${block.xref} ${tag}`
              );
            }
          }
        }
      }
    }

    const persistedSummary = dryRun ? { ...summary, dryRunDiff: buildDryRunDiff() } : summary;
    await prisma.gedcomImportJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        lineLog: capGedcomLineLog(lineLog),
        summary: persistedSummary
      }
    });
    if (options.mediaArchive?.archiveDir) {
      await rm(options.mediaArchive.archiveDir, { recursive: true, force: true });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import failed";
    const errorMessage = `${msg}. GEDCOM import may have applied earlier records because Phase B uses resilient per-entity apply without a global transaction. Review lineLog and summary before retrying.`;
    await prisma.gedcomImportJob.updateMany({
      where: { id: jobId, status: "RUNNING" },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage,
        lineLog: capGedcomLineLog([...lineLog, { severity: "error", lineNo: 0, message: errorMessage }])
      }
    });
    if (options.mediaArchive?.archiveDir) {
      await rm(options.mediaArchive.archiveDir, { recursive: true, force: true });
    }
  }
}

export const scheduleGedcomImportJob = (jobId: string, services: AppServices, logger?: JobLogger) => {
  setImmediate(() => {
    void processGedcomImportJob(jobId, services).catch((err) => {
      logger?.error({ err, jobId }, "GEDCOM import job failed");
    });
  });
};

export const validateFamMatches = (
  preview: GedcomImportPreview,
  indiMap: Map<string, string>
): string | null => {
  for (const fam of preview.fams) {
    if (fam.husbXref && !indiMap.get(fam.husbXref)) {
      return `FAM ${fam.xref}: missing person match for HUSB ${fam.husbXref}`;
    }
    if (fam.wifeXref && !indiMap.get(fam.wifeXref)) {
      return `FAM ${fam.xref}: missing person match for WIFE ${fam.wifeXref}`;
    }
    for (const cx of fam.childXrefs) {
      if (!indiMap.get(cx)) {
        return `FAM ${fam.xref}: missing person match for CHIL ${cx}`;
      }
    }
  }
  return null;
};
