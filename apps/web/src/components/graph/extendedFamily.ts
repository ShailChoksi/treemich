import type { ImmichPerson, RelationshipRecord } from "../../lib/api";
import { buildParentChildIndex } from "./layout";

export type ExtendedFamilyMember = {
  personId: string;
  personName: string;
  label: string;
  hopCount: number;
};

type GraphIndices = {
  parentsByChild: Map<string, Set<string>>;
  childrenByParent: Map<string, Set<string>>;
  siblingsByPerson: Map<string, Set<string>>;
  spousesByPerson: Map<string, Set<string>>;
};

export const buildSiblingIndex = (relationships: RelationshipRecord[]): Map<string, Set<string>> => {
  const siblingsByPerson = new Map<string, Set<string>>();
  for (const relationship of relationships) {
    if (relationship.type !== "SIBLING_OF") {
      continue;
    }
    const { fromPersonId, toPersonId } = relationship;
    if (fromPersonId === toPersonId) {
      continue;
    }
    const existingFrom = siblingsByPerson.get(fromPersonId);
    if (existingFrom) {
      existingFrom.add(toPersonId);
    } else {
      siblingsByPerson.set(fromPersonId, new Set([toPersonId]));
    }
    const existingTo = siblingsByPerson.get(toPersonId);
    if (existingTo) {
      existingTo.add(fromPersonId);
    } else {
      siblingsByPerson.set(toPersonId, new Set([fromPersonId]));
    }
  }
  return siblingsByPerson;
};

export const buildSpouseIndex = (relationships: RelationshipRecord[]): Map<string, Set<string>> => {
  const spousesByPerson = new Map<string, Set<string>>();
  for (const relationship of relationships) {
    if (relationship.type !== "SPOUSE_OF") {
      continue;
    }
    const { fromPersonId, toPersonId } = relationship;
    if (fromPersonId === toPersonId) {
      continue;
    }
    const existingFrom = spousesByPerson.get(fromPersonId);
    if (existingFrom) {
      existingFrom.add(toPersonId);
    } else {
      spousesByPerson.set(fromPersonId, new Set([toPersonId]));
    }
    const existingTo = spousesByPerson.get(toPersonId);
    if (existingTo) {
      existingTo.add(fromPersonId);
    } else {
      spousesByPerson.set(toPersonId, new Set([fromPersonId]));
    }
  }
  return spousesByPerson;
};

const buildGraphIndices = (relationships: RelationshipRecord[]): GraphIndices => {
  const { parentsByChild, childrenByParent } = buildParentChildIndex(relationships);
  const siblingsByPerson = buildSiblingIndex(relationships);
  const spousesByPerson = buildSpouseIndex(relationships);
  return { parentsByChild, childrenByParent, siblingsByPerson, spousesByPerson };
};

type HopStep = "PARENT" | "CHILD" | "SIBLING" | "SPOUSE";

const getNeighbors = (personId: string, step: HopStep, indices: GraphIndices): Set<string> => {
  if (step === "PARENT") {
    return indices.parentsByChild.get(personId) ?? new Set();
  }
  if (step === "CHILD") {
    return indices.childrenByParent.get(personId) ?? new Set();
  }
  if (step === "SPOUSE") {
    return indices.spousesByPerson.get(personId) ?? new Set();
  }
  return indices.siblingsByPerson.get(personId) ?? new Set();
};

const walkHops = (startId: string, hops: HopStep[], indices: GraphIndices): Set<string> => {
  let frontier = new Set([startId]);

  for (const step of hops) {
    const nextFrontier = new Set<string>();
    for (const personId of frontier) {
      for (const neighbor of getNeighbors(personId, step, indices)) {
        if (neighbor !== startId) {
          nextFrontier.add(neighbor);
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.size === 0) {
      break;
    }
  }

  return frontier;
};

type ExtendedFamilyRule = {
  label: string;
  hops: HopStep[];
};

const buildRules = (): ExtendedFamilyRule[] => {
  const rules: ExtendedFamilyRule[] = [
    { label: "Grandparent", hops: ["PARENT", "PARENT"] },
    { label: "Grandchild", hops: ["CHILD", "CHILD"] },
    { label: "Uncle/Aunt", hops: ["PARENT", "SIBLING"] },
    { label: "Nephew/Niece", hops: ["SIBLING", "CHILD"] }
  ];

  for (let degree = 1; degree <= 3; degree += 1) {
    const upHops: HopStep[] = Array.from({ length: degree }, () => "PARENT" as HopStep);
    const downHops: HopStep[] = Array.from({ length: degree }, () => "CHILD" as HopStep);
    const ordinal = degree === 1 ? "1st" : degree === 2 ? "2nd" : "3rd";
    rules.push({
      label: `${ordinal} Cousin`,
      hops: [...upHops, "SIBLING", ...downHops]
    });
  }

  return rules;
};

const RULES = buildRules();

const IN_LAW_RULES: ExtendedFamilyRule[] = [
  { label: "Parent-in-law", hops: ["SPOUSE", "PARENT"] },
  { label: "Child-in-law", hops: ["CHILD", "SPOUSE"] },
  { label: "Sibling-in-law", hops: ["SPOUSE", "SIBLING"] },
  { label: "Sibling-in-law", hops: ["SIBLING", "SPOUSE"] },
  { label: "Grandparent-in-law", hops: ["SPOUSE", "PARENT", "PARENT"] },
  { label: "Uncle/Aunt-in-law", hops: ["SPOUSE", "PARENT", "SIBLING"] },
  { label: "Cousin-in-law", hops: ["SPOUSE", "PARENT", "SIBLING", "CHILD"] }
];

const computeFamilyMembers = (
  selectedPersonId: string,
  people: ImmichPerson[],
  relationships: RelationshipRecord[],
  directRelativeIds: Set<string>,
  rules: ExtendedFamilyRule[]
): ExtendedFamilyMember[] => {
  const peopleById = new Map(people.map((entry) => [entry.id, entry]));
  if (!peopleById.has(selectedPersonId)) {
    return [];
  }

  const indices = buildGraphIndices(relationships);
  const seen = new Set<string>([selectedPersonId, ...directRelativeIds]);
  const results: ExtendedFamilyMember[] = [];

  for (const rule of rules) {
    const reachable = walkHops(selectedPersonId, rule.hops, indices);
    for (const personId of reachable) {
      if (seen.has(personId)) {
        continue;
      }
      const person = peopleById.get(personId);
      if (!person) {
        continue;
      }
      seen.add(personId);
      results.push({
        personId,
        personName: person.name,
        label: rule.label,
        hopCount: rule.hops.length
      });
    }
  }

  return results.sort(
    (a, b) =>
      a.hopCount - b.hopCount || a.label.localeCompare(b.label) || a.personName.localeCompare(b.personName)
  );
};

export const computeExtendedFamily = (
  selectedPersonId: string,
  people: ImmichPerson[],
  relationships: RelationshipRecord[],
  directRelativeIds: Set<string>
): ExtendedFamilyMember[] => {
  return computeFamilyMembers(selectedPersonId, people, relationships, directRelativeIds, RULES);
};

export const computeInLawFamily = (
  selectedPersonId: string,
  people: ImmichPerson[],
  relationships: RelationshipRecord[],
  excludedPersonIds: Set<string>
): ExtendedFamilyMember[] =>
  computeFamilyMembers(selectedPersonId, people, relationships, excludedPersonIds, IN_LAW_RULES);
