import type {
  DescendantReportRequest,
  DescendantReportResponse,
  FamilyGroupSheetRequest,
  FamilyGroupSheetResponse,
  PedigreeReportRequest,
  PedigreeReportResponse,
  RegisterReportRequest,
  RegisterReportResponse,
  ReportCitationSummary,
  ReportLifeEventSummary,
  ReportPersonSummary,
  ReportWarning
} from "@treemich/shared";
import { lifeEventTypeLabels } from "@treemich/shared";
import type { Prisma, Relationship } from "@prisma/client";
import { prisma } from "../db/client.js";
import { HttpNotFoundError, HttpValidationError } from "../lifeEvents/errors.js";
import { reportMaxDepth, reportMaxPeople } from "../config/env.js";
import { resolveDisplayNameForPerson } from "../personNames/service.js";

type PersonRow = Prisma.PersonProfileGetPayload<{
  include: {
    personNames: true;
    lifeEvents: {
      include: {
        place: true;
        citations: { include: { source: { include: { repository: true } } } };
      };
    };
    externalIdentities: true;
  };
}>;

type FamilyRow = Prisma.FamilyGetPayload<{
  include: {
    children: true;
    lifeEvents: {
      include: {
        place: true;
        citations: { include: { source: { include: { repository: true } } } };
      };
    };
  };
}>;

type RelationshipRow = Relationship;

type ReportData = {
  people: Map<string, PersonRow>;
  families: FamilyRow[];
  relationships: RelationshipRow[];
};

const fallbackName = (person: Pick<PersonRow, "id" | "displayNameOverride" | "givenName" | "surname">) =>
  person.displayNameOverride?.trim() ||
  [person.givenName, person.surname].filter(Boolean).join(" ").trim() ||
  `Person ${person.id.slice(0, 8)}`;

const sortPeople = (left: ReportPersonSummary, right: ReportPersonSummary) =>
  left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id);

const sortEvents = <
  T extends { year: number | null; month: number | null; day: number | null; label: string }
>(
  left: T,
  right: T
) =>
  (left.year ?? 9999) - (right.year ?? 9999) ||
  (left.month ?? 99) - (right.month ?? 99) ||
  (left.day ?? 99) - (right.day ?? 99) ||
  left.label.localeCompare(right.label);

const dateDisplay = (event: {
  dateQualifier: string;
  year: number | null;
  month: number | null;
  day: number | null;
  endYear: number | null;
  endMonth: number | null;
  endDay: number | null;
}) => {
  const start = [event.year, event.month, event.day].filter((part) => part != null).join("-");
  const end = [event.endYear, event.endMonth, event.endDay].filter((part) => part != null).join("-");
  if (!start && !end) {
    return null;
  }
  const prefix = event.dateQualifier === "EXACT" ? "" : `${event.dateQualifier.toLowerCase()} `;
  return end ? `${prefix}${start} to ${end}` : `${prefix}${start}`;
};

const placeDisplay = (place: PersonRow["lifeEvents"][number]["place"]) => {
  if (!place) {
    return null;
  }
  return [place.name, place.locality, place.adminArea, place.countryCode].filter(Boolean).join(", ");
};

const citationToSummary = (
  citation: PersonRow["lifeEvents"][number]["citations"][number]
): ReportCitationSummary => ({
  id: citation.id,
  sourceTitle: citation.source.title,
  repositoryName: citation.source.repository?.name ?? null,
  page: citation.page,
  notes: citation.notes
});

const eventToSummary = (
  event: PersonRow["lifeEvents"][number] | FamilyRow["lifeEvents"][number],
  redacted: boolean
): ReportLifeEventSummary => ({
  id: event.id,
  type: event.eventType,
  label: event.customLabel ?? lifeEventTypeLabels[event.eventType],
  dateQualifier: event.dateQualifier,
  year: redacted ? null : event.year,
  month: redacted ? null : event.month,
  day: redacted ? null : event.day,
  endYear: redacted ? null : event.endYear,
  endMonth: redacted ? null : event.endMonth,
  endDay: redacted ? null : event.endDay,
  dateDisplay: redacted ? null : dateDisplay(event),
  placeDisplay: redacted ? null : placeDisplay(event.place),
  notes: redacted ? null : event.notes,
  citations: redacted ? [] : event.citations.map(citationToSummary)
});

export const isLivingPerson = (person: Pick<PersonRow, "lifeEvents">) =>
  !person.lifeEvents.some((event) => event.eventType === "DEATH");

const personToSummary = (person: PersonRow, redactLiving: boolean): ReportPersonSummary => {
  const living = isLivingPerson(person);
  const redacted = redactLiving && living;
  const primaryName =
    person.personNames.find((name) => name.type === "BIRTH") ??
    [...person.personNames].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())[0] ??
    null;
  const primaryNameDisplay = primaryName
    ? [primaryName.prefix, primaryName.givenName, primaryName.surname, primaryName.suffix]
        .filter(Boolean)
        .join(" ")
    : null;
  const displayName = redacted
    ? "Living person"
    : resolveDisplayNameForPerson({
        immichName:
          person.externalIdentities.find((identity) => identity.provider === "IMMICH")?.displayName ??
          fallbackName(person),
        displayNameOverride: person.displayNameOverride,
        givenName: person.givenName,
        surname: person.surname,
        primaryName
      });
  return {
    id: person.id,
    displayName,
    gender: redacted ? "UNKNOWN" : person.gender,
    primaryName: redacted ? null : primaryNameDisplay,
    alternateNames: redacted
      ? []
      : person.personNames
          .filter((name) => name.id !== primaryName?.id)
          .map((name) => [name.prefix, name.givenName, name.surname, name.suffix].filter(Boolean).join(" "))
          .filter(Boolean)
          .sort(),
    isLiving: living,
    isRedacted: redacted,
    events: person.lifeEvents.map((event) => eventToSummary(event, redacted)).sort(sortEvents)
  };
};

const assertDepth = (depth: number) => {
  if (depth > reportMaxDepth()) {
    throw new HttpValidationError(`Report depth ${depth} exceeds max depth ${reportMaxDepth()}`);
  }
};

const assertPeopleCap = (ids: Set<string>) => {
  if (ids.size > reportMaxPeople()) {
    throw new HttpValidationError(
      `Report would include ${ids.size} people; lower depth or raise TREEMICH_REPORT_MAX_PEOPLE`
    );
  }
};

const loadData = async (userId: string): Promise<ReportData> => {
  const [people, families, relationships] = await Promise.all([
    prisma.personProfile.findMany({
      where: { userId },
      include: {
        personNames: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        externalIdentities: true,
        lifeEvents: {
          include: { place: true, citations: { include: { source: { include: { repository: true } } } } },
          orderBy: [{ year: "asc" }, { month: "asc" }, { day: "asc" }, { eventType: "asc" }]
        }
      },
      orderBy: [{ surname: "asc" }, { givenName: "asc" }, { createdAt: "asc" }]
    }),
    prisma.family.findMany({
      where: { userId },
      include: {
        children: true,
        lifeEvents: {
          include: { place: true, citations: { include: { source: { include: { repository: true } } } } },
          orderBy: [{ year: "asc" }, { month: "asc" }, { day: "asc" }, { eventType: "asc" }]
        }
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    }),
    prisma.relationship.findMany({
      where: { userId },
      orderBy: [{ fromPersonId: "asc" }, { toPersonId: "asc" }, { type: "asc" }]
    })
  ]);
  return { people: new Map(people.map((person) => [person.id, person])), families, relationships };
};

const requirePerson = (data: ReportData, personId: string) => {
  const person = data.people.get(personId);
  if (!person) {
    throw new HttpNotFoundError("Person not found");
  }
  return person;
};

const requireFamily = (data: ReportData, familyId: string) => {
  const family = data.families.find((row) => row.id === familyId);
  if (!family) {
    throw new HttpNotFoundError("Family not found");
  }
  return family;
};

const parentFamiliesForChild = (data: ReportData, childPersonId: string) => {
  const familyRows = data.families.filter((family) =>
    family.children.some((child) => child.childPersonId === childPersonId)
  );
  if (familyRows.length > 0) {
    return familyRows;
  }
  const parentIds = data.relationships
    .filter((edge) => edge.type === "PARENT_OF" && edge.toPersonId === childPersonId)
    .map((edge) => edge.fromPersonId)
    .sort();
  return parentIds.length > 0
    ? [
        {
          id: null,
          parent1PersonId: parentIds[0] ?? null,
          parent2PersonId: parentIds[1] ?? null,
          children: [],
          lifeEvents: [],
          notes: null
        } as unknown as FamilyRow
      ]
    : [];
};

const childFamiliesForParent = (data: ReportData, parentPersonId: string) => {
  const familyRows = data.families.filter(
    (family) => family.parent1PersonId === parentPersonId || family.parent2PersonId === parentPersonId
  );
  if (familyRows.length > 0) {
    return familyRows;
  }
  const children = data.relationships
    .filter((edge) => edge.type === "PARENT_OF" && edge.fromPersonId === parentPersonId)
    .map((edge) => edge.toPersonId)
    .sort();
  return children.length > 0
    ? [
        {
          id: null,
          parent1PersonId: parentPersonId,
          parent2PersonId: null,
          children: children.map((childPersonId) => ({ childPersonId, pedigree: null })),
          lifeEvents: [],
          notes: null
        } as unknown as FamilyRow
      ]
    : [];
};

const familyParents = (family: FamilyRow) =>
  [family.parent1PersonId, family.parent2PersonId].filter((id): id is string => typeof id === "string");

const familyChildren = (family: FamilyRow) =>
  family.children
    .filter(
      (child): child is typeof child & { childPersonId: string } => typeof child.childPersonId === "string"
    )
    .sort((left, right) => left.childPersonId.localeCompare(right.childPersonId));

export class ReportDataService {
  async buildPedigreeReport(
    userId: string,
    parameters: PedigreeReportRequest
  ): Promise<PedigreeReportResponse> {
    assertDepth(parameters.depth);
    const data = await loadData(userId);
    const root = requirePerson(data, parameters.rootPersonId);
    const warnings: ReportWarning[] = [];
    const seen = new Set<string>([root.id]);
    const generations = [{ generation: 0, people: [personToSummary(root, parameters.redactLiving)] }];
    const edges: PedigreeReportResponse["edges"] = [];
    let frontier = [root.id];

    for (let generation = 1; generation < parameters.depth; generation += 1) {
      const next = new Set<string>();
      for (const childId of frontier) {
        const families = parentFamiliesForChild(data, childId);
        if (families.length > 1) {
          warnings.push({
            code: "MULTIPLE_PARENT_FAMILIES",
            message: "Multiple parent families found",
            personId: childId
          });
        }
        for (const family of families) {
          for (const parentId of familyParents(family)) {
            if (seen.has(parentId)) {
              warnings.push({
                code: "PEDIGREE_CYCLE",
                message: "Cycle detected while building pedigree",
                personId: parentId
              });
              continue;
            }
            if (data.people.has(parentId)) {
              seen.add(parentId);
              next.add(parentId);
              edges.push({ childPersonId: childId, parentPersonId: parentId, familyId: family.id });
            }
          }
        }
      }
      assertPeopleCap(seen);
      if (next.size === 0) {
        break;
      }
      generations.push({
        generation,
        people: [...next]
          .map((id) => personToSummary(requirePerson(data, id), parameters.redactLiving))
          .sort(sortPeople)
      });
      frontier = [...next].sort();
    }

    return {
      type: "pedigree",
      generatedAt: new Date().toISOString(),
      parameters,
      warnings,
      root: personToSummary(root, parameters.redactLiving),
      generations,
      edges
    };
  }

  async buildDescendantReport(
    userId: string,
    parameters: DescendantReportRequest
  ): Promise<DescendantReportResponse> {
    assertDepth(parameters.depth);
    const data = await loadData(userId);
    const root = requirePerson(data, parameters.rootPersonId);
    const warnings: ReportWarning[] = [];
    const seen = new Set<string>([root.id]);
    const generations: DescendantReportResponse["generations"] = [];
    let frontier = [root.id];

    for (let generation = 0; generation < parameters.depth; generation += 1) {
      const families = frontier.flatMap((parentId) => childFamiliesForParent(data, parentId));
      const next = new Set<string>();
      const generationFamilies = families.map((family) => {
        const children = familyChildren(family).flatMap((child) => {
          const person = data.people.get(child.childPersonId);
          if (!person) {
            return [];
          }
          if (seen.has(child.childPersonId) && generation > 0) {
            warnings.push({
              code: "DESCENDANT_CYCLE",
              message: "Cycle or duplicate path detected",
              personId: child.childPersonId
            });
            return [];
          }
          seen.add(child.childPersonId);
          next.add(child.childPersonId);
          return [{ person: personToSummary(person, parameters.redactLiving), pedigree: child.pedigree }];
        });
        return {
          familyId: family.id,
          parents: familyParents(family)
            .flatMap((id) => {
              const person = data.people.get(id);
              return person ? [personToSummary(person, parameters.redactLiving)] : [];
            })
            .sort(sortPeople),
          children
        };
      });
      generations.push({ generation, families: generationFamilies });
      assertPeopleCap(seen);
      frontier = [...next].sort();
      if (frontier.length === 0) {
        break;
      }
    }

    return {
      type: "descendants",
      generatedAt: new Date().toISOString(),
      parameters,
      warnings,
      root: personToSummary(root, parameters.redactLiving),
      generations
    };
  }

  async buildFamilyGroupSheet(
    userId: string,
    parameters: FamilyGroupSheetRequest
  ): Promise<FamilyGroupSheetResponse> {
    const data = await loadData(userId);
    const family = requireFamily(data, parameters.familyId);
    const parentSummaries = familyParents(family)
      .flatMap((id) => {
        const person = data.people.get(id);
        return person ? [personToSummary(person, parameters.redactLiving)] : [];
      })
      .sort(sortPeople);
    const childSummaries = familyChildren(family).flatMap((child) => {
      const person = data.people.get(child.childPersonId);
      return person
        ? [{ person: personToSummary(person, parameters.redactLiving), pedigree: child.pedigree }]
        : [];
    });
    const events = family.lifeEvents.map((event) => eventToSummary(event, false)).sort(sortEvents);
    return {
      type: "family-group",
      generatedAt: new Date().toISOString(),
      parameters,
      warnings: [],
      family: {
        id: family.id,
        notes: family.notes,
        parents: parentSummaries,
        children: childSummaries,
        events,
        citations: events.flatMap((event) => event.citations)
      }
    };
  }

  async buildRegisterReport(
    userId: string,
    parameters: RegisterReportRequest
  ): Promise<RegisterReportResponse> {
    const descendants = await this.buildDescendantReport(userId, parameters);
    let number = 1;
    const sections = descendants.generations.flatMap((generation) =>
      generation.families.flatMap((family) =>
        family.children.map((child) => {
          const eventText = child.person.events
            .filter((event) => event.dateDisplay || event.placeDisplay)
            .map(
              (event) =>
                `${child.person.displayName} had ${event.label.toLowerCase()} ${event.dateDisplay ?? ""}${event.placeDisplay ? ` in ${event.placeDisplay}` : ""}.`
            );
          return {
            number: number++,
            generation: generation.generation + 1,
            person: child.person,
            familySummaries: family.parents.map((parent) => `Child of ${parent.displayName}`),
            prose:
              eventText.length > 0
                ? eventText
                : [`${child.person.displayName} appears in generation ${generation.generation + 1}.`],
            citations: child.person.events.flatMap((event) => event.citations)
          };
        })
      )
    );
    sections.unshift({
      number: 1,
      generation: 0,
      person: descendants.root,
      familySummaries: [],
      prose: [`${descendants.root.displayName} is the root of this register report.`],
      citations: descendants.root.events.flatMap((event) => event.citations)
    });
    sections.forEach((section, index) => {
      section.number = index + 1;
    });
    return {
      type: "register",
      generatedAt: new Date().toISOString(),
      parameters,
      warnings: descendants.warnings,
      root: descendants.root,
      sections
    };
  }
}
