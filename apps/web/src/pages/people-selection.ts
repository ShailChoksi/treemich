import type { PersonRecord, RelationshipRecord } from "../lib/api";

const normalizeName = (value: string | null | undefined) => value?.trim().toLocaleLowerCase() ?? "";

export const findBestPersonMatchByName = (
  people: PersonRecord[],
  currentUserName: string | null | undefined
) => {
  const normalizedName = normalizeName(currentUserName);
  if (!normalizedName) {
    return null;
  }

  const exactMatches = people.filter((person) => normalizeName(person.name) === normalizedName);
  if (exactMatches.length > 0) {
    return [...exactMatches].sort(
      (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
    )[0];
  }

  const containsMatches = people.filter((person) => normalizeName(person.name).includes(normalizedName));
  if (containsMatches.length > 0) {
    return [...containsMatches].sort(
      (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
    )[0];
  }

  return null;
};

export type ResolvePeopleSelectionOptions = {
  people: PersonRecord[];
  relationships: RelationshipRecord[];
  currentSelectedPersonId: string | null;
  lastSelectedPersonId: string | null | undefined;
  currentUserName: string | null | undefined;
};

export const resolvePeopleSelection = ({
  people,
  relationships,
  currentSelectedPersonId,
  lastSelectedPersonId,
  currentUserName
}: ResolvePeopleSelectionOptions) => {
  const personIds = new Set(people.map((person) => person.id));
  const hasRelationships = relationships.length > 0;

  if (!hasRelationships) {
    return {
      selectedPersonId: null,
      cameraFocusPersonId: findBestPersonMatchByName(people, currentUserName)?.id ?? null
    };
  }

  if (currentSelectedPersonId && personIds.has(currentSelectedPersonId)) {
    return {
      selectedPersonId: currentSelectedPersonId,
      cameraFocusPersonId: null
    };
  }

  if (lastSelectedPersonId && personIds.has(lastSelectedPersonId)) {
    return {
      selectedPersonId: lastSelectedPersonId,
      cameraFocusPersonId: lastSelectedPersonId
    };
  }

  return {
    selectedPersonId: people[0]?.id ?? null,
    cameraFocusPersonId: null
  };
};
