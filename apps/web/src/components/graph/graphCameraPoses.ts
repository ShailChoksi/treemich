import type { NodePosition } from "./layout";

/** Default look-from offset used when there is no current orbit to preserve. */
export const DEFAULT_FOCUS_CAMERA_OFFSET: NodePosition = [0, 3.8, 7.4];

const MIN_OFFSET_LENGTH_SQ = 0.0001;

/**
 * Focus pose for a person node.
 * When a current camera/target is provided, keeps the same relative orbit
 * (distance + viewing angle) and only retargets — so selecting another person
 * does not snap back to the default rotational perspective.
 */
export const getFocusCameraPose = (
  target: NodePosition,
  currentCameraPosition?: NodePosition | null,
  currentTarget?: NodePosition | null
): { position: NodePosition; target: NodePosition } => {
  let offset: NodePosition = DEFAULT_FOCUS_CAMERA_OFFSET;

  if (currentCameraPosition && currentTarget) {
    const preserved: NodePosition = [
      currentCameraPosition[0] - currentTarget[0],
      currentCameraPosition[1] - currentTarget[1],
      currentCameraPosition[2] - currentTarget[2]
    ];
    const lengthSq = preserved[0] ** 2 + preserved[1] ** 2 + preserved[2] ** 2;
    if (lengthSq >= MIN_OFFSET_LENGTH_SQ) {
      offset = preserved;
    }
  }

  return {
    position: [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]],
    target
  };
};
