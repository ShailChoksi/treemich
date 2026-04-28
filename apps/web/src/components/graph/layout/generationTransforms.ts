/**
 * @file Family-tree layout math: generationTransforms.
 */

import type { Person } from "../../../lib/api";
import type { NodePosition } from "./types";

export type PositionedPerson = { person: Person; position: NodePosition };

const staircaseStep = {
  x: 0.9,
  y: -0.32,
  z: 1.05
} as const;

export const buildStaircaseOffsetsById = (items: PositionedPerson[]) => {
  const roundedLevels = [...new Set(items.map((item) => item.position[1].toFixed(3)))]
    .map((value) => Number.parseFloat(value))
    .sort((left, right) => right - left);
  const levelIndexByY = new Map<number, number>();
  roundedLevels.forEach((level, index) => levelIndexByY.set(level, index));

  const offsetsById = new Map<string, NodePosition>();
  items.forEach((item) => {
    const roundedY = Number.parseFloat(item.position[1].toFixed(3));
    const depthIndex = levelIndexByY.get(roundedY) ?? 0;
    offsetsById.set(item.person.id, [
      depthIndex * staircaseStep.x,
      depthIndex * staircaseStep.y,
      depthIndex * staircaseStep.z
    ]);
  });
  return offsetsById;
};

export const applyStaircaseOffsets = (
  items: PositionedPerson[],
  offsetsById: Map<string, NodePosition>,
  scale = 1
): PositionedPerson[] =>
  items.map((item) => {
    const offset = offsetsById.get(item.person.id) ?? [0, 0, 0];
    return {
      person: item.person,
      position: [
        item.position[0] + offset[0] * scale,
        item.position[1] + offset[1] * scale,
        item.position[2] + offset[2] * scale
      ]
    };
  });

export const toGenerationTreePositions = (items: PositionedPerson[]): PositionedPerson[] => {
  if (items.length === 0) {
    return items;
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    minX = Math.min(minX, item.position[0]);
    maxX = Math.max(maxX, item.position[0]);
    minZ = Math.min(minZ, item.position[2]);
    maxZ = Math.max(maxZ, item.position[2]);
  }
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  return items.map((item) => ({
    person: item.person,
    position: [
      (item.position[0] - centerX) * 1.12,
      item.position[1] * 1.35,
      (item.position[2] - centerZ) * 1.1
    ] as NodePosition
  }));
};
