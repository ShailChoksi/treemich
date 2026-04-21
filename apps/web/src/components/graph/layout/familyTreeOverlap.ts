import type { NodePosition } from "./types";

type ComponentBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

const computeComponentBounds = (
  component: string[],
  positions: Map<string, NodePosition>
): ComponentBounds => {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const personId of component) {
    const position = positions.get(personId);
    if (!position) {
      continue;
    }
    minX = Math.min(minX, position[0]);
    maxX = Math.max(maxX, position[0]);
    minZ = Math.min(minZ, position[2]);
    maxZ = Math.max(maxZ, position[2]);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  }

  return { minX, maxX, minZ, maxZ };
};

export const separateOverlappingComponents = (
  components: string[][],
  positions: Map<string, NodePosition>
) => {
  if (components.length < 2) {
    return;
  }

  const paddingX = 3.6;
  const paddingZ = 4.4;
  const boundsArray: ComponentBounds[] = components.map((component) =>
    computeComponentBounds(component, positions)
  );
  const maxPasses = Math.min(24, components.length + 4);

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    for (let firstIndex = 0; firstIndex < components.length; firstIndex += 1) {
      const firstBounds = boundsArray[firstIndex];
      if (!firstBounds) {
        continue;
      }
      for (let secondIndex = firstIndex + 1; secondIndex < components.length; secondIndex += 1) {
        const secondBounds = boundsArray[secondIndex];
        if (!secondBounds) {
          continue;
        }

        const overlapsX =
          firstBounds.minX - paddingX < secondBounds.maxX && secondBounds.minX < firstBounds.maxX + paddingX;
        const overlapsZ =
          firstBounds.minZ - paddingZ < secondBounds.maxZ && secondBounds.minZ < firstBounds.maxZ + paddingZ;
        if (!overlapsX || !overlapsZ) {
          continue;
        }

        const firstCenterX = (firstBounds.minX + firstBounds.maxX) / 2;
        const secondCenterX = (secondBounds.minX + secondBounds.maxX) / 2;
        const firstCenterZ = (firstBounds.minZ + firstBounds.maxZ) / 2;
        const secondCenterZ = (secondBounds.minZ + secondBounds.maxZ) / 2;

        const shiftRight = firstBounds.maxX + paddingX - (secondBounds.minX - paddingX);
        const shiftLeft = secondBounds.maxX + paddingX - (firstBounds.minX - paddingX);
        const shiftForward = firstBounds.maxZ + paddingZ - (secondBounds.minZ - paddingZ);
        const shiftBackward = secondBounds.maxZ + paddingZ - (firstBounds.minZ - paddingZ);

        const shiftX = secondCenterX >= firstCenterX ? Math.max(0, shiftRight) : -Math.max(0, shiftLeft);
        const shiftZ =
          secondCenterZ >= firstCenterZ ? Math.max(0, shiftForward) : -Math.max(0, shiftBackward);

        const preferX =
          Math.abs(shiftX) <= Math.abs(shiftZ) ||
          Math.abs(secondCenterX - firstCenterX) < Math.abs(secondCenterZ - firstCenterZ) * 0.8;
        const appliedShiftX = preferX ? shiftX : 0;
        const appliedShiftZ = preferX ? 0 : shiftZ;

        if (appliedShiftX === 0 && appliedShiftZ === 0) {
          continue;
        }

        const secondComponent = components[secondIndex] ?? [];
        for (const personId of secondComponent) {
          const position = positions.get(personId);
          if (!position) {
            continue;
          }
          positions.set(personId, [position[0] + appliedShiftX, position[1], position[2] + appliedShiftZ]);
        }
        boundsArray[secondIndex] = {
          minX: secondBounds.minX + appliedShiftX,
          maxX: secondBounds.maxX + appliedShiftX,
          minZ: secondBounds.minZ + appliedShiftZ,
          maxZ: secondBounds.maxZ + appliedShiftZ
        };
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }
};
