/**
 * @file Message types exchanged with the layout Web Worker.
 */

import type { Person, PhotoCluster, RelationshipRecord, TreeLayoutPreferences } from "../../lib/api";
import type { GraphLayoutMode, NodePosition } from "./layout";

export type LayoutWorkerPayload = {
  people: Person[];
  relationships: RelationshipRecord[];
  options?: {
    mode?: GraphLayoutMode;
    photoClusters?: PhotoCluster[];
    primaryFamilyUnitByPersonId?: Record<string, string>;
    treeLayoutPreferences?: TreeLayoutPreferences;
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
