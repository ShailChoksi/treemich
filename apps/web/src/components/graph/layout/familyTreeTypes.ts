/**
 * @file Family-tree layout math: familyTreeTypes.
 */

export type SpousePair = { firstPersonId: string; secondPersonId: string };
export type SiblingPair = { firstPersonId: string; secondPersonId: string };
export type ParentChildEdge = { parentId: string; childId: string };
