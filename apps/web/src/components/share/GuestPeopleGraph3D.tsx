/**
 * @file Thin read-only 3D Focus Share graph — reuses owner scene/camera stack + chrome.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  defaultTreeLayoutPreferences,
  resolveTreeLayoutPreferences,
  type FocusShareGuestGraphLayout,
  type FocusShareGuestPerson,
  type FocusShareGuestRelationship,
  type ResolvedTreeLayoutPreferences
} from "@treemich/shared";
import { Vector3, type PerspectiveCamera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { guestFocusShareThumbnailUrl } from "../../lib/api";
import { ErrorBoundary } from "../ErrorBoundary";
import { FocusSelectionChrome } from "../graph/FocusSelectionChrome";
import { GraphCanvasScene } from "../graph/GraphCanvasScene";
import { GraphLayerControls } from "../graph/GraphLayerControls";
import { GraphSceneProvider } from "../graph/GraphSceneContext";
import type { GraphVisibilityBucket } from "../graph/graphVisibility";
import type { NodePosition } from "../graph/layout";
import {
  defaultGraphFilterVisibility,
  type GraphFilter,
  type GraphFilterVisibility
} from "../graph/relationshipStyles";
import { TreeLayoutControls } from "../graph/TreeLayoutControls";
import { useGraphCamera } from "../graph/useGraphCamera";
import { useGraphCameraControls } from "../graph/useGraphCameraControls";
import {
  buildGuestVisibleRelationshipLines,
  layoutGuestFocusGeometry,
  type GuestPeopleViewFilter
} from "./guestGraphAdapters";
type DepthState = {
  ancestorDepth: number;
  descendantDepth: number;
  collateralDepth: number;
};
type Props = {
  people: FocusShareGuestPerson[];
  relationships: FocusShareGuestRelationship[];
  layout: FocusShareGuestGraphLayout;
  focusAnchorPersonId: string;
  focusAnchorLabel: string;
  selectedPersonId: string | null;
  onSelectedPersonChange: (personId: string | null) => void;
  depths: DepthState;
  maxDepths: DepthState;
  onDepthChange: (key: keyof DepthState, value: number) => void;
};
const EMPTY_HIGHLIGHTS = new Set<string>();
const EMPTY_NEAR_IDS: string[] = [];
const EMPTY_VISIBILITY = new Map<string, GraphVisibilityBucket>();
export const GuestPeopleGraph3D = ({
  people,
  relationships,
  layout,
  focusAnchorPersonId,
  focusAnchorLabel,
  selectedPersonId,
  onSelectedPersonChange,
  depths,
  maxDepths,
  onDepthChange
}: Props) => {
  const [hoveredPersonId, setHoveredPersonId] = useState<string | null>(null);
  const [focusPersonId, setFocusPersonId] = useState<string | null>(null);
  const [layoutResizeSignal, setLayoutResizeSignal] = useState(0);
  const [filterVisibility, setFilterVisibility] = useState<GraphFilterVisibility>(
    defaultGraphFilterVisibility
  );
  const [peopleViewFilter, setPeopleViewFilter] = useState<GuestPeopleViewFilter>("all");
  const [treeLayoutPreferences, setTreeLayoutPreferences] = useState<ResolvedTreeLayoutPreferences>(() =>
    resolveTreeLayoutPreferences(layout.treeLayoutPreferences)
  );
  const primaryFamilyUnitByPersonId = layout.primaryFamilyUnitByPersonId;
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const orbitControlsRef = useRef<OrbitControlsImpl | null>(null);
  const lastCameraSampleRef = useRef(new Vector3(0, 2, 18));
  const lastAutoCenteredFocusPersonIdRef = useRef<string | null>(null);
  const hasAppliedInitialCameraRef = useRef(false);
  const canvasCameraReadyRef = useRef(false);
  // Geometry is independent of layer checkboxes so toggles don't churn camera control identities.
  const geometry = useMemo(
    () =>
      layoutGuestFocusGeometry(people, relationships, {
        treeLayoutPreferences,
        peopleViewFilter,
        primaryFamilyUnitByPersonId
      }),
    [people, peopleViewFilter, primaryFamilyUnitByPersonId, relationships, treeLayoutPreferences]
  );
  const visibleRelationshipLines = useMemo(
    () => buildGuestVisibleRelationshipLines(geometry, filterVisibility),
    [filterVisibility, geometry]
  );
  const thumbnailPeopleIds = useMemo(
    () => people.filter((person) => person.hasThumbnail).map((person) => person.id),
    [people]
  );
  const prioritizedNodeIds = useMemo(() => {
    const next = new Set<string>();
    if (selectedPersonId) {
      next.add(selectedPersonId);
    }
    if (focusAnchorPersonId) {
      next.add(focusAnchorPersonId);
    }
    return next;
  }, [focusAnchorPersonId, selectedPersonId]);
  const graphSceneContextValue = useMemo(
    () => ({
      peopleIds: thumbnailPeopleIds,
      prioritizedNodeIds,
      renderNearPersonIds: EMPTY_NEAR_IDS,
      renderVisibilityBucketByPersonId: EMPTY_VISIBILITY,
      resolveThumbnailUrl: (personId: string) => guestFocusShareThumbnailUrl(personId)
    }),
    [prioritizedNodeIds, thumbnailPeopleIds]
  );
  useEffect(() => {
    if (!selectedPersonId) {
      return;
    }
    setFocusPersonId(selectedPersonId);
  }, [selectedPersonId]);
  const { frameAllNodes, focusPersonById, focusActiveNode, topDownView } = useGraphCameraControls({
    graphBounds: geometry.graphBounds,
    visiblePositionsById: geometry.visiblePositionsById,
    selectedPersonId,
    hoveredPersonId,
    focusPersonId,
    pinnedPersonId: null,
    cameraRef,
    orbitControlsRef,
    lastCameraSampleRef
  });
  const frameAllNodesRef = useRef(frameAllNodes);
  frameAllNodesRef.current = frameAllNodes;
  const focusPersonByIdRef = useRef(focusPersonById);
  focusPersonByIdRef.current = focusPersonById;
  useGraphCamera({
    enabled: true,
    frameAllNodes,
    focusActiveNode,
    topDownView
  });
  useEffect(() => {
    const onResize = () => setLayoutResizeSignal((value) => value + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // Re-apply initial camera only when membership/layout geometry changes — not layer toggles.
  useEffect(() => {
    hasAppliedInitialCameraRef.current = false;
  }, [people, relationships, treeLayoutPreferences, peopleViewFilter, focusAnchorPersonId]);
  const applyInitialCamera = useCallback(() => {
    if (hasAppliedInitialCameraRef.current || !canvasCameraReadyRef.current) {
      return;
    }
    if (!cameraRef.current || !orbitControlsRef.current) {
      return;
    }
    if (geometry.visiblePositionsById.has(focusAnchorPersonId)) {
      hasAppliedInitialCameraRef.current = true;
      setFocusPersonId(focusAnchorPersonId);
      lastAutoCenteredFocusPersonIdRef.current = focusAnchorPersonId;
      focusPersonByIdRef.current(focusAnchorPersonId);
      return;
    }
    if (geometry.graphBounds) {
      hasAppliedInitialCameraRef.current = true;
      frameAllNodesRef.current();
    }
  }, [focusAnchorPersonId, geometry.graphBounds, geometry.visiblePositionsById]);
  const handleCanvasCameraSystemReady = useCallback(() => {
    canvasCameraReadyRef.current = true;
    applyInitialCamera();
  }, [applyInitialCamera]);
  useEffect(() => {
    applyInitialCamera();
  }, [applyInitialCamera]);
  useEffect(() => {
    if (!focusPersonId) {
      lastAutoCenteredFocusPersonIdRef.current = null;
      return;
    }
    if (focusPersonId === lastAutoCenteredFocusPersonIdRef.current) {
      return;
    }
    if (!geometry.visiblePositionsById.has(focusPersonId)) {
      return;
    }
    focusPersonById(focusPersonId);
    lastAutoCenteredFocusPersonIdRef.current = focusPersonId;
  }, [focusPersonById, focusPersonId, geometry.visiblePositionsById]);
  const handleNodeClick = useCallback(
    (personId: string) => {
      onSelectedPersonChange(personId);
      setFocusPersonId(personId);
      focusPersonById(personId);
    },
    [focusPersonById, onSelectedPersonChange]
  );
  const handleCanvasMissed = useCallback(() => {
    onSelectedPersonChange(null);
    setFocusPersonId(null);
    setHoveredPersonId(null);
  }, [onSelectedPersonChange]);
  const handleCameraSample = useCallback((position: NodePosition) => {
    lastCameraSampleRef.current.set(position[0], position[1], position[2]);
  }, []);
  const handleToggleFilter = useCallback((filter: GraphFilter) => {
    setFilterVisibility((current) => ({
      ...current,
      [filter]: !current[filter]
    }));
  }, []);
  const handleTreeLayoutPreferenceChange = useCallback(
    (key: keyof ResolvedTreeLayoutPreferences, value: number) => {
      setTreeLayoutPreferences((current) => ({ ...current, [key]: value }));
    },
    []
  );
  const handleTreeLayoutPreferenceReset = useCallback((key: keyof ResolvedTreeLayoutPreferences) => {
    setTreeLayoutPreferences((current) => ({
      ...current,
      [key]: defaultTreeLayoutPreferences[key]
    }));
  }, []);
  if (people.length === 0) {
    return <p className="hint">No people in this Focus view.</p>;
  }
  return (
    <div className="guest-people-graph-3d graph-surface" data-testid="guest-graph-3d">
      <div className="graph-bottom-left-controls">
        <label className="graph-provider-filter-control">
          <span>People</span>
          <select
            value={peopleViewFilter}
            onChange={(event) => setPeopleViewFilter(event.target.value as GuestPeopleViewFilter)}
            aria-label="People view filter"
          >
            <option value="all">All people</option>
            <option value="immich-linked">Only Immich-linked</option>
            <option value="immich-unlinked">Not linked to Immich</option>
          </select>
        </label>
        <GraphLayerControls
          filterVisibility={filterVisibility}
          onToggleFilter={handleToggleFilter}
          showFocusMode
          onShowFocusModeChange={() => undefined}
          canEnableFocus
          focusModeLocked
        />
        <FocusSelectionChrome
          focusAnchorPersonId={focusAnchorPersonId}
          focusAnchorLabel={focusAnchorLabel}
          ancestorDepth={depths.ancestorDepth}
          descendantDepth={depths.descendantDepth}
          collateralDepth={depths.collateralDepth}
          locked
          lockedAnchorLabel={focusAnchorLabel}
          onAncestorDepthChange={(value) => onDepthChange("ancestorDepth", value)}
          onDescendantDepthChange={(value) => onDepthChange("descendantDepth", value)}
          onCollateralDepthChange={(value) => onDepthChange("collateralDepth", value)}
          onToggleLock={() => undefined}
          maxAncestorDepth={maxDepths.ancestorDepth}
          maxDescendantDepth={maxDepths.descendantDepth}
          maxCollateralDepth={maxDepths.collateralDepth}
          showShareButton={false}
          lockDisabled
        />
      </div>
      <div className="graph-bottom-right-controls guest-graph-camera-controls">
        <button
          type="button"
          className="secondary-button graph-center-view-button"
          onClick={frameAllNodes}
          aria-label="Center graph view"
        >
          Center view (F)
        </button>
        <TreeLayoutControls
          value={treeLayoutPreferences}
          onPreferenceChange={handleTreeLayoutPreferenceChange}
          onPreferenceReset={handleTreeLayoutPreferenceReset}
        />
      </div>
      <ErrorBoundary
        errorContext="Guest graph canvas"
        fallback={
          <div className="graph-overlay graph-overlay-error">
            <p>Graph rendering failed. Reload the page to recover WebGL rendering.</p>
          </div>
        }
      >
        <GraphSceneProvider value={graphSceneContextValue}>
          <GraphCanvasScene
            layoutResizeSignal={layoutResizeSignal}
            displayVisiblePeople={geometry.displayVisiblePeople}
            visibleRelationshipLines={visibleRelationshipLines}
            relationshipStyleByKind={geometry.relationshipStyleByKind}
            selectedPersonId={selectedPersonId}
            showNodeActionButtons={false}
            hoveredPersonId={hoveredPersonId}
            highlightedPersonIds={EMPTY_HIGHLIGHTS}
            focusLockedPersonId={focusAnchorPersonId}
            isVisible
            setHoveredPersonId={setHoveredPersonId}
            onNodeClick={handleNodeClick}
            onNodeActionOpen={() => undefined}
            onCanvasMissed={handleCanvasMissed}
            onCameraSample={handleCameraSample}
            cameraRef={cameraRef}
            orbitControlsRef={orbitControlsRef}
            lastCameraSampleRef={lastCameraSampleRef}
            onCanvasCameraSystemReady={handleCanvasCameraSystemReady}
            applyPersistedSnapshotRestore={false}
          />
        </GraphSceneProvider>
      </ErrorBoundary>
    </div>
  );
};
