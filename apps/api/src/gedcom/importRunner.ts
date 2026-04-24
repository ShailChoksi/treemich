/**
 * @packageDocumentation
 * Phase 5b: GEDCOM import preview + async job apply (match-only into existing Immich-linked profiles).
 */

import type { FamilyChildPedigree, Gender, LifeEventType } from "@prisma/client";
import { FamilyChildPedigree as FCP } from "@prisma/client";
import type { CreateFamilyBody, CreateFamilyLifeEventBody, CreateLifeEventBody } from "@treemich/shared";
import { prisma } from "../db/client.js";
import type { AppServices } from "../services.js";
import { HttpConflictError } from "../lifeEvents/errors.js";
import { maxGedcomImportLines } from "../config/env.js";
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

const MAX_LINE_LOG = 2000;

const pushLog = (log: GedcomLineLogEntry[], entry: GedcomLineLogEntry) => {
  if (log.length < MAX_LINE_LOG) {
    log.push(entry);
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

const extractImmichHint = (lines: GedcomPlainLine[]): string | null => {
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
  immichHint: string | null;
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
  return { xref, displayName: display, immichHint: extractImmichHint(block.lines) };
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
  for (const r of records) {
    if (r.recordTag === "INDI" && r.xref) {
      indis.push(summarizeIndi(r));
    }
    if (r.recordTag === "FAM" && r.xref) {
      fams.push(summarizeFam(r));
    }
  }
  return { indis, fams, lineLog, records };
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
    const hint = extractImmichHint(block.lines);
    if (hint && !out.has(block.xref)) {
      put(block.xref, hint);
    }
  }
  return out;
};

type RawCitation = { sourceXref: string | null; page: string | null; notes: string | null };

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
  immichA: string,
  immichB: string
): Promise<string | null> {
  const [lo, hi] = immichA < immichB ? [immichA, immichB] : [immichB, immichA];
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

export async function processGedcomImportJob(jobId: string, services: AppServices): Promise<void> {
  const job = await prisma.gedcomImportJob.findFirst({ where: { id: jobId } });
  if (!job || job.status !== "PENDING") {
    return;
  }

  const lineLog: GedcomLineLogEntry[] = Array.isArray(job.lineLog)
    ? [...(job.lineLog as GedcomLineLogEntry[])]
    : [];

  const options = (job.importOptions ?? {}) as {
    dryRun?: boolean;
    skipAlreadyImportedIndis?: boolean;
  };
  const dryRun = options.dryRun === true;
  const skipAlreadyImportedIndis = options.skipAlreadyImportedIndis === true;

  await prisma.gedcomImportJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() }
  });

  const userMatches = (job.indiMatches ?? {}) as Record<string, string>;
  const { records, lineLog: parseLog } = parseGedcomDocument(job.gedcomUtf8, {
    maxLines: maxGedcomImportLines()
  });
  lineLog.push(...parseLog);

  const indiMap = mergeIndiMatches(userMatches, records);

  type ImportSummary = {
    familiesCreated: number;
    spouseRelationshipsResolved: number;
    personLifeEventsCreated: number;
    relationshipLifeEventsCreated: number;
    familyLifeEventsCreated: number;
    repositoriesCreated: number;
    sourcesCreated: number;
    personNamesCreated: number;
    profilesUpdated: number;
    indisSkipped: number;
  };
  const summary: ImportSummary = {
    familiesCreated: 0,
    spouseRelationshipsResolved: 0,
    personLifeEventsCreated: 0,
    relationshipLifeEventsCreated: 0,
    familyLifeEventsCreated: 0,
    repositoriesCreated: 0,
    sourcesCreated: 0,
    personNamesCreated: 0,
    profilesUpdated: 0,
    indisSkipped: 0
  };

  const repoXrefToId = new Map<string, string>();
  const sourceXrefToId = new Map<string, string>();
  const famXrefToTreemichFamilyId = new Map<string, string>();

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

    for (const block of records) {
      if (block.recordTag !== "FAM" || !block.xref) {
        continue;
      }
      const fam = summarizeFam(block);
      const husbImmich = fam.husbXref ? indiMap.get(fam.husbXref) : undefined;
      const wifeImmich = fam.wifeXref ? indiMap.get(fam.wifeXref) : undefined;
      const childImmichs = fam.childXrefs.map((cx) => indiMap.get(cx)).filter((x): x is string => Boolean(x));
      if (fam.husbXref && !husbImmich) {
        throw new Error(`Missing match for HUSB ${fam.husbXref} in FAM ${fam.xref}`);
      }
      if (fam.wifeXref && !wifeImmich) {
        throw new Error(`Missing match for WIFE ${fam.wifeXref} in FAM ${fam.xref}`);
      }
      for (let i = 0; i < fam.childXrefs.length; i++) {
        if (!childImmichs[i]) {
          throw new Error(`Missing match for CHIL ${fam.childXrefs[i]!} in FAM ${fam.xref}`);
        }
      }
      const childPayload = fam.childXrefs.map((cx, i) => {
        const chLines = chunkByLevel1(block.lines).find(
          (c) => c[0]?.tag === "CHIL" && xrefFromPointer(c[0]!.value) === cx
        );
        const pedi = chLines ? findSubValue(chLines, "PEDI") : null;
        return {
          childImmichPersonId: childImmichs[i]!,
          pedigree: pediToPedigree(pedi)
        };
      });
      const famNotesLine = block.lines.find((l) => l.level === 1 && l.tag === "NOTE");
      const famNotes = famNotesLine?.value?.trim() ?? null;

      const body: CreateFamilyBody = {
        parent1ImmichPersonId: husbImmich ?? null,
        parent2ImmichPersonId: wifeImmich ?? null,
        notes: famNotes,
        children: childPayload
      };

      let relId: string | null = null;
      let treemichFamilyId: string | null = null;

      if (!dryRun) {
        const created = await services.familyService.createFamily(job.userId, body);
        treemichFamilyId = created.id;
        famXrefToTreemichFamilyId.set(fam.xref, created.id);
        if (husbImmich && wifeImmich) {
          relId = await findSpouseRelationshipId(job.userId, husbImmich, wifeImmich);
          if (relId) {
            summary.spouseRelationshipsResolved += 1;
          }
        }
      }
      summary.familiesCreated += 1;

      for (const ch of chunkByLevel1(block.lines)) {
        const tag = ch[0]!.tag;
        if (tag === "MARR" || tag === "DIV") {
          const b = chunkToUnionLifeEventBody(ch);
          if (b && relId && !dryRun) {
            attachCitations(b, ch, sourceXrefToId);
            await tryCatchLog(`FAM ${fam.xref} ${tag}`, async () => {
              await services.lifeEventService.createRelationshipLifeEvent(job.userId, relId!, b);
              summary.relationshipLifeEventsCreated += 1;
            });
          }
        }
        if ((tag === "RESI" || tag === "CENS" || tag === "EVEN") && treemichFamilyId && !dryRun) {
          const b = chunkToFamilyLifeEventBody(ch);
          if (b) {
            attachCitations(b, ch, sourceXrefToId);
            await tryCatchLog(`FAM ${fam.xref} ${tag}`, async () => {
              await services.lifeEventService.createFamilyLifeEvent(job.userId, treemichFamilyId!, b);
              summary.familyLifeEventsCreated += 1;
            });
          }
        }
      }
    }

    for (const block of records) {
      if (block.recordTag !== "INDI" || !block.xref) {
        continue;
      }
      const immichId = indiMap.get(block.xref);
      if (!immichId) {
        continue;
      }
      const profile = await prisma.personProfile.findUnique({
        where: { userId_immichPersonId: { userId: job.userId, immichPersonId: immichId } }
      });
      if (!profile) {
        pushLog(lineLog, {
          severity: "warn",
          lineNo: block.startLineNo,
          message: `No PersonProfile for matched Immich id ${immichId} (${block.xref}); skipping INDI`
        });
        continue;
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
        await services.relationshipService.upsertProfile(job.userId, immichId, {
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
          await services.relationshipService.upsertProfile(job.userId, immichId, {
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
              await services.personNameService.create(job.userId, immichId, {
                type: mapType(typ),
                givenName: given,
                surname: surname,
                isPrimary: false
              });
              summary.personNamesCreated += 1;
            });
          }
        }
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
                await services.lifeEventService.createPersonLifeEvent(job.userId, immichId, b);
                summary.personLifeEventsCreated += 1;
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
      }
    }

    await prisma.gedcomImportJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        lineLog,
        summary
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import failed";
    await prisma.gedcomImportJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: msg,
        lineLog: [...lineLog, { severity: "error", lineNo: 0, message: msg }]
      }
    });
  }
}

export const scheduleGedcomImportJob = (jobId: string, services: AppServices) => {
  setImmediate(() => {
    void processGedcomImportJob(jobId, services).catch((err) => {
      console.error("GEDCOM import job failed", jobId, err);
    });
  });
};

export const validateFamMatches = (
  preview: GedcomImportPreview,
  indiMap: Map<string, string>
): string | null => {
  for (const fam of preview.fams) {
    if (fam.husbXref && !indiMap.get(fam.husbXref)) {
      return `FAM ${fam.xref}: missing Immich match for HUSB ${fam.husbXref}`;
    }
    if (fam.wifeXref && !indiMap.get(fam.wifeXref)) {
      return `FAM ${fam.xref}: missing Immich match for WIFE ${fam.wifeXref}`;
    }
    for (const cx of fam.childXrefs) {
      if (!indiMap.get(cx)) {
        return `FAM ${fam.xref}: missing Immich match for CHIL ${cx}`;
      }
    }
  }
  return null;
};
