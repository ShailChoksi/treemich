/**
 * @file Three.js relationship graph, overlays, search, and server layout integration.
 */

import { defaultGraphRenderLimit } from "@treemich/shared";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_GRAPH_UI_SNAPSHOT,
  type GraphCameraIntent,
  type GraphUiSnapshot,
  type Vector3Tuple
} from "../lib/workspaceUiState";
import { PerspectiveCamera, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  createPerson,
  searchRelationships,
  type Person,
  type RelationshipType,
  type UserPreferences
} from "../lib/api";
import type { PeopleGraph3DBundledProps } from "./peopleGraph3dSceneBundles";
import { AddRelativePopup } from "./graph/AddRelativePopup";
import type { AddRelativeSubmitPayload } from "./graph/AddRelativePopup";
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
import {
  resolveCameraSnapshotForPersistence,
  resolveRestoredCameraSnapshotForCanvas,
  resolveStartupCameraIntent,
  shouldCanvasApplyPersistedSnapshotRestore,
  type GraphCameraPose
} from "./graph/graphCameraPolicy";
import { useGraphCameraOrchestrator } from "./graph/useGraphCameraOrchestrator";
import { GraphSceneProvider } from "./graph/GraphSceneContext";
import { GraphSurfaceOverlays } from "./graph/GraphSurfaceOverlays";
import { GraphFooterStatus } from "./graph/GraphFooterStatus";
import { ErrorBoundary } from "./ErrorBoundary";
import { GraphLayerControls } from "./graph/GraphLayerControls";
import { useGraphKeyboardNavigation } from "./graph/useGraphKeyboardNavigation";
import { getPersonDisplayLabel } from "../lib/personDisplay";
import { RELATIONSHIP_TYPES } from "../lib/relationshipConstants";

type Props = PeopleGraph3DBundledProps;

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

type ProviderFilter = "all" | "linked" | "unlinked";

export const canLoadPersonThumbnail = (person: Person) =>
  Boolean(
    person.thumbnailPath?.trim() ||
    person.thumbnail?.storageUrl?.trim() ||
    person.externalIdentities?.some((identity) => identity.provider === "IMMICH")
  );

const thumbnailCacheKeyForPerson = (person: Person): string | undefined => {
  const thumbnail = person.thumbnail;
  if (thumbnail) {
    return [
      thumbnail.id,
      thumbnail.updatedAt,
      thumbnail.importedAt,
      thumbnail.checksum,
      thumbnail.storageUrl,
      thumbnail.source
    ]
      .filter(Boolean)
      .join(":");
  }

  const immichIdentity = person.externalIdentities?.find((identity) => identity.provider === "IMMICH");
  return [
    person.thumbnailPath,
    immichIdentity?.id,
    immichIdentity?.providerPersonId,
    immichIdentity?.thumbnailImportedAt,
    immichIdentity?.updatedAt
  ]
    .filter(Boolean)
    .join(":");
};

export const resolveAddRelativeRelationshipType = (
  slot: AddRelativeSlot,
  selectedRelationshipType?: RelationshipType
): RelationshipType => {
  if (slot === "parent") {
    return RELATIONSHIP_TYPES.childOf;
  }
  if (slot === "child") {
    return RELATIONSHIP_TYPES.parentOf;
  }
  return selectedRelationshipType ?? RELATIONSHIP_TYPES.siblingOf;
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
 * Interactive 3D graph: Treemich people, relationships, layout worker, search, and chrome controls.
 * Exported as memo-wrapped `PeopleGraph3D`.
 */
const PeopleGraph3DComponent = ({
  graphModel: {
    people,
    relationships,
    serverPositionsByPersonId,
    serverLayoutRevision,
    serverLayoutAlgorithmVersion,
    selectedPersonId: parentSelectedPersonId
  },
  graphStatus: {
    status,
    isLoading,
    isSavingRelationship,
    loadError,
    layoutError = null,
    focusPersonRequest,
    cameraFocusPersonRequest,
    treeValidationIssueCount,
    treeValidationEngineDisabled
  },
  graphPreferences: {
    savedPreferences,
    defaultToNoRelationshipsGraphState,
    noRelationshipsGraphFilterVisibility
  },
  graphHandlers: {
    onFocusPersonConsumed,
    onCameraFocusPersonConsumed,
    onSelectedPersonChange,
    onCreateRelationship,
    onNewPerson,
    onPreferencesChange,
    onRetryGraphLoad,
    onRetryLayout
  },
  graphViewState: {
    graphKeyboardEnabled = true,
    layoutResizeSignal = 0,
    initialUiState,
    onUiStateChange,
    isVisible = true,
    graphCameraSessionKind = "hardPageLoad"
  }
}: Props) => {
  const [hoveredPersonId, setHoveredPersonId] = useState<string | null>(null);
  const [focusPersonId, setFocusPersonId] = useState<string | null>(initialUiState?.focusPersonId ?? null);
  const [pinnedPersonId, setPinnedPersonId] = useState<string | null>(initialUiState?.pinnedPersonId ?? null);
  const [addRelativeIntent, setAddRelativeIntent] = useState<AddRelativeIntent | null>(null);
  const [thumbnailProgress, setThumbnailProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [graphViewPreferences, setGraphViewPreferences] = useState<GraphViewPreferencesState>(() =>
    resolveInitialGraphViewPreferences(
      savedPreferences ?? null,
      defaultToNoRelationshipsGraphState,
      noRelationshipsGraphFilterVisibility
    )
  );
  const { filterVisibility, showSingleFamilyTree } = graphViewPreferences;
  const [singleFamilyTreeAnchorId, setSingleFamilyTreeAnchorId] = useState<string | null>(null);
  const { initialCameraState, startupIntent } = useMemo(() => {
    const restored = resolveRestoredCameraSnapshotForCanvas({
      sessionKind: graphCameraSessionKind,
      explicitFocusPersonId: focusPersonRequest ?? null,
      cameraFocusPersonRequest: cameraFocusPersonRequest ?? null,
      savedCamera: initialUiState?.camera ?? null
    });
    return {
      initialCameraState: restored,
      startupIntent: resolveStartupCameraIntent({
        sessionKind: graphCameraSessionKind,
        explicitFocusPersonId: focusPersonRequest ?? null,
        cameraFocusPersonRequest: cameraFocusPersonRequest ?? null,
        restoredCameraSnapshot: restored
      })
    };
  }, [cameraFocusPersonRequest, focusPersonRequest, graphCameraSessionKind, initialUiState?.camera]);

  const applyPersistedSnapshotRestore = useMemo(
    () => shouldCanvasApplyPersistedSnapshotRestore(startupIntent, initialCameraState),
    [initialCameraState, startupIntent]
  );

  const [cameraPositionForCulling, setCameraPositionForCulling] = useState<[number, number, number]>(
    initialCameraState?.position ?? [0, 2, 18]
  );
  const [canvasCameraReadyGeneration, setCanvasCameraReadyGeneration] = useState(0);
  const handleCanvasCameraSystemReady = useCallback(() => {
    setCanvasCameraReadyGeneration((generation) => generation + 1);
  }, []);
  const prefsAppliedRef = useRef(false);
  const lastCameraSampleRef = useRef(new Vector3(0, 2, 18));
  const lastAutoCenteredFocusPersonIdRef = useRef<string | null>(null);
  const lastKeyboardCameraIntentRef = useRef<GraphCameraIntent | null>(null);
  const pendingStartupCameraIntentRef = useRef<GraphCameraIntent | null>(null);
  const handleStartupCameraIntentApplied = useCallback((intent: GraphCameraIntent) => {
    pendingStartupCameraIntentRef.current = intent;
  }, []);
  const lastEmittedGraphUiRef = useRef<GraphUiSnapshot | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const orbitControlsRef = useRef<OrbitControlsImpl | null>(null);
  const clearSearchCenterDedupe = useCallback(() => {
    lastAutoCenteredFocusPersonIdRef.current = null;
  }, []);

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
  const filteredPeople = useMemo(() => {
    if (providerFilter === "all") {
      return people;
    }
    return people.filter((person) => {
      const linkedToImmich = person.externalIdentities?.some((identity) => identity.provider === "IMMICH");
      return providerFilter === "linked" ? linkedToImmich : !linkedToImmich;
    });
  }, [people, providerFilter]);
  const filteredPersonIds = useMemo(
    () => new Set(filteredPeople.map((person) => person.id)),
    [filteredPeople]
  );
  const filteredRelationships = useMemo(
    () =>
      relationships.filter(
        (relationship) =>
          filteredPersonIds.has(relationship.fromPersonId) && filteredPersonIds.has(relationship.toPersonId)
      ),
    [filteredPersonIds, relationships]
  );
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
    people: filteredPeople,
    relationships: filteredRelationships,
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
    renderLimit: savedPreferences?.graphRenderLimit ?? defaultGraphRenderLimit
  });
  const thumbnailCandidatePersonIds = useMemo(
    () => filteredPeople.filter(canLoadPersonThumbnail).map((person) => person.id),
    [filteredPeople]
  );
  const thumbnailCacheKeys = useMemo(
    () =>
      Object.fromEntries(
        filteredPeople
          .filter(canLoadPersonThumbnail)
          .map((person) => [person.id, thumbnailCacheKeyForPerson(person)] as const)
      ),
    [filteredPeople]
  );

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
    initialSearchTerm: initialUiState?.searchTerm ?? "",
    initialHighlightedPersonIds: initialUiState?.highlightedPersonIds ?? [],
    onSearchFallback: handleSearchFallback,
    onSearchFocusCommitted: clearSearchCenterDedupe
  });
  const { applyCameraPose, frameAllNodes, focusPersonById, focusActiveNode, topDownView, nudgeCamera } =
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

  const applyPersistedCameraPose = useCallback(
    (pose: GraphCameraPose) => {
      applyCameraPose(
        [pose.position[0], pose.position[1], pose.position[2]],
        [pose.target[0], pose.target[1], pose.target[2]]
      );
    },
    [applyCameraPose]
  );

  const graphModelReady = !isLoading && !loadError;

  const { hasCompletedStartupCameraRef } = useGraphCameraOrchestrator({
    graphCameraSessionKind,
    startupIntent,
    focusPersonRequest: focusPersonRequest ?? null,
    cameraFocusPersonRequest: cameraFocusPersonRequest ?? null,
    visiblePositionsById,
    graphBounds,
    graphModelReady,
    knownPersonIds: filteredPersonIds,
    fallbackSavedCamera: initialUiState?.camera ?? null,
    focusPersonById,
    frameAllNodes,
    applyPersistedCameraPose,
    onCameraFocusPersonConsumed,
    onFocusPersonConsumed,
    onStartupCameraIntentApplied: handleStartupCameraIntentApplied,
    setFocusPersonId,
    cameraRef,
    orbitControlsRef,
    canvasCameraReadyGeneration,
    lastAutoCenteredFocusPersonIdRef
  });

  const graphShortcutsActive = graphKeyboardEnabled && !addRelativeIntent;

  const frameAllNodesWithIntent = useCallback(() => {
    lastKeyboardCameraIntentRef.current = "frameAll";
    frameAllNodes();
  }, [frameAllNodes]);

  const focusActiveNodeWithIntent = useCallback(() => {
    lastKeyboardCameraIntentRef.current = "explicitFocus";
    focusActiveNode();
  }, [focusActiveNode]);

  const topDownViewWithIntent = useCallback(() => {
    lastKeyboardCameraIntentRef.current = "topDown";
    topDownView();
  }, [topDownView]);

  useGraphCamera({
    enabled: graphShortcutsActive,
    frameAllNodes: frameAllNodesWithIntent,
    focusActiveNode: focusActiveNodeWithIntent,
    topDownView: topDownViewWithIntent
  });
  useGraphKeyboardNavigation({
    enabled: graphShortcutsActive,
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

  const handleCameraSample = useCallback((position: [number, number, number]) => {
    setCameraPositionForCulling(position);
  }, []);

  useEffect(() => {
    if (!onUiStateChange) {
      return;
    }
    const camera = cameraRef.current;
    const target = orbitControlsRef.current?.target;
    const canPersistCamera =
      Boolean(camera && target) && hasCompletedStartupCameraRef.current && canvasCameraReadyGeneration > 0;
    const liveCamera =
      camera && target
        ? {
            position: [camera.position.x, camera.position.y, camera.position.z] as Vector3Tuple,
            target: [target.x, target.y, target.z] as Vector3Tuple
          }
        : null;
    const base = lastEmittedGraphUiRef.current ?? initialUiState ?? DEFAULT_GRAPH_UI_SNAPSHOT;
    const pendingStartup = pendingStartupCameraIntentRef.current;
    const commandedIntent = lastKeyboardCameraIntentRef.current;
    const persisted = resolveCameraSnapshotForPersistence({
      canPersistCamera: Boolean(canPersistCamera && liveCamera),
      liveCamera,
      baseCamera: base.camera,
      baseCameraIntent: base.cameraIntent,
      baseCameraPersonId: base.cameraPersonId,
      focusPersonId,
      selectedPersonId,
      pendingStartupIntent: pendingStartup,
      keyboardIntent: commandedIntent
    });
    if (canPersistCamera && liveCamera) {
      if (pendingStartup) {
        pendingStartupCameraIntentRef.current = null;
      } else if (commandedIntent) {
        lastKeyboardCameraIntentRef.current = null;
      }
    }
    const next: GraphUiSnapshot = {
      ...base,
      schemaVersion: 2,
      searchTerm,
      focusPersonId,
      pinnedPersonId,
      highlightedPersonIds: [...highlightedPersonIds],
      camera: persisted.camera,
      cameraIntent: persisted.cameraIntent,
      cameraPersonId: persisted.cameraPersonId
    };
    lastEmittedGraphUiRef.current = next;
    onUiStateChange(next);
  }, [
    cameraPositionForCulling,
    canvasCameraReadyGeneration,
    focusPersonId,
    highlightedPersonIds,
    initialUiState,
    onUiStateChange,
    pinnedPersonId,
    searchTerm,
    selectedPersonId
  ]);

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

  const handleOpenAddRelative = useCallback(
    (slot: AddRelativeSlot) => {
      if (!selectedPersonId) {
        return;
      }
      setAddRelativeIntent({
        slot,
        selectedPersonId
      });
    },
    [selectedPersonId]
  );

  const handleAddRelative = async (payload: AddRelativeSubmitPayload) => {
    if (!addRelativeIntent) {
      throw new Error("Select a person first.");
    }

    let targetId: string;
    let targetName: string;
    if (payload.type === "new") {
      const newPerson = await createPerson({
        givenName: payload.givenName,
        surname: payload.surname,
        gender: payload.gender
      });
      targetId = newPerson.id;
      targetName = getPersonDisplayLabel(newPerson);
    } else {
      const match = findPersonBySearchTerm(people, payload.personName);
      if (!payload.personName.trim()) {
        throw new Error("Type a person name.");
      }
      if (!match) {
        throw new Error(`No person found for "${payload.personName}"`);
      }
      if (match.id === addRelativeIntent.selectedPersonId) {
        throw new Error("Choose a different person.");
      }
      targetId = match.id;
      targetName = match.name;
    }

    const nextRelationshipType = resolveAddRelativeRelationshipType(
      addRelativeIntent.slot,
      payload.relationshipType
    );

    await onCreateRelationship(addRelativeIntent.selectedPersonId, targetId, nextRelationshipType);
    setAddRelativeIntent(null);
    setSearchFeedback(payload.type === "new" ? `Created and added ${targetName}` : `Added ${targetName}`);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    setSearchFeedback(null);
    clearHighlights();
  };

  const handleThumbnailProgress = useCallback((progress: { loaded: number; total: number }) => {
    setThumbnailProgress(progress);
  }, []);
  const graphSceneContextValue = useMemo(
    () => ({
      peopleIds: thumbnailCandidatePersonIds,
      thumbnailCacheKeys,
      prioritizedNodeIds,
      renderNearPersonIds,
      renderVisibilityBucketByPersonId
    }),
    [
      prioritizedNodeIds,
      renderNearPersonIds,
      renderVisibilityBucketByPersonId,
      thumbnailCacheKeys,
      thumbnailCandidatePersonIds
    ]
  );

  const handleToggleFilter = (filter: GraphFilter) => {
    setGraphViewPreferences((current) => {
      const next = {
        ...current,
        filterVisibility: { ...current.filterVisibility, [filter]: !current.filterVisibility[filter] }
      };
      void onPreferencesChange({
        graphFilterVisibility: next.filterVisibility,
        showSingleFamilyTree: next.showSingleFamilyTree
      });
      return next;
    });
  };

  const handleShowSingleFamilyTreeChange = (next: boolean) => {
    setGraphViewPreferences((current) => {
      const nextPreferences = { ...current, showSingleFamilyTree: next };
      void onPreferencesChange({
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

  const graphSelectionSummary = selectedPerson
    ? `Selected person: ${getPersonDisplayLabel(selectedPerson)}. ${renderVisiblePeople.length} people and ${renderVisibleRelationshipLines.length} relationships are currently visible in the graph.`
    : `No person selected. ${renderVisiblePeople.length} people and ${renderVisibleRelationshipLines.length} relationships are currently visible in the graph.`;

  return (
    <section className="card graph-card">
      <div className="graph-surface">
        <p className="sr-only" aria-live="polite">
          {graphSelectionSummary}
        </p>
        <GraphSearchOverlay
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          onSearchSubmit={handleSearchSubmit}
          onClearSearch={handleClearSearch}
          onCenterView={frameAllNodesWithIntent}
          people={filteredPeople}
          searchFeedback={searchFeedback}
          treeValidationIssueCount={treeValidationIssueCount}
          treeValidationEngineDisabled={treeValidationEngineDisabled}
          providerFilter={providerFilter}
          onProviderFilterChange={setProviderFilter}
          onNewPerson={onNewPerson}
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
          layoutError={layoutError}
          isLayoutWorkerPending={isWorkerLayoutPending}
          onRetryGraphLoad={onRetryGraphLoad}
          onRetryLayout={onRetryLayout}
        />
        {addRelativeIntent && selectedPerson ? (
          <AddRelativePopup
            slot={addRelativeIntent.slot}
            selectedPersonName={getPersonDisplayLabel(selectedPerson)}
            people={filteredPeople}
            busy={isSavingRelationship}
            onCancel={() => setAddRelativeIntent(null)}
            onSubmit={handleAddRelative}
          />
        ) : null}
        <ErrorBoundary
          errorContext="Graph canvas"
          fallback={
            <div className="graph-overlay graph-overlay-error">
              <p>Graph rendering failed. Reload the page to recover WebGL rendering.</p>
            </div>
          }
        >
          <GraphSceneProvider value={graphSceneContextValue}>
            <GraphCanvasScene
              layoutResizeSignal={layoutResizeSignal}
              displayVisiblePeople={renderVisiblePeople}
              visibleRelationshipLines={renderVisibleRelationshipLines}
              relationshipStyleByKind={relationshipStyleByKind}
              selectedPersonId={selectedPersonId}
              showNodeActionButtons={!addRelativeIntent}
              hoveredPersonId={hoveredPersonId}
              highlightedPersonIds={highlightedPersonIds}
              setHoveredPersonId={setHoveredPersonId}
              onNodeClick={handlePersonNodeClick}
              onNodeActionOpen={handleOpenAddRelative}
              onCanvasMissed={handleCanvasMissed}
              onCameraSample={handleCameraSample}
              initialCameraState={initialCameraState}
              cameraRef={cameraRef}
              orbitControlsRef={orbitControlsRef}
              lastCameraSampleRef={lastCameraSampleRef}
              isVisible={isVisible}
              onThumbnailProgress={handleThumbnailProgress}
              onCanvasCameraSystemReady={handleCanvasCameraSystemReady}
              applyPersistedSnapshotRestore={applyPersistedSnapshotRestore}
            />
          </GraphSceneProvider>
        </ErrorBoundary>
      </div>
      <GraphFooterStatus status={status} busy={isSavingRelationship} thumbnailProgress={thumbnailProgress} />
    </section>
  );
};

/** Memoized main graph surface for the people page. */
export const PeopleGraph3D = memo(PeopleGraph3DComponent);
