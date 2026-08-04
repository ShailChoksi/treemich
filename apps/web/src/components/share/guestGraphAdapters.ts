/**
 * @file Adapt Focus Share guest graph payloads for the 3D scene stack.
 */
import {
  filterGraphLayoutTopologyRelationships,
  resolveTreeLayoutPreferences,
  relationshipTypes,
  type FocusShareGuestPerson,
  type FocusShareGuestRelationship,
  type PersonRecord,
  type RelationshipRecord,
  type RelationshipType,
  type ResolvedTreeLayoutPreferences
} from "@treemich/shared";
import { buildMergedParentGroups, buildVisibleRelationshipLines } from "../graph/graphRelationshipLines";
import { buildParentChildIndex } from "../graph/layout";
import { positionPeople } from "../graph/layout/positionPeople";
import type { NodePosition } from "../graph/layout";
import {
  relationshipFilterForType,
  relationshipKindForType,
  relationshipStyleByKind,
  type GraphFilterVisibility
} from "../graph/relationshipStyles";
const relationshipTypeSet = new Set<string>(relationshipTypes);
const isRelationshipType = (value: string): value is RelationshipType => relationshipTypeSet.has(value);
const DEFAULT_FILTER_VISIBILITY = {
  parentChild: true,
  spouse: true,
  sibling: true,
  friends: true,
  pets: true
} as const satisfies GraphFilterVisibility;
export type GuestDisplayPerson = {
  person: PersonRecord;
  displayPosition: NodePosition;
};
export type GuestPeopleViewFilter = "all" | "immich-linked" | "immich-unlinked";
export type GuestFocusGeometry = {
  displayVisiblePeople: GuestDisplayPerson[];
  visiblePositionsById: Map<string, NodePosition>;
  graphBounds: { min: NodePosition; max: NodePosition } | null;
  membershipRelationships: RelationshipRecord[];
  primaryFamilyUnitByPersonId: Record<string, string>;
  relationshipStyleByKind: typeof relationshipStyleByKind;
};
export const toGuestPersonRecord = (person: FocusShareGuestPerson): PersonRecord => ({
  id: person.id,
  name: person.name,
  displayName: person.name,
  profile: {
    id: person.id,
    gender: "UNKNOWN",
    givenName: person.givenName,
    surname: person.surname
  },
  thumbnailPath: person.hasThumbnail ? "guest" : null
});
export const toGuestRelationshipRecords = (
  relationships: FocusShareGuestRelationship[]
): RelationshipRecord[] =>
  relationships
    .filter((edge) => isRelationshipType(edge.type))
    .map((edge) => ({
      id: edge.id,
      fromPersonId: edge.fromPersonId,
      toPersonId: edge.toPersonId,
      type: edge.type as RelationshipType
    }));
export const filterGuestPeople = (
  people: FocusShareGuestPerson[],
  peopleViewFilter: GuestPeopleViewFilter
): FocusShareGuestPerson[] => {
  if (peopleViewFilter === "immich-linked") {
    return people.filter((person) => person.hasImmichLink);
  }
  if (peopleViewFilter === "immich-unlinked") {
    return people.filter((person) => !person.hasImmichLink);
  }
  return people;
};
export const filterGuestRelationshipsByVisibility = (
  relationships: RelationshipRecord[],
  filterVisibility: GraphFilterVisibility
): RelationshipRecord[] =>
  relationships.filter((edge) => filterVisibility[relationshipFilterForType(edge.type)]);
/** Node positions + bounds — independent of relationship-layer checkboxes. */
export const layoutGuestFocusGeometry = (
  people: FocusShareGuestPerson[],
  relationships: FocusShareGuestRelationship[],
  options?: {
    treeLayoutPreferences?: Partial<ResolvedTreeLayoutPreferences>;
    peopleViewFilter?: GuestPeopleViewFilter;
    primaryFamilyUnitByPersonId?: Record<string, string>;
  }
): GuestFocusGeometry => {
  const visiblePeople = filterGuestPeople(people, options?.peopleViewFilter ?? "all");
  const visiblePeopleIds = new Set(visiblePeople.map((person) => person.id));
  const membershipRelationships = toGuestRelationshipRecords(relationships).filter(
    (edge) => visiblePeopleIds.has(edge.fromPersonId) && visiblePeopleIds.has(edge.toPersonId)
  );
  // Match owner PeopleGraph3D: layout uses parent/child/spouse topology always;
  // checkbox filters only affect which edges are drawn.
  const topologyRelationships = filterGraphLayoutTopologyRelationships(membershipRelationships);
  const treeLayoutPreferences = resolveTreeLayoutPreferences(options?.treeLayoutPreferences);
  const primaryFamilyUnitByPersonId = options?.primaryFamilyUnitByPersonId ?? {};
  // Same positioning entry point as owner local layout (positionPeople → generation tree).
  const positioned = positionPeople(
    visiblePeople.map((person) => toGuestPersonRecord(person)),
    topologyRelationships,
    {
      mode: "family",
      treeLayoutPreferences,
      primaryFamilyUnitByPersonId
    }
  );
  const positionById = new Map(positioned.map((item) => [item.person.id, item.position]));
  const displayVisiblePeople: GuestDisplayPerson[] = visiblePeople.map((person) => ({
    person: toGuestPersonRecord(person),
    displayPosition: positionById.get(person.id) ?? [0, 0, 0]
  }));
  const visiblePositionsById = new Map(
    displayVisiblePeople.map((item) => [item.person.id, item.displayPosition])
  );
  let graphBounds: { min: NodePosition; max: NodePosition } | null = null;
  if (displayVisiblePeople.length > 0) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const { displayPosition } of displayVisiblePeople) {
      minX = Math.min(minX, displayPosition[0]);
      minY = Math.min(minY, displayPosition[1]);
      minZ = Math.min(minZ, displayPosition[2]);
      maxX = Math.max(maxX, displayPosition[0]);
      maxY = Math.max(maxY, displayPosition[1]);
      maxZ = Math.max(maxZ, displayPosition[2]);
    }
    graphBounds = {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ]
    };
  }
  return {
    displayVisiblePeople,
    visiblePositionsById,
    graphBounds,
    membershipRelationships,
    primaryFamilyUnitByPersonId,
    relationshipStyleByKind
  };
};
export const buildGuestVisibleRelationshipLines = (
  geometry: GuestFocusGeometry,
  filterVisibility: GraphFilterVisibility = DEFAULT_FILTER_VISIBILITY
) => {
  const filteredRelationships = filterGuestRelationshipsByVisibility(
    geometry.membershipRelationships,
    filterVisibility
  );
  const visibleIdSet = new Set(geometry.visiblePositionsById.keys());
  // Match owner edge routing: merge two-parent families into shared trunks.
  const { parentsByChild } = buildParentChildIndex(filteredRelationships);
  const mergedParentGroups = buildMergedParentGroups({
    parentsByChild,
    visibleIdSet,
    primaryFamilyUnitByPersonId: geometry.primaryFamilyUnitByPersonId
  });
  return buildVisibleRelationshipLines({
    viewMode: "family",
    photoEdges: [],
    visiblePositionsById: geometry.visiblePositionsById,
    mergedParentGroups,
    filteredRelationships,
    visibleIdSet
  });
};
export const layoutGuestFocusGraph = (
  people: FocusShareGuestPerson[],
  relationships: FocusShareGuestRelationship[],
  options?: {
    treeLayoutPreferences?: Partial<ResolvedTreeLayoutPreferences>;
    filterVisibility?: GraphFilterVisibility;
    peopleViewFilter?: GuestPeopleViewFilter;
    primaryFamilyUnitByPersonId?: Record<string, string>;
  }
): {
  displayVisiblePeople: GuestDisplayPerson[];
  visiblePositionsById: Map<string, NodePosition>;
  graphBounds: { min: NodePosition; max: NodePosition } | null;
  relationshipRecords: RelationshipRecord[];
  visibleRelationshipLines: ReturnType<typeof buildVisibleRelationshipLines>;
  relationshipStyleByKind: typeof relationshipStyleByKind;
} => {
  const filterVisibility = options?.filterVisibility ?? DEFAULT_FILTER_VISIBILITY;
  const geometry = layoutGuestFocusGeometry(people, relationships, {
    treeLayoutPreferences: options?.treeLayoutPreferences,
    peopleViewFilter: options?.peopleViewFilter,
    primaryFamilyUnitByPersonId: options?.primaryFamilyUnitByPersonId
  });
  const filteredRelationships = filterGuestRelationshipsByVisibility(
    geometry.membershipRelationships,
    filterVisibility
  );
  return {
    displayVisiblePeople: geometry.displayVisiblePeople,
    visiblePositionsById: geometry.visiblePositionsById,
    graphBounds: geometry.graphBounds,
    relationshipRecords: filteredRelationships,
    visibleRelationshipLines: buildGuestVisibleRelationshipLines(geometry, filterVisibility),
    relationshipStyleByKind: geometry.relationshipStyleByKind
  };
};
/** Keep relationshipStyleByKind / kind helper available for tests without importing graph internals twice. */
export { relationshipKindForType, relationshipStyleByKind };
