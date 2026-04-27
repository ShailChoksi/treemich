/**
 * @packageDocumentation
 * Phase 5a: Treemich → GEDCOM 5.5.1 LINEAGE-LINKED export (UTF-8). Pure builder for tests and `GET /export/gedcom`.
 */

import type { DateQualifier, FamilyChildPedigree, Gender, LifeEventType } from "@prisma/client";

const GEDCOM_MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC"
] as const;

export type GedcomExportPersonProfile = {
  id: string;
  immichPersonId: string;
  gender: Gender;
  givenName: string | null;
  surname: string | null;
  displayNameOverride: string | null;
  externalIds: Record<string, unknown>;
};

export type GedcomExportPersonName = {
  personProfileId: string;
  type: string;
  givenName: string | null;
  surname: string | null;
  prefix: string | null;
  suffix: string | null;
  isPrimary: boolean;
  notes: string | null;
};

export type GedcomExportPlace = {
  id: string;
  name: string;
  addressLine1: string | null;
  locality: string | null;
  adminArea: string | null;
  postalCode: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
};

export type GedcomExportCitation = {
  id: string;
  sourceId: string;
  page: string | null;
  notes: string | null;
};

export type GedcomExportLifeEvent = {
  id: string;
  eventType: LifeEventType;
  customLabel: string | null;
  dateQualifier: DateQualifier;
  year: number | null;
  month: number | null;
  day: number | null;
  endYear: number | null;
  endMonth: number | null;
  endDay: number | null;
  personProfileId: string | null;
  relationshipId: string | null;
  familyId: string | null;
  notes: string | null;
  place: GedcomExportPlace | null;
  citations: GedcomExportCitation[];
};

export type GedcomExportRelationship = {
  id: string;
  fromPersonId: string;
  toPersonId: string;
  type: string;
  familyId: string | null;
};

export type GedcomExportFamilyChild = {
  childImmichPersonId: string;
  pedigree: FamilyChildPedigree;
};

export type GedcomExportFamily = {
  id: string;
  parent1ImmichPersonId: string | null;
  parent2ImmichPersonId: string | null;
  notes: string | null;
  children: GedcomExportFamilyChild[];
  externalIds?: Record<string, unknown>;
};

export type GedcomExportRepository = {
  id: string;
  name: string;
  addressLine1: string | null;
  url: string | null;
  notes: string | null;
};

export type GedcomExportSource = {
  id: string;
  repositoryId: string | null;
  title: string;
  author: string | null;
  publication: string | null;
  url: string | null;
  notes: string | null;
};

export type GedcomExportMediaObject = {
  id: string;
  storageUrl: string;
  mimeType: string | null;
  title: string | null;
};

export type GedcomExportMediaLink = {
  mediaObjectId: string;
  targetType: string;
  targetId: string;
};

export type GedcomExportInput = {
  personProfiles: GedcomExportPersonProfile[];
  relationships: GedcomExportRelationship[];
  families: GedcomExportFamily[];
  lifeEvents: GedcomExportLifeEvent[];
  personNames: GedcomExportPersonName[];
  repositories: GedcomExportRepository[];
  sources: GedcomExportSource[];
  mediaObjects: GedcomExportMediaObject[];
  mediaLinks: GedcomExportMediaLink[];
};

export type GedcomExportOptions = {
  /** When true, omit person-scoped events for individuals without a DEATH life event. */
  redactLiving?: boolean;
  /** Emit `1 _TREEMICH_IMMICH_PERSON_ID` (and similar) for interchange; default true. */
  includeTreemichCustomTags?: boolean;
};

export type GedcomXrefSidecarV1 = {
  treemichGedcomXrefMapVersion: 1;
  indi: Record<string, { immichPersonId: string; personProfileId: string }>;
  fam: Record<
    string,
    { familyId: string | null; syntheticSpouseOnly: boolean; spousePair: [string, string] | null }
  >;
  sour: Record<string, { sourceId: string }>;
  repo: Record<string, { repositoryId: string }>;
  obje: Record<string, { mediaObjectId: string }>;
};

export type GedcomBuildResult = {
  gedcomUtf8: string;
  xrefs: GedcomXrefSidecarV1;
};

/** GEDCOM pointer `@{xref}@` must not use `@@` escaping inside the payload. */
const isGedcomXrefPointer = (value: string): boolean => /^@[A-Za-z0-9_]+@$/.test(value);

const gedcomEscape = (value: string): string => {
  const trimmed = value.replace(/\r\n|\r|\n/g, " ").trim();
  if (isGedcomXrefPointer(trimmed)) {
    return trimmed;
  }
  return trimmed.replace(/@/g, "@@");
};

const line = (level: number, tag: string, value?: string): string => {
  if (value === undefined || value === "") {
    return `${level} ${tag}`;
  }
  return `${level} ${tag} ${gedcomEscape(value)}`;
};

const padXref = (prefix: string, n: number, width = 4) => `${prefix}${String(n).padStart(width, "0")}`;

/** GEDCOM xref payload (without @); used when re-emitting a FAM xref from import (`externalIds.gedcomFam`). */
const isStableFamXrefPayload = (s: string): boolean => /^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(s);

const profileIdHasDeath = (lifeEvents: GedcomExportLifeEvent[], personProfileId: string): boolean =>
  lifeEvents.some((e) => e.personProfileId === personProfileId && e.eventType === "DEATH");

const formatPartialDateToken = (
  year: number | null,
  month: number | null,
  day: number | null
): string | null => {
  if (year == null) {
    return null;
  }
  if (month != null && day != null) {
    return `${day} ${GEDCOM_MONTHS[month - 1]!} ${year}`;
  }
  if (month != null) {
    return `${GEDCOM_MONTHS[month - 1]!} ${year}`;
  }
  return String(year);
};

const formatGedcomDate = (e: GedcomExportLifeEvent): string | null => {
  const q = e.dateQualifier;
  const a = formatPartialDateToken(e.year, e.month, e.day);
  const b = formatPartialDateToken(e.endYear, e.endMonth, e.endDay);
  if (q === "BETWEEN") {
    if (a && b) {
      return `BET ${a} AND ${b}`;
    }
    return a ?? b;
  }
  if (!a && !b) {
    return null;
  }
  const body = a ?? b;
  if (!body) {
    return null;
  }
  switch (q) {
    case "EXACT":
      return body;
    case "ABOUT":
      return `ABT ${body}`;
    case "BEFORE":
      return `BEF ${body}`;
    case "AFTER":
      return `AFT ${body}`;
    case "CALCULATED":
      return `CAL ${body}`;
    case "ESTIMATED":
      return `EST ${body}`;
    default:
      return body;
  }
};

const lifeEventToTag = (
  eventType: LifeEventType,
  customLabel: string | null
): { tag: string; typeLine?: string } => {
  const map: Record<LifeEventType, string> = {
    BIRTH: "BIRT",
    DEATH: "DEAT",
    MARRIAGE: "MARR",
    DIVORCE: "DIV",
    BURIAL: "BURI",
    CHRISTENING: "CHR",
    RESIDENCE: "RESI",
    IMMIGRATION: "IMMI",
    CUSTOM: "EVEN",
    BAPTISM: "BAPM",
    CENSUS: "CENS",
    MILITARY: "EVEN"
  };
  const tag = map[eventType];
  if (eventType === "CUSTOM") {
    return { tag: "EVEN", typeLine: customLabel?.trim() || "Custom" };
  }
  if (eventType === "MILITARY") {
    return { tag: "EVEN", typeLine: "Military" };
  }
  return { tag };
};

const formatPlaceOneLine = (p: GedcomExportPlace): string => {
  if (p.name?.trim()) {
    return p.name.trim();
  }
  const parts = [p.locality, p.adminArea, p.postalCode, p.countryCode, p.addressLine1].filter(
    (x): x is string => Boolean(x?.trim())
  );
  return parts.map((x) => x.trim()).join(", ");
};

const sexFromGender = (g: Gender): string => {
  if (g === "MALE") {
    return "M";
  }
  if (g === "FEMALE") {
    return "F";
  }
  return "U";
};

const gedcomNameLine = (given: string | null, surname: string | null): string => {
  const g = given?.trim() || "";
  const s = surname?.trim() || "";
  return `${g} /${s}/`.trim() || "//";
};

const personNameTypeToGedcom = (t: string): string | null => {
  const m: Record<string, string> = {
    BIRTH: "birth",
    MARRIED: "married",
    AKA: "aka",
    MAIDEN: "maiden",
    RELIGIOUS: "religious",
    OTHER: "other"
  };
  return m[t] ?? null;
};

const pediFromPedigree = (p: FamilyChildPedigree): string | null => {
  switch (p) {
    case "BIOLOGICAL":
      return "birth";
    case "ADOPTED":
      return "adopted";
    case "FOSTER":
      return "foster";
    case "STEP":
      return "step";
    default:
      return null;
  }
};

const spousePairKey = (a: string, b: string): string => {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return `${lo}|${hi}`;
};

const husbWifeForParents = (
  parent1: string | null,
  parent2: string | null,
  genderByImmich: Map<string, Gender>
): { husb: string | null; wife: string | null } => {
  const ids = [parent1, parent2].filter((x): x is string => Boolean(x?.length));
  if (ids.length === 0) {
    return { husb: null, wife: null };
  }
  if (ids.length === 1) {
    return { husb: ids[0]!, wife: null };
  }
  const [x, y] = ids;
  const gx = genderByImmich.get(x!);
  const gy = genderByImmich.get(y!);
  if (gx === "MALE" && gy !== "MALE") {
    return { husb: x!, wife: y! };
  }
  if (gy === "MALE" && gx !== "MALE") {
    return { husb: y!, wife: x! };
  }
  return x! < y! ? { husb: x!, wife: y! } : { husb: y!, wife: x! };
};

/**
 * Builds a UTF-8 GEDCOM document and xref sidecar for Treemich graph + evidence subset.
 */
export function buildGedcomDocument(
  input: GedcomExportInput,
  options: GedcomExportOptions = {}
): GedcomBuildResult {
  const redactLiving = options.redactLiving === true;
  const includeTreemichCustomTags = options.includeTreemichCustomTags !== false;

  const profilesSorted = [...input.personProfiles].sort((a, b) =>
    a.immichPersonId.localeCompare(b.immichPersonId)
  );
  const immichToIndi = new Map<string, string>();
  const xrefs: GedcomXrefSidecarV1 = {
    treemichGedcomXrefMapVersion: 1,
    indi: {},
    fam: {},
    sour: {},
    repo: {},
    obje: {}
  };

  profilesSorted.forEach((p, i) => {
    const xref = padXref("I", i + 1);
    immichToIndi.set(p.immichPersonId, xref);
    xrefs.indi[xref] = { immichPersonId: p.immichPersonId, personProfileId: p.id };
  });

  const genderByImmich = new Map(input.personProfiles.map((p) => [p.immichPersonId, p.gender]));

  const livingByProfileId = new Map<string, boolean>();
  for (const p of input.personProfiles) {
    livingByProfileId.set(p.id, !profileIdHasDeath(input.lifeEvents, p.id));
  }

  const reposSorted = [...input.repositories].sort((a, b) => a.id.localeCompare(b.id));
  const repoIdToXref = new Map<string, string>();
  reposSorted.forEach((r, i) => {
    const xref = padXref("R", i + 1);
    repoIdToXref.set(r.id, xref);
    xrefs.repo[xref] = { repositoryId: r.id };
  });

  const sourcesSorted = [...input.sources].sort((a, b) => a.id.localeCompare(b.id));
  const sourceIdToXref = new Map<string, string>();
  sourcesSorted.forEach((s, i) => {
    const xref = padXref("S", i + 1);
    sourceIdToXref.set(s.id, xref);
    xrefs.sour[xref] = { sourceId: s.id };
  });

  const mediaSorted = [...input.mediaObjects].sort((a, b) => a.id.localeCompare(b.id));
  const mediaIdToXref = new Map<string, string>();
  mediaSorted.forEach((m, i) => {
    const xref = padXref("O", i + 1);
    mediaIdToXref.set(m.id, xref);
    xrefs.obje[xref] = { mediaObjectId: m.id };
  });

  /** family prisma id → FAM xref */
  const familyIdToXref = new Map<string, string>();
  const familiesSorted = [...input.families].sort((a, b) => a.id.localeCompare(b.id));
  let famCounter = 0;
  const usedFamXrefs = new Set<string>();
  const nextFamXref = (): string => {
    famCounter += 1;
    return padXref("F", famCounter);
  };

  const allocateFamXref = (f: (typeof familiesSorted)[number]): string => {
    const raw = f.externalIds?.gedcomFam;
    const pref = typeof raw === "string" && isStableFamXrefPayload(raw) ? raw : null;
    if (pref && !usedFamXrefs.has(pref)) {
      usedFamXrefs.add(pref);
      return pref;
    }
    let xref = nextFamXref();
    while (usedFamXrefs.has(xref)) {
      xref = nextFamXref();
    }
    usedFamXrefs.add(xref);
    return xref;
  };

  for (const f of familiesSorted) {
    const xref = allocateFamXref(f);
    familyIdToXref.set(f.id, xref);
    const p1 = f.parent1ImmichPersonId;
    const p2 = f.parent2ImmichPersonId;
    let pair: [string, string] | null = null;
    if (p1 && p2) {
      const s = [p1, p2].sort();
      pair = [s[0]!, s[1]!];
    }
    xrefs.fam[xref] = {
      familyId: f.id,
      syntheticSpouseOnly: false,
      spousePair: pair
    };
  }

  const spouseRelationships = input.relationships.filter((r) => r.type === "SPOUSE_OF");
  const familiesByPair = new Map<string, GedcomExportFamily[]>();
  for (const f of input.families) {
    const a = f.parent1ImmichPersonId;
    const b = f.parent2ImmichPersonId;
    if (!a || !b) {
      continue;
    }
    const k = spousePairKey(a, b);
    const list = familiesByPair.get(k) ?? [];
    list.push(f);
    familiesByPair.set(k, list);
  }
  for (const list of familiesByPair.values()) {
    list.sort((a, b) => a.id.localeCompare(b.id));
  }

  const syntheticPairToXref = new Map<string, string>();
  const syntheticPairs: string[] = [];
  for (const r of spouseRelationships) {
    const k = spousePairKey(r.fromPersonId, r.toPersonId);
    const existing = familiesByPair.get(k);
    if (existing && existing.length > 0) {
      continue;
    }
    if (!syntheticPairToXref.has(k)) {
      syntheticPairs.push(k);
      let xref = nextFamXref();
      while (usedFamXrefs.has(xref)) {
        xref = nextFamXref();
      }
      usedFamXrefs.add(xref);
      syntheticPairToXref.set(k, xref);
      const [lo, hi] = k.split("|") as [string, string];
      xrefs.fam[xref] = {
        familyId: null,
        syntheticSpouseOnly: true,
        spousePair: [lo!, hi!]
      };
    }
  }
  syntheticPairs.sort();

  const relationshipIdToFamXref = new Map<string, string>();
  for (const r of spouseRelationships) {
    const k = spousePairKey(r.fromPersonId, r.toPersonId);
    const famList = familiesByPair.get(k);
    const fromFamily = famList?.[0]?.id ? familyIdToXref.get(famList[0]!.id) : undefined;
    if (fromFamily) {
      relationshipIdToFamXref.set(r.id, fromFamily);
    } else {
      const syn = syntheticPairToXref.get(k);
      if (syn) {
        relationshipIdToFamXref.set(r.id, syn);
      }
    }
  }

  const famLinesByXref = new Map<string, string[]>();

  const famHeader = (xref: string) => `0 @${xref}@ FAM`;

  for (const xref of new Set([...familyIdToXref.values(), ...syntheticPairToXref.values()])) {
    famLinesByXref.set(xref, [famHeader(xref)]);
  }

  for (const f of familiesSorted) {
    const xref = familyIdToXref.get(f.id)!;
    const { husb, wife } = husbWifeForParents(
      f.parent1ImmichPersonId,
      f.parent2ImmichPersonId,
      genderByImmich
    );
    const lines = famLinesByXref.get(xref)!;
    if (husb) {
      const ix = immichToIndi.get(husb);
      if (ix) {
        lines.push(line(1, "HUSB", `@${ix}@`));
      }
    }
    if (wife) {
      const ix = immichToIndi.get(wife);
      if (ix) {
        lines.push(line(1, "WIFE", `@${ix}@`));
      }
    }
    const kids = [...f.children].sort((a, b) => a.childImmichPersonId.localeCompare(b.childImmichPersonId));
    for (const c of kids) {
      const ix = immichToIndi.get(c.childImmichPersonId);
      if (!ix) {
        continue;
      }
      lines.push(line(1, "CHIL", `@${ix}@`));
      const pedi = pediFromPedigree(c.pedigree);
      if (pedi) {
        lines.push(line(2, "PEDI", pedi));
      }
    }
    if (f.notes?.trim()) {
      lines.push(line(1, "NOTE", f.notes.trim()));
    }
  }

  for (const pairKey of syntheticPairs) {
    const xref = syntheticPairToXref.get(pairKey)!;
    const [lo, hi] = pairKey.split("|") as [string, string];
    const { husb, wife } = husbWifeForParents(lo, hi, genderByImmich);
    const lines = famLinesByXref.get(xref)!;
    if (husb) {
      const ix = immichToIndi.get(husb);
      if (ix) {
        lines.push(line(1, "HUSB", `@${ix}@`));
      }
    }
    if (wife) {
      const ix = immichToIndi.get(wife);
      if (ix) {
        lines.push(line(1, "WIFE", `@${ix}@`));
      }
    }
  }

  const emitEventBlock = (
    out: string[],
    baseLevel: number,
    e: GedcomExportLifeEvent,
    opts: { redactThisPerson: boolean }
  ) => {
    if (opts.redactThisPerson) {
      return;
    }
    const { tag, typeLine } = lifeEventToTag(e.eventType, e.customLabel);
    out.push(line(baseLevel, tag));
    if (typeLine) {
      out.push(line(baseLevel + 1, "TYPE", typeLine));
    }
    const d = formatGedcomDate(e);
    if (d) {
      out.push(line(baseLevel + 1, "DATE", d));
    }
    if (e.place) {
      const pl = formatPlaceOneLine(e.place);
      if (pl) {
        out.push(line(baseLevel + 1, "PLAC", pl));
      }
      if (e.place.latitude != null && e.place.longitude != null) {
        out.push(line(baseLevel + 1, "MAP"));
        const lat = e.place.latitude;
        const lon = e.place.longitude;
        out.push(line(baseLevel + 2, "LATI", lat >= 0 ? `N${Math.abs(lat)}` : `S${Math.abs(lat)}`));
        out.push(line(baseLevel + 2, "LONG", lon >= 0 ? `E${Math.abs(lon)}` : `W${Math.abs(lon)}`));
      }
    }
    if (e.notes?.trim()) {
      out.push(line(baseLevel + 1, "NOTE", e.notes.trim()));
    }
    for (const c of e.citations) {
      const sx = sourceIdToXref.get(c.sourceId);
      if (sx) {
        out.push(line(baseLevel + 1, "SOUR", `@${sx}@`));
        if (c.page?.trim()) {
          out.push(line(baseLevel + 2, "PAGE", c.page.trim()));
        }
        if (c.notes?.trim()) {
          out.push(line(baseLevel + 2, "NOTE", c.notes.trim()));
        }
      }
    }
  };

  const mediaForLifeEvent = (lifeEventId: string): string[] => {
    const xrefsOut: string[] = [];
    for (const link of input.mediaLinks) {
      if (link.targetType !== "LIFE_EVENT" || link.targetId !== lifeEventId) {
        continue;
      }
      const ox = mediaIdToXref.get(link.mediaObjectId);
      if (ox) {
        xrefsOut.push(ox);
      }
    }
    return [...new Set(xrefsOut)].sort();
  };

  const mediaForPersonProfile = (profileId: string): string[] => {
    const xrefsOut: string[] = [];
    for (const link of input.mediaLinks) {
      if (link.targetType !== "PERSON_PROFILE" || link.targetId !== profileId) {
        continue;
      }
      const ox = mediaIdToXref.get(link.mediaObjectId);
      if (ox) {
        xrefsOut.push(ox);
      }
    }
    return [...new Set(xrefsOut)].sort();
  };

  const mediaForSource = (sourceId: string): string[] => {
    const xrefsOut: string[] = [];
    for (const link of input.mediaLinks) {
      if (link.targetType !== "SOURCE" || link.targetId !== sourceId) {
        continue;
      }
      const ox = mediaIdToXref.get(link.mediaObjectId);
      if (ox) {
        xrefsOut.push(ox);
      }
    }
    return [...new Set(xrefsOut)].sort();
  };

  /** MARR / DIV and other events scoped to relationship */
  for (const e of input.lifeEvents) {
    if (!e.relationshipId || (e.eventType !== "MARRIAGE" && e.eventType !== "DIVORCE")) {
      continue;
    }
    const famX = relationshipIdToFamXref.get(e.relationshipId);
    if (!famX) {
      continue;
    }
    const lines = famLinesByXref.get(famX)!;
    const { tag } = lifeEventToTag(e.eventType, e.customLabel);
    lines.push(line(1, tag));
    const d = formatGedcomDate(e);
    if (d) {
      lines.push(line(2, "DATE", d));
    }
    if (e.place) {
      const pl = formatPlaceOneLine(e.place);
      if (pl) {
        lines.push(line(2, "PLAC", pl));
      }
    }
    if (e.notes?.trim()) {
      lines.push(line(2, "NOTE", e.notes.trim()));
    }
    for (const c of e.citations) {
      const sx = sourceIdToXref.get(c.sourceId);
      if (sx) {
        lines.push(line(2, "SOUR", `@${sx}@`));
        if (c.page?.trim()) {
          lines.push(line(3, "PAGE", c.page.trim()));
        }
      }
    }
    for (const ox of mediaForLifeEvent(e.id)) {
      lines.push(line(2, "OBJE", `@${ox}@`));
    }
  }

  /** Family-scoped life events */
  for (const e of input.lifeEvents) {
    if (!e.familyId) {
      continue;
    }
    const famX = familyIdToXref.get(e.familyId);
    if (!famX) {
      continue;
    }
    const lines = famLinesByXref.get(famX)!;
    const { tag, typeLine } = lifeEventToTag(e.eventType, e.customLabel);
    lines.push(line(1, tag));
    if (typeLine) {
      lines.push(line(2, "TYPE", typeLine));
    }
    const d = formatGedcomDate(e);
    if (d) {
      lines.push(line(2, "DATE", d));
    }
    if (e.place) {
      const pl = formatPlaceOneLine(e.place);
      if (pl) {
        lines.push(line(2, "PLAC", pl));
      }
    }
    if (e.notes?.trim()) {
      lines.push(line(2, "NOTE", e.notes.trim()));
    }
    for (const c of e.citations) {
      const sx = sourceIdToXref.get(c.sourceId);
      if (sx) {
        lines.push(line(2, "SOUR", `@${sx}@`));
        if (c.page?.trim()) {
          lines.push(line(3, "PAGE", c.page.trim()));
        }
      }
    }
    for (const ox of mediaForLifeEvent(e.id)) {
      lines.push(line(2, "OBJE", `@${ox}@`));
    }
  }

  const indiBlocks: string[][] = [];

  for (const p of profilesSorted) {
    const ix = immichToIndi.get(p.immichPersonId)!;
    const indiX = `@${ix}@`;
    const block: string[] = [line(0, indiX, "INDI")];
    if (includeTreemichCustomTags) {
      block.push(line(1, "_TREEMICH_IMMICH_PERSON_ID", p.immichPersonId));
    }
    const primaryName =
      input.personNames.find((n) => n.personProfileId === p.id && n.isPrimary) ??
      input.personNames.find((n) => n.personProfileId === p.id);
    const displayGiven = primaryName?.givenName ?? p.givenName;
    const displaySurname = primaryName?.surname ?? p.surname;
    block.push(line(1, "NAME", gedcomNameLine(displayGiven, displaySurname)));
    if (primaryName?.prefix?.trim()) {
      block.push(line(2, "NPFX", primaryName.prefix.trim()));
    }
    if (primaryName?.givenName?.trim()) {
      block.push(line(2, "GIVN", primaryName.givenName.trim()));
    }
    if (primaryName?.surname?.trim()) {
      block.push(line(2, "SURN", primaryName.surname.trim()));
    }
    if (primaryName?.suffix?.trim()) {
      block.push(line(2, "NSFX", primaryName.suffix.trim()));
    }
    for (const n of input.personNames
      .filter((x) => x.personProfileId === p.id && x !== primaryName)
      .sort((a, b) => a.type.localeCompare(b.type))) {
      block.push(line(1, "NAME", gedcomNameLine(n.givenName, n.surname)));
      const gt = personNameTypeToGedcom(n.type);
      if (gt) {
        block.push(line(2, "TYPE", gt));
      }
    }
    block.push(line(1, "SEX", sexFromGender(p.gender)));

    const redactPerson = redactLiving && livingByProfileId.get(p.id) === true;

    const personEvents = input.lifeEvents
      .filter((e) => e.personProfileId === p.id && !e.relationshipId && !e.familyId)
      .sort((a, b) => {
        const ak = `${a.eventType}:${a.year ?? 0}`;
        const bk = `${b.eventType}:${b.year ?? 0}`;
        return ak.localeCompare(bk);
      });
    for (const e of personEvents) {
      emitEventBlock(block, 1, e, { redactThisPerson: redactPerson });
      if (!redactPerson) {
        for (const ox of mediaForLifeEvent(e.id)) {
          block.push(line(2, "OBJE", `@${ox}@`));
        }
      }
    }

    for (const ox of mediaForPersonProfile(p.id)) {
      block.push(line(1, "OBJE", `@${ox}@`));
    }

    for (const f of familiesSorted) {
      const xref = familyIdToXref.get(f.id)!;
      const p1 = f.parent1ImmichPersonId;
      const p2 = f.parent2ImmichPersonId;
      if (p1 === p.immichPersonId || p2 === p.immichPersonId) {
        block.push(line(1, "FAMS", `@${xref}@`));
      }
    }
    for (const k of syntheticPairs) {
      const [lo, hi] = k.split("|") as [string, string];
      if (lo === p.immichPersonId || hi === p.immichPersonId) {
        const sx = syntheticPairToXref.get(k)!;
        block.push(line(1, "FAMS", `@${sx}@`));
      }
    }
    for (const f of familiesSorted) {
      const xref = familyIdToXref.get(f.id)!;
      if (f.children.some((c) => c.childImmichPersonId === p.immichPersonId)) {
        block.push(line(1, "FAMC", `@${xref}@`));
      }
    }

    indiBlocks.push(block);
  }

  const out: string[] = [];
  out.push(line(0, "HEAD"));
  out.push(line(1, "SOUR", "Treemich"));
  out.push(line(2, "VERS", "1"));
  out.push(line(2, "NAME", "Treemich"));
  out.push(line(1, "GEDC"));
  out.push(line(2, "VERS", "5.5.1"));
  out.push(line(2, "FORM", "LINEAGE-LINKED"));
  out.push(line(1, "CHAR", "UTF-8"));
  out.push(line(1, "DEST", "ANY"));
  out.push(line(1, "DATE", new Date().toISOString().slice(0, 10)));

  for (const block of indiBlocks) {
    out.push(...block);
  }

  const famXrefsOrdered = [
    ...familiesSorted.map((f) => familyIdToXref.get(f.id)!),
    ...syntheticPairs.map((k) => syntheticPairToXref.get(k)!)
  ];
  for (const fx of famXrefsOrdered) {
    out.push(...(famLinesByXref.get(fx) ?? []));
  }

  for (const r of reposSorted) {
    const rx = repoIdToXref.get(r.id)!;
    out.push(line(0, `@${rx}@`, "REPO"));
    out.push(line(1, "NAME", r.name));
    if (r.addressLine1?.trim()) {
      out.push(line(1, "ADDR", r.addressLine1.trim()));
    }
    if (r.url?.trim()) {
      out.push(line(1, "WWW", r.url.trim()));
    }
    if (r.notes?.trim()) {
      out.push(line(1, "NOTE", r.notes.trim()));
    }
  }

  for (const s of sourcesSorted) {
    const sx = sourceIdToXref.get(s.id)!;
    out.push(line(0, `@${sx}@`, "SOUR"));
    out.push(line(1, "TITL", s.title));
    if (s.author?.trim()) {
      out.push(line(1, "AUTH", s.author.trim()));
    }
    if (s.publication?.trim()) {
      out.push(line(1, "PUBL", s.publication.trim()));
    }
    if (s.url?.trim()) {
      out.push(line(1, "WWW", s.url.trim()));
    }
    if (s.repositoryId) {
      const rx = repoIdToXref.get(s.repositoryId);
      if (rx) {
        out.push(line(1, "REPO", `@${rx}@`));
      }
    }
    if (s.notes?.trim()) {
      out.push(line(1, "NOTE", s.notes.trim()));
    }
    for (const ox of mediaForSource(s.id)) {
      out.push(line(1, "OBJE", `@${ox}@`));
    }
  }

  for (const m of mediaSorted) {
    const ox = mediaIdToXref.get(m.id)!;
    out.push(line(0, `@${ox}@`, "OBJE"));
    out.push(line(1, "FILE", m.storageUrl));
    if (m.mimeType?.trim()) {
      out.push(line(1, "FORM", m.mimeType.trim()));
    }
    if (m.title?.trim()) {
      out.push(line(1, "TITL", m.title.trim()));
    }
  }

  out.push(line(0, "TRLR", ""));

  const gedcomUtf8 = `${out.join("\n")}\n`;
  return { gedcomUtf8, xrefs };
}

/** Normalize GEDCOM for snapshot tests (trim, drop volatile DATE line in HEAD). */
export function normalizeGedcomForTest(gedcom: string): string {
  return gedcom
    .split("\n")
    .filter((l) => !l.match(/^1 DATE /))
    .join("\n")
    .trim();
}
