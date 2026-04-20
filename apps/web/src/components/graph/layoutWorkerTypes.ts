import type { ImmichPerson, PhotoCluster, RelationshipRecord } from "../../lib/api";
import type { FamilyViewStyle, GraphLayoutMode, NodePosition } from "./layout";

export type LayoutWorkerPayload = {
  people: ImmichPerson[];
  relationships: RelationshipRecord[];
  options?: {
    mode?: GraphLayoutMode;
    photoClusters?: PhotoCluster[];
    familyViewStyle?: FamilyViewStyle;
    selectedPersonId?: string | null;
    primaryFamilyUnitByPersonId?: Record<string, string>;
  };
};

export type LayoutWorkerPosition = {
  personId: string;
  position: NodePosition;
};

export type LayoutWorkerRequest = {
  id: number;
  payload: LayoutWorkerPayload;
};

export type LayoutWorkerResponse =
  | {
      id: number;
      positions: LayoutWorkerPosition[];
    }
  | {
      id: number;
      error: string;
    };
