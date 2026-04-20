export type NodePosition = [number, number, number];
export type GraphLayoutMode = "family" | "photo";
export type FamilyViewStyle = "generationTree";
export const defaultFamilyViewStyle: FamilyViewStyle = "generationTree";
export type DirectionalNeighborBuckets = {
  up: string[];
  down: string[];
  side: string[];
};
