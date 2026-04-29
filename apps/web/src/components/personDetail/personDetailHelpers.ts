/**
 * @file Pure helpers: labels, date/gender formatting, relationship picker data.
 */

import type { Gender, Person, RelationshipRecord, RelationshipType } from "../../lib/api";
import type { PrimaryFamilyOption } from "./types";

const getGenderedTerm = (
  gender: Gender | null | undefined,
  values: { male: string; female: string; fallback: string }
) => {
  if (gender === "MALE") {
    return values.male;
  }
  if (gender === "FEMALE") {
    return values.female;
  }
  return values.fallback;
};

export const getRelativeRelationshipLabel = (
  relationshipType: RelationshipRecord["type"],
  relatedGender: Gender | null | undefined
) => {
  if (relationshipType === "PARENT_OF") {
    return getGenderedTerm(relatedGender, { male: "Father", female: "Mother", fallback: "Parent" });
  }
  if (relationshipType === "CHILD_OF") {
    return getGenderedTerm(relatedGender, { male: "Son", female: "Daughter", fallback: "Child" });
  }
  if (relationshipType === "SPOUSE_OF") {
    return getGenderedTerm(relatedGender, { male: "Husband", female: "Wife", fallback: "Spouse" });
  }
  if (relationshipType === "SIBLING_OF") {
    return getGenderedTerm(relatedGender, { male: "Brother", female: "Sister", fallback: "Sibling" });
  }
  if (relationshipType === "FRIEND_OF") {
    return "Friend";
  }
  return "Pet";
};

export const getInLawRelationshipLabel = (label: string, relatedGender: Gender | null | undefined) => {
  if (label === "Sibling-in-law") {
    return getGenderedTerm(relatedGender, {
      male: "Brother-in-law",
      female: "Sister-in-law",
      fallback: "Sibling-in-law"
    });
  }
  if (label === "Uncle/Aunt-in-law") {
    return getGenderedTerm(relatedGender, {
      male: "Uncle-in-law",
      female: "Aunt-in-law",
      fallback: "Uncle/Aunt-in-law"
    });
  }
  return label;
};

const relationshipEditorLabel = (
  relationshipType: RelationshipType,
  personName: string,
  relatedName: string,
  personGender: Gender | null | undefined
) => {
  if (relationshipType === "PARENT_OF") {
    return `${personName} is ${getGenderedTerm(personGender, {
      male: "father",
      female: "mother",
      fallback: "parent"
    })} of ${relatedName}`;
  }
  if (relationshipType === "CHILD_OF") {
    return `${personName} is ${getGenderedTerm(personGender, {
      male: "son",
      female: "daughter",
      fallback: "child"
    })} of ${relatedName}`;
  }
  if (relationshipType === "SPOUSE_OF") {
    return `${personName} is ${getGenderedTerm(personGender, {
      male: "husband",
      female: "wife",
      fallback: "spouse"
    })} of ${relatedName}`;
  }
  if (relationshipType === "FRIEND_OF") {
    return `${personName} is friend of ${relatedName}`;
  }
  if (relationshipType === "PET_OF") {
    return `${personName} has pet ${relatedName}`;
  }
  return `${personName} is ${getGenderedTerm(personGender, {
    male: "brother",
    female: "sister",
    fallback: "sibling"
  })} of ${relatedName}`;
};

export const getAllowedRelationshipOptions = (
  relationshipType: RelationshipType,
  personName: string,
  relatedName: string,
  personGender: Gender | null | undefined
) => {
  const relationshipOptions: Array<{ value: RelationshipType; label: string }> = [
    {
      value: "PARENT_OF",
      label: relationshipEditorLabel("PARENT_OF", personName, relatedName, personGender)
    },
    { value: "CHILD_OF", label: relationshipEditorLabel("CHILD_OF", personName, relatedName, personGender) },
    {
      value: "SPOUSE_OF",
      label: relationshipEditorLabel("SPOUSE_OF", personName, relatedName, personGender)
    },
    {
      value: "SIBLING_OF",
      label: relationshipEditorLabel("SIBLING_OF", personName, relatedName, personGender)
    },
    {
      value: "FRIEND_OF",
      label: relationshipEditorLabel("FRIEND_OF", personName, relatedName, personGender)
    },
    { value: "PET_OF", label: relationshipEditorLabel("PET_OF", personName, relatedName, personGender) }
  ];
  if (relationshipType === "PARENT_OF" || relationshipType === "CHILD_OF") {
    return relationshipOptions.filter(
      (option) => option.value === "PARENT_OF" || option.value === "CHILD_OF"
    );
  }

  if (relationshipType === "SPOUSE_OF" || relationshipType === "SIBLING_OF") {
    return relationshipOptions.filter(
      (option) => option.value === "SPOUSE_OF" || option.value === "SIBLING_OF"
    );
  }

  if (relationshipType === "FRIEND_OF" || relationshipType === "PET_OF") {
    return relationshipOptions.filter((option) => option.value === "FRIEND_OF" || option.value === "PET_OF");
  }

  return relationshipOptions;
};

export const formatBirthDate = (birthDate?: string | null) => {
  if (!birthDate) {
    return "Unknown";
  }

  const trimmed = birthDate.trim();
  const isoDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  const formatter = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });

  if (isoDateMatch) {
    const year = Number(isoDateMatch[1]);
    const month = Number(isoDateMatch[2]);
    const day = Number(isoDateMatch[3]);
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    if (
      utcDate.getUTCFullYear() === year &&
      utcDate.getUTCMonth() + 1 === month &&
      utcDate.getUTCDate() === day
    ) {
      return formatter.format(utcDate);
    }
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return trimmed;
  }

  return formatter.format(date);
};

export const formatGenderLabel = (gender: Gender) => gender.charAt(0) + gender.slice(1).toLowerCase();

export const indexRelationshipsByPersonId = (relationships: RelationshipRecord[]) => {
  const index = new Map<string, RelationshipRecord[]>();
  for (const relationship of relationships) {
    const pushForPerson = (personId: string) => {
      const existing = index.get(personId);
      if (existing) {
        existing.push(relationship);
      } else {
        index.set(personId, [relationship]);
      }
    };
    pushForPerson(relationship.fromPersonId);
    pushForPerson(relationship.toPersonId);
  }
  return index;
};

export const buildPrimaryFamilyOptions = (
  personId: string,
  peopleById: Map<string, Person>,
  relationships: RelationshipRecord[]
): PrimaryFamilyOption[] => {
  const parentIds = new Set<string>();
  for (const relationship of relationships) {
    if (relationship.type === "PARENT_OF" && relationship.toPersonId === personId) {
      parentIds.add(relationship.fromPersonId);
      continue;
    }
    if (relationship.type === "CHILD_OF" && relationship.fromPersonId === personId) {
      parentIds.add(relationship.toPersonId);
    }
  }
  const sorted = [...parentIds].sort((left, right) =>
    (peopleById.get(left)?.name ?? left).localeCompare(peopleById.get(right)?.name ?? right)
  );
  if (sorted.length <= 2) {
    return [];
  }
  const options: PrimaryFamilyOption[] = [];
  for (let firstIndex = 0; firstIndex < sorted.length; firstIndex += 1) {
    const firstId = sorted[firstIndex];
    if (!firstId) {
      continue;
    }
    for (let secondIndex = firstIndex + 1; secondIndex < sorted.length; secondIndex += 1) {
      const secondId = sorted[secondIndex];
      if (!secondId) {
        continue;
      }
      options.push({
        key: firstId < secondId ? `${firstId}|${secondId}` : `${secondId}|${firstId}`,
        label: `${peopleById.get(firstId)?.name ?? firstId} + ${peopleById.get(secondId)?.name ?? secondId}`
      });
    }
  }
  return options;
};
