/**
 * @file Three.js relationship graph, overlays, search, and server layout integration.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PerspectiveCamera, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  searchRelationships,
  type ImmichPerson,
  type RelationshipRecord,
  type RelationshipType,
  type UserPreferences
} from "../lib/api";
import { AddRelativePopup } from "./graph/AddRelativePopup";
import { findPersonBySearchTerm, useGraphSearch } from "./graph/useGraphSearch";
import { useGraphCamera } from "./graph/useGraphCamera";
import { useGraphSelection } from "./graph/useGraphSelection";
import { GraphCanvasScene } from "./graph/GraphCanvasScene";
import { GraphSearchOverlay } from "./graph/GraphSearchOverlay";
import type { AddRelativeSlot } from "./graph/NodeActionButtons";
import {
  defaultGraphFilterVisibility,
  relationshipStyleByKind,
  type GraphFilter
} from "./graph/relationshipStyles";
import { useGraphLayoutState } from "./graph/useGraphLayoutState";
import { useGraphCameraControls } from "./graph/useGraphCameraControls";
import { GraphSurfaceOverlays } from "./graph/GraphSurfaceOverlays";
import { GraphFooterStatus } from "./graph/GraphFooterStatus";
import { ErrorBoundary } from "./ErrorBoundary";
import { GraphLayerControls } from "./graph/GraphLayerControls";
import { useGraphKeyboardNavigation } from "./graph/useGraphKeyboardNavigation";
import { getPersonDisplayLabel } from "../lib/personDisplay";

type Props = {
  people: ImmichPerson[];
  relationships: RelationshipRecord[];
  serverPositionsByPersonId?: Record<string, [number, number, number]>;
  serverLayoutRevision?: string | null;
  serverLayoutAlgorithmVersion?: string | null;
  selectedPersonId: string | null;
  status: string | null;
  isLoading: boolean;
  isSavingRelationship: boolean;
  loadError: string | null;
  focusPersonRequest: string | null;
  cameraFocusPersonRequest: string | null;
  defaultToNoRelationshipsGraphState: boolean;
  noRelationshipsGraphFilterVisibility: NonNullable<UserPreferences["graphFilterVisibility"]>;
  savedPreferences: UserPreferences | null;
  treeValidationIssueCount: number | null;
  treeValidationEngineDisabled: boolean;
  onFocusPersonConsumed: () => void;
  onCameraFocusPersonConsumed: () => void;
  onSelectedPersonChange?: (personId: string | null) => void;
  onCreateRelationship: (
    sourcePersonId: string,
    targetPersonId: string,
    relationshipType: RelationshipType
  ) => Promise<void>;
  onPreferencesChange: (prefs: Partial<UserPreferences>) => void;
};

const DEFAULT_RENDER_LIMIT = 120;
const EMPTY_PHOTO_EDGES: [] = [];
const EMPTY_PHOTO_CLUSTERS: [] = [];

type AddRelativeIntent = {
  slot: AddRelativeSlot;
  selectedPersonId: string;
};

type GraphViewPreferencesState = {
  filterVisibility: NonNullable<UserPreferences["graphFilterVisibility"]>;
  showSingleFamilyTree: boolean;
};

const resolveInitialGraphViewPreferences = (
  savedPreferences: UserPreferences | null,
  defaultToNoRelationshipsGraphState: boolean,
  noRelationshipsGraphFilterVisibility: NonNullable<UserPreferences["graphFilterVisibility"]>
): GraphViewPreferencesState => ({
  filterVisibility:
    savedPreferences?.graphFilterVisibility ??
    (defaultToNoRelationshipsGraphState
      ? noRelationshipsGraphFilterVisibility
      : defaultGraphFilterVisibility),
  showSingleFamilyTree: savedPreferences?.showSingleFamilyTree ?? false
});

/**
 * Interactive 3D graph: Immich people, Treemich relationships, layout worker, search, and chrome controls.
 * Exported as memo-wrapped `PeopleGraph3D`.
 */
const PeopleGraph3DComponent = ({
  people,
  relationships,
  serverPositionsByPersonId,
  serverLayoutRevision,
  serverLayoutAlgorithmVersion,
  selectedPersonId: parentSelectedPersonId,
  status,
  isLoading,
  isSavingRelationship,
  loadError,
  focusPersonRequest,
  cameraFocusPersonRequest,
  defaultToNoRelationshipsGraphState,
  noRelationshipsGraphFilterVisibility,
  savedPreferences,
  treeValidationIssueCount,
  treeValidationEngineDisabled,
  onFocusPersonConsumed,
  onCameraFocusPersonConsumed,
  onSelectedPersonChange,
  onCreateRelationship,
  onPreferencesChange
}: Props) => {
  const [hoveredPersonId, setHoveredPersonId] = useState<string | null>(null);
  const [focusPersonId, setFocusPersonId] = useState<string | null>(null);
  const [pinnedPersonId, setPinnedPersonId] = useState<string | null>(null);
  const [addRelativeIntent, setAddRelativeIntent] = useState<AddRelativeIntent | null>(null);
  const [graphViewPreferences, setGraphViewPreferences] = useState<GraphViewPreferencesState>(() =>
    resolveInitialGraphViewPreferences(
      savedPreferences ?? null,
      defaultToNoRelationshipsGraphState,
      noRelationshipsGraphFilterVisibility
    )
  );
  const { filterVisibility, showSingleFamilyTree } = graphViewPreferences;
  const [singleFamilyTreeAnchorId, setSingleFamilyTreeAnchorId] = useState<string | null>(null);
  const [cameraPositionForCulling, setCameraPositionForCulling] = useState<[number, number, number]>([
    0, 2, 18
  ]);
  const prefsAppliedRef = useRef(false);
  const lastCameraSampleRef = useRef(new Vector3(0, 2, 18));
  const hasInitializedCameraRef = useRef(false);
  const hasHandledInitialCameraFocusRef = useRef(false);
  const lastAutoCenteredFocusPersonIdRef = useRef<string | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const orbitControlsRef = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    if (!savedPreferences || prefsAppliedRef.current) {
      return;
    }
    prefsAppliedRef.current = true;
    setGraphViewPreferences(
      resolveInitialGraphViewPreferences(
        savedPreferences,
        defaultToNoRelationshipsGraphState,
        noRelationshipsGraphFilterVisibility
      )
    );
  }, [defaultToNoRelationshipsGraphState, noRelationshipsGraphFilterVisibility, savedPreferences]);

  const { selectedPersonId, setSelectedPersonId, clearSelection, handleNodeClick } = useGraphSelection({
    selectedPersonId: parentSelectedPersonId,
    setFocusPersonId,
    setPinnedPersonId,
    onSelectedPersonChange
  });
  const {
    peopleById,
    selectedPerson,
    prioritizedNodeIds,
    visiblePositionsById,
    graphBounds,
    renderVisiblePeople,
    renderVisibleRelationshipLines,
    renderVisibilityBucketByPersonId,
    renderNearPersonIds,
    isWorkerLayoutPending
  } = useGraphLayoutState({
    people,
    relationships,
    photoEdges: EMPTY_PHOTO_EDGES,
    photoClusters: EMPTY_PHOTO_CLUSTERS,
    viewMode: "family",
    primaryFamilyUnitByPersonId: savedPreferences?.primaryFamilyUnitByPersonId,
    showSingleFamilyTree,
    singleFamilyTreeAnchorId,
    filterVisibility,
    selectedPersonId,
    hoveredPersonId,
    focusPersonId,
    pinnedPersonId,
    cameraPosition: cameraPositionForCulling,
    serverPositionsByPersonId,
    serverLayoutRevision,
    serverLayoutAlgorithmVersion,
    renderLimit: DEFAULT_RENDER_LIMIT
  });
  const peopleIds = useMemo(() => people.map((person) => person.id), [people]);

  const handleSearchFallback = useCallback(async (query: string) => {
    const response = await searchRelationships(query);
    const allMatches = response.matches ?? [];
    if (allMatches.length === 0) {
      return null;
    }

    const names = allMatches.map((match) => match.person.name);
    const feedback = `Found ${allMatches.length} result${allMatches.length === 1 ? "" : "s"}: ${names.join(", ")}`;
    return {
      matches: allMatches.map((match) => ({ personId: match.person.id, personName: match.person.name })),
      feedback: response.message ?? feedback
    };
  }, []);

  const {
    searchTerm,
    setSearchTerm,
    searchFeedback,
    setSearchFeedback,
    highlightedPersonIds,
    clearHighlights,
    handleSearchSubmit
  } = useGraphSearch({
    people,
    focusPersonRequest,
    clearFocusPersonRequest: onFocusPersonConsumed,
    setSelectedPersonId,
    setFocusPersonId,
    setPinnedPersonId,
    setHoveredPersonId,
    onSearchFallback: handleSearchFallback
  });
  const { frameAllNodes, focusPersonById, focusActiveNode, topDownView, nudgeCamera } =
    useGraphCameraControls({
      graphBounds,
      visiblePositionsById,
      selectedPersonId,
      hoveredPersonId,
      focusPersonId,
      pinnedPersonId,
      cameraRef,
      orbitControlsRef,
      lastCameraSampleRef
    });

  useGraphCamera({ frameAllNodes, focusActiveNode, topDownView });
  useGraphKeyboardNavigation({
    enabled: !addRelativeIntent,
    selectedPersonId,
    relationships,
    visiblePositionsById,
    peopleById,
    setSelectedPersonId,
    setFocusPersonId,
    setPinnedPersonId,
    nudgeCamera
  });

  useEffect(() => {
    if (!showSingleFamilyTree) {
      setSingleFamilyTreeAnchorId(null);
      return;
    }
    if (selectedPersonId) {
      setSingleFamilyTreeAnchorId(selectedPersonId);
    }
  }, [selectedPersonId, showSingleFamilyTree]);

  useEffect(() => {
    if (!focusPersonId) {
      lastAutoCenteredFocusPersonIdRef.current = null;
      return;
    }
    if (focusPersonId === lastAutoCenteredFocusPersonIdRef.current) {
      return;
    }
    if (!visiblePositionsById.has(focusPersonId)) {
      return;
    }
    focusPersonById(focusPersonId);
    lastAutoCenteredFocusPersonIdRef.current = focusPersonId;
  }, [focusPersonById, focusPersonId, visiblePositionsById]);

  useEffect(() => {
    if (hasInitializedCameraRef.current) {
      return;
    }

    if (cameraFocusPersonRequest && visiblePositionsById.has(cameraFocusPersonRequest)) {
      setFocusPersonId(cameraFocusPersonRequest);
      focusPersonById(cameraFocusPersonRequest);
      hasHandledInitialCameraFocusRef.current = true;
      onCameraFocusPersonConsumed();
    } else {
      frameAllNodes();
    }
    hasInitializedCameraRef.current = true;
  }, [
    cameraFocusPersonRequest,
    focusPersonById,
    frameAllNodes,
    onCameraFocusPersonConsumed,
    visiblePositionsById
  ]);

  useEffect(() => {
    if (!cameraFocusPersonRequest || hasHandledInitialCameraFocusRef.current) {
      return;
    }
    if (!visiblePositionsById.has(cameraFocusPersonRequest)) {
      return;
    }
    setFocusPersonId(cameraFocusPersonRequest);
    focusPersonById(cameraFocusPersonRequest);
    hasHandledInitialCameraFocusRef.current = true;
    onCameraFocusPersonConsumed();
  }, [cameraFocusPersonRequest, focusPersonById, onCameraFocusPersonConsumed, visiblePositionsById]);

  useEffect(() => {
    if (selectedPersonId) {
      return;
    }
    setAddRelativeIntent(null);
  }, [selectedPersonId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (addRelativeIntent) {
        setAddRelativeIntent(null);
        return;
      }
      clearSelection();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addRelativeIntent, clearSelection]);

  const handleCanvasMissed = useCallback(() => {
    if (addRelativeIntent) {
      return;
    }
    clearSelection();
    clearHighlights();
    setHoveredPersonId(null);
  }, [addRelativeIntent, clearHighlights, clearSelection]);

  const handlePersonNodeClick = useCallback(
    (clickedPersonId: string) => {
      handleNodeClick(clickedPersonId);
      focusPersonById(clickedPersonId);
    },
    [focusPersonById, handleNodeClick]
  );

  const handleOpenAddRelative = (slot: AddRelativeSlot) => {
    if (!selectedPersonId) {
      return;
    }
    setAddRelativeIntent({
      slot,
      selectedPersonId
    });
  };

  const handleAddRelative = async (personName: string, relationshipType?: RelationshipType) => {
    if (!addRelativeIntent) {
      throw new Error("Select a person first.");
    }

    const match = findPersonBySearchTerm(people, personName);
    if (!personName.trim()) {
      throw new Error("Type a person name.");
    }
    if (!match) {
      throw new Error(`No person found for "${personName}"`);
    }
    if (match.id === addRelativeIntent.selectedPersonId) {
      throw new Error("Choose a different person.");
    }

    let nextRelationshipType: RelationshipType;
    if (addRelativeIntent.slot === "parent") {
      nextRelationshipType = "CHILD_OF";
    } else if (addRelativeIntent.slot === "child") {
      nextRelationshipType = "PARENT_OF";
    } else {
      nextRelationshipType = relationshipType ?? "SIBLING_OF";
    }

    await onCreateRelationship(addRelativeIntent.selectedPersonId, match.id, nextRelationshipType);
    setAddRelativeIntent(null);
    setSearchFeedback(`Added ${match.name}`);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    setSearchFeedback(null);
    clearHighlights();
  };

  const handleToggleFilter = (filter: GraphFilter) => {
    setGraphViewPreferences((current) => {
      const next = {
        ...current,
        filterVisibility: { ...current.filterVisibility, [filter]: !current.filterVisibility[filter] }
      };
      onPreferencesChange({
        graphFilterVisibility: next.filterVisibility,
        showSingleFamilyTree: next.showSingleFamilyTree
      });
      return next;
    });
  };

  const handleShowSingleFamilyTreeChange = (next: boolean) => {
    setGraphViewPreferences((current) => {
      const nextPreferences = { ...current, showSingleFamilyTree: next };
      onPreferencesChange({
        showSingleFamilyTree: nextPreferences.showSingleFamilyTree,
        graphFilterVisibility: nextPreferences.filterVisibility
      });
      return nextPreferences;
    });
    if (next) {
      setSingleFamilyTreeAnchorId(selectedPersonId);
    } else {
      setSingleFamilyTreeAnchorId(null);
    }
  };

  const peopleForSearchList = useMemo(
    () => people.map((p) => ({ id: p.id, name: getPersonDisplayLabel(p) })),
    [people]
  );

  return (
    <section className="card graph-card">
      <div className="graph-surface">
        <GraphSearchOverlay
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          onSearchSubmit={handleSearchSubmit}
          onClearSearch={handleClearSearch}
          onCenterView={frameAllNodes}
          people={peopleForSearchList}
          searchFeedback={searchFeedback}
          treeValidationIssueCount={treeValidationIssueCount}
          treeValidationEngineDisabled={treeValidationEngineDisabled}
          searchIncludeAlternateNames={savedPreferences?.searchIncludeAlternateNames === true}
          onSearchIncludeAlternateNamesChange={(next) =>
            onPreferencesChange({ searchIncludeAlternateNames: next })
          }
        />
        <GraphLayerControls
          filterVisibility={filterVisibility}
          onToggleFilter={handleToggleFilter}
          showSingleFamilyTree={showSingleFamilyTree}
          onShowSingleFamilyTreeChange={handleShowSingleFamilyTreeChange}
        />
        <GraphSurfaceOverlays
          isLoading={isLoading}
          loadError={loadError}
          isLayoutWorkerPending={isWorkerLayoutPending}
        />
        {addRelativeIntent && selectedPerson ? (
          <AddRelativePopup
            slot={addRelativeIntent.slot}
            selectedPersonName={getPersonDisplayLabel(selectedPerson)}
            people={people}
            busy={isSavingRelationship}
            onCancel={() => setAddRelativeIntent(null)}
            onSubmit={handleAddRelative}
          />
        ) : null}
        <ErrorBoundary
          fallback={
            <div className="graph-overlay graph-overlay-error">
              <p>Graph rendering failed. Reload the page to recover WebGL rendering.</p>
            </div>
          }
        >
          <GraphCanvasScene
            displayVisiblePeople={renderVisiblePeople}
            visibleRelationshipLines={renderVisibleRelationshipLines}
            renderVisibilityBucketByPersonId={renderVisibilityBucketByPersonId}
            relationshipStyleByKind={relationshipStyleByKind}
            selectedPersonId={selectedPersonId}
            showNodeActionButtons={!addRelativeIntent}
            hoveredPersonId={hoveredPersonId}
            highlightedPersonIds={highlightedPersonIds}
            peopleIds={peopleIds}
            prioritizedNodeIds={prioritizedNodeIds}
            renderNearPersonIds={renderNearPersonIds}
            setHoveredPersonId={setHoveredPersonId}
            onNodeClick={handlePersonNodeClick}
            onNodeActionOpen={handleOpenAddRelative}
            onCanvasMissed={handleCanvasMissed}
            onCameraSample={setCameraPositionForCulling}
            cameraRef={cameraRef}
            orbitControlsRef={orbitControlsRef}
            lastCameraSampleRef={lastCameraSampleRef}
          />
        </ErrorBoundary>
      </div>
      <GraphFooterStatus status={status} busy={isSavingRelationship} />
    </section>
  );
};

/** Memoized main graph surface for the people page. */
export const PeopleGraph3D = memo(PeopleGraph3DComponent);
