/**
 * @file R3F scene: nodes, edges, camera, and animated layout transitions.
 */

import { Line, OrbitControls } from "@react-three/drei";
import { Canvas, invalidate, type RootState, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { MOUSE, PerspectiveCamera, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Person } from "../../lib/api";
import type { AddRelativeSlot } from "./NodeActionButtons";
import type { GraphVisibilityBucket } from "./graphVisibility";
import type { NodePosition } from "./layout";
import type { RelationshipKind } from "./relationshipStyles";
import { AnimatedNodes } from "./scene/AnimatedNodes";
import { createWebGlRenderer } from "./scene/createWebGlRenderer";
import { useOrbitPositionSync } from "./scene/useOrbitPositionSync";
import { InvalidateOnThumbnailUpdate, useThumbnailLoader } from "./useThumbnailLoader";

type VisibleLine = {
  key: string;
  points: NodePosition[];
  kind: RelationshipKind;
  opacity?: number;
  dashed?: boolean;
};

type DisplayPerson = {
  person: Person;
  displayPosition: NodePosition;
};

const orbitControlMouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN } as const;

const CanvasResizeNudge = ({ layoutResizeSignal }: { layoutResizeSignal: number }) => {
  const { gl, setSize } = useThree();
  useLayoutEffect(() => {
    const parent = gl.domElement.parentElement;
    if (parent) {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w > 0 && h > 0) {
        setSize(w, h);
      }
    }
    invalidate();
  }, [gl, layoutResizeSignal, setSize]);
  return null;
};

type Props = {
  layoutResizeSignal: number;
  displayVisiblePeople: DisplayPerson[];
  visibleRelationshipLines: VisibleLine[];
  relationshipStyleByKind: Record<RelationshipKind, { color: string; opacity: number }>;
  selectedPersonId: string | null;
  showNodeActionButtons: boolean;
  hoveredPersonId: string | null;
  highlightedPersonIds: Set<string>;
  peopleIds: string[];
  thumbnailCacheKeys?: Record<string, string | undefined>;
  prioritizedNodeIds: Set<string>;
  renderVisibilityBucketByPersonId: Map<string, GraphVisibilityBucket>;
  renderNearPersonIds: string[];
  /** When false, the graph is not visible (e.g. another workspace active) */
  isVisible: boolean;
  setHoveredPersonId: (updater: (current: string | null) => string | null) => void;
  onNodeClick: (personId: string) => void;
  onNodeActionOpen: (slot: AddRelativeSlot) => void;
  onCanvasMissed: () => void;
  onCameraSample: (position: NodePosition) => void;
  initialCameraState?: { position: NodePosition; target: NodePosition } | null;
  cameraRef: React.MutableRefObject<PerspectiveCamera | null>;
  orbitControlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  lastCameraSampleRef: React.MutableRefObject<Vector3>;
  /** Reports thumbnail loading progress (loaded/total). */
  onThumbnailProgress?: (progress: { loaded: number; total: number }) => void;
};

export const GraphCanvasScene = ({
  layoutResizeSignal,
  displayVisiblePeople,
  visibleRelationshipLines,
  relationshipStyleByKind,
  selectedPersonId,
  showNodeActionButtons,
  hoveredPersonId,
  highlightedPersonIds,
  peopleIds,
  thumbnailCacheKeys,
  prioritizedNodeIds,
  renderVisibilityBucketByPersonId,
  renderNearPersonIds,
  isVisible,
  setHoveredPersonId,
  onNodeClick,
  onNodeActionOpen,
  onCanvasMissed,
  onCameraSample,
  initialCameraState = null,
  cameraRef,
  orbitControlsRef,
  lastCameraSampleRef,
  onThumbnailProgress
}: Props) => {
  const hasRestoredCameraRef = useRef(false);
  const handleNodeHover = useCallback(
    (personId: string, hovered: boolean) => {
      setHoveredPersonId((current) => {
        if (!hovered) {
          return current === personId ? null : current;
        }
        return personId;
      });
    },
    [setHoveredPersonId]
  );

  const handleNodeClick = useCallback(
    (personId: string, event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      onNodeClick(personId);
    },
    [onNodeClick]
  );
  const handleCanvasCreated = useCallback(
    (state: RootState) => {
      if (state.camera instanceof PerspectiveCamera) {
        cameraRef.current = state.camera;
      }
    },
    [cameraRef]
  );
  const handleCameraSample = useCallback(
    (position: Vector3) => {
      onCameraSample([position.x, position.y, position.z]);
    },
    [onCameraSample]
  );
  const { handleOrbitChange, handleOrbitEnd } = useOrbitPositionSync({
    lastCameraSampleRef,
    onSampledPosition: handleCameraSample
  });
  const { thumbnailNodeIds, thumbnailTextures, thumbnailProgress } = useThumbnailLoader({
    peopleIds,
    thumbnailCacheKeys,
    prioritizedNodeIds,
    renderNearPersonIds,
    displayVisiblePeople,
    cameraSampleRef: lastCameraSampleRef,
    visible: isVisible
  });

  // Report thumbnail progress to parent (PeopleGraph3D) for the progress indicator.
  useEffect(() => {
    onThumbnailProgress?.(thumbnailProgress);
  }, [thumbnailProgress, onThumbnailProgress]);

  useEffect(() => {
    if (hasRestoredCameraRef.current || !initialCameraState || !cameraRef.current) {
      return;
    }
    hasRestoredCameraRef.current = true;
    cameraRef.current.position.set(...initialCameraState.position);
    lastCameraSampleRef.current.set(...initialCameraState.position);
    const controls = orbitControlsRef.current;
    if (controls) {
      controls.target.set(...initialCameraState.target);
      controls.update();
    }
    onCameraSample(initialCameraState.position);
    invalidate();
  }, [cameraRef, initialCameraState, lastCameraSampleRef, onCameraSample, orbitControlsRef]);

  return (
    <Canvas
      role="img"
      aria-label="Family relationship graph"
      camera={{ position: initialCameraState?.position ?? [0, 2, 18], fov: 55 }}
      dpr={[1, 1.5]}
      frameloop="demand"
      onPointerMissed={onCanvasMissed}
      onCreated={handleCanvasCreated}
      gl={createWebGlRenderer}
      style={{ visibility: isVisible ? "visible" : "hidden" }}
    >
      <CanvasResizeNudge layoutResizeSignal={layoutResizeSignal} />
      <InvalidateOnThumbnailUpdate thumbnailTextures={thumbnailTextures} visible={isVisible} />
      <ambientLight intensity={1.1} />
      <pointLight position={[15, 15, 10]} intensity={1.2} />
      <OrbitControls
        makeDefault
        ref={orbitControlsRef}
        enableDamping
        dampingFactor={0.1}
        rotateSpeed={0.7}
        panSpeed={1.25}
        zoomSpeed={1.1}
        screenSpacePanning
        minDistance={3}
        maxDistance={220}
        mouseButtons={orbitControlMouseButtons}
        onChange={handleOrbitChange}
        onEnd={handleOrbitEnd}
      />
      {visibleRelationshipLines.map((line) => (
        <Line
          key={line.key}
          points={line.points}
          color={relationshipStyleByKind[line.kind].color}
          lineWidth={1.35}
          transparent
          dashed={Boolean(line.dashed)}
          dashScale={line.dashed ? 2.5 : undefined}
          opacity={line.opacity ?? relationshipStyleByKind[line.kind].opacity}
        />
      ))}

      <AnimatedNodes
        displayVisiblePeople={displayVisiblePeople}
        selectedPersonId={selectedPersonId}
        showNodeActionButtons={showNodeActionButtons}
        hoveredPersonId={hoveredPersonId}
        highlightedPersonIds={highlightedPersonIds}
        thumbnailNodeIds={thumbnailNodeIds}
        thumbnailTextures={thumbnailTextures}
        prioritizedNodeIds={prioritizedNodeIds}
        visibilityBucketByPersonId={renderVisibilityBucketByPersonId}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onNodeActionOpen={onNodeActionOpen}
      />
    </Canvas>
  );
};
