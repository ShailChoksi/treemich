import type { NodePosition } from "./layout";

export const getFocusCameraPose = (
  target: NodePosition
): { position: NodePosition; target: NodePosition } => ({
  position: [target[0], target[1] + 3.8, target[2] + 7.4],
  target
});
