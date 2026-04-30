import type { Person, RelationshipRecord, RelationshipType, UserPreferences } from "../lib/api";
import type { GraphUiSnapshot } from "../lib/workspaceUiState";

/** Positional and identity inputs for the 3D graph (changes with people/layout/selection). */
export type PeopleGraph3DModelBundle = {
  people: Person[];
  relationships: RelationshipRecord[];
  serverPositionsByPersonId?: Record<string, [number, number, number]>;
  serverLayoutRevision: string | null;
  serverLayoutAlgorithmVersion: string | null;
  selectedPersonId: string | null;
};

/** Loading, errors, focus requests, and tree-validation chrome for the graph surface. */
export type PeopleGraph3DStatusBundle = {
  status: string | null;
  isLoading: boolean;
  isSavingRelationship: boolean;
  loadError: string | null;
  layoutError: string | null;
  focusPersonRequest: string | null;
  cameraFocusPersonRequest: string | null;
  treeValidationIssueCount: number | null;
  treeValidationEngineDisabled: boolean;
};

/** Saved prefs and default graph filter state. */
export type PeopleGraph3DPreferencesBundle = {
  savedPreferences: UserPreferences | null;
  defaultToNoRelationshipsGraphState: boolean;
  noRelationshipsGraphFilterVisibility: NonNullable<UserPreferences["graphFilterVisibility"]>;
};

/** Callbacks — keep references stable (provider `useCallback` + parent `useMemo`) so `PeopleGraph3D` memo wins. */
export type PeopleGraph3DHandlersBundle = {
  onFocusPersonConsumed: () => void;
  onCameraFocusPersonConsumed: () => void;
  onSelectedPersonChange?: (personId: string | null) => void;
  onCreateRelationship: (
    sourcePersonId: string,
    targetPersonId: string,
    relationshipType: RelationshipType
  ) => Promise<void>;
  onNewPerson?: () => void;
  onPreferencesChange: (prefs: Partial<UserPreferences>) => Promise<boolean>;
  onRetryGraphLoad?: () => void;
  onRetryLayout?: () => void;
};

/** Workspace / canvas wiring separate from domain data. */
export type PeopleGraph3DViewStateBundle = {
  graphKeyboardEnabled?: boolean;
  layoutResizeSignal?: number;
  initialUiState?: GraphUiSnapshot;
  onUiStateChange?: (next: GraphUiSnapshot) => void;
  isVisible?: boolean;
};

export type PeopleGraph3DBundledProps = {
  graphModel: PeopleGraph3DModelBundle;
  graphStatus: PeopleGraph3DStatusBundle;
  graphPreferences: PeopleGraph3DPreferencesBundle;
  graphHandlers: PeopleGraph3DHandlersBundle;
  graphViewState: PeopleGraph3DViewStateBundle;
};
