/**
 * @file Graph layout facade: family tree vs photo layout selection and exports.
 */

export type {
  DirectionalNeighborBuckets,
  FamilyViewStyle,
  GraphLayoutMode,
  NodePosition
} from "./layout/types";
export { defaultFamilyViewStyle } from "./layout/types";
export {
  buildDirectionalNeighborBuckets,
  buildParentChildIndex,
  distanceSquared,
  getLastNameKey,
  hashToNumber,
  inverseRelationshipType,
  subtractPosition
} from "./layout/graphPrimitives";
export { positionPeople } from "./layout/positionPeople";
