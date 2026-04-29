/**
 * @file Family-tree layout math: photoLayout.
 */

import type { Person, PhotoCluster } from "../../../lib/api";
import type { NodePosition } from "./types";

export const positionPeopleByPhotoClusters = (
  people: Person[],
  photoClusters: PhotoCluster[]
): Array<{
  person: Person;
  position: NodePosition;
}> => {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const consumed = new Set<string>();
  const resolvedClusters = photoClusters
    .map((cluster) => {
      const members = cluster.personIds
        .map((personId) => peopleById.get(personId))
        .filter((person): person is Person => !!person);
      members.forEach((member) => consumed.add(member.id));
      return {
        id: cluster.id,
        members
      };
    })
    .filter((cluster) => cluster.members.length > 0);

  // Ensure every visible person has a cluster, even if API returned no cluster info for them.
  const unclustered = people.filter((person) => !consumed.has(person.id));
  const allClusters = [
    ...resolvedClusters,
    ...unclustered.map((person) => ({
      id: `cluster:${person.id}`,
      members: [person]
    }))
  ].sort((left, right) => right.members.length - left.members.length || left.id.localeCompare(right.id));

  const columnCount = Math.max(1, Math.ceil(Math.sqrt(allClusters.length)));
  const rowCount = Math.max(1, Math.ceil(allClusters.length / columnCount));
  const clusterGapX = 14;
  const clusterGapZ = 12;
  const totalSpanX = Math.max(0, (columnCount - 1) * clusterGapX);
  const totalSpanZ = Math.max(0, (rowCount - 1) * clusterGapZ);

  return allClusters.flatMap((cluster, index) => {
    const row = Math.floor(index / columnCount);
    const col = index % columnCount;
    const centerX = col * clusterGapX - totalSpanX / 2;
    const centerZ = row * clusterGapZ - totalSpanZ / 2;
    const centerY = ((index % 4) - 1.5) * 0.8;

    return cluster.members.map((person, memberIndex) => {
      const ringSize = Math.max(6, cluster.members.length);
      const localAngle = (memberIndex / ringSize) * Math.PI * 2;
      const localRadius = 1.8 + Math.floor(memberIndex / ringSize) * 0.9;
      return {
        person,
        position: [
          centerX + Math.cos(localAngle) * localRadius,
          centerY + (memberIndex % 3) * 0.25,
          centerZ + Math.sin(localAngle) * localRadius
        ] as NodePosition
      };
    });
  });
};
