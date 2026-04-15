import { Line, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useCallback } from "react";
import { MOUSE, PerspectiveCamera, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { ImmichPerson } from "../../lib/api";
import type { AddRelativeSlot } from "./NodeActionButtons";
import type { NodePosition } from "./layout";
import type { RelationshipKind } from "./relationshipStyles";
import { AnimatedNodes } from "./scene/AnimatedNodes";
import { createWebGlRenderer } from "./scene/createWebGlRenderer";
import { useOrbitPositionSync } from "./scene/useOrbitPositionSync";

type VisibleLine = {
  key: string;
  points: NodePosition[];
  kind: RelationshipKind;
  opacity?: number;
};

type DisplayPerson = {
  person: ImmichPerson;
  displayPosition: NodePosition;
};

const orbitControlMouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN } as const;

type Props = {
  displayVisiblePeople: DisplayPerson[];
  visibleRelationshipLines: VisibleLine[];
  relationshipStyleByKind: Record<RelationshipKind, { color: string; opacity: number }>;
  selectedPersonId: string | null;
  showNodeActionButtons: boolean;
  hoveredPersonId: string | null;
  highlightedPersonIds: Set<string>;
  thumbnailNodeIds: Set<string>;
  setHoveredPersonId: (updater: (current: string | null) => string | null) => void;
  onNodeClick: (personId: string) => void;
  onNodeActionOpen: (slot: AddRelativeSlot) => void;
  onCanvasMissed: () => void;
  cameraRef: React.MutableRefObject<PerspectiveCamera | null>;
  orbitControlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  lastCameraSampleRef: React.MutableRefObject<Vector3>;
  setCameraPosition: (position: NodePosition) => void;
};

export const GraphCanvasScene = ({
  displayVisiblePeople,
  visibleRelationshipLines,
  relationshipStyleByKind,
  selectedPersonId,
  showNodeActionButtons,
  hoveredPersonId,
  highlightedPersonIds,
  thumbnailNodeIds,
  setHoveredPersonId,
  onNodeClick,
  onNodeActionOpen,
  onCanvasMissed,
  cameraRef,
  orbitControlsRef,
  lastCameraSampleRef,
  setCameraPosition
}: Props) => {
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
    ({ camera }: { camera: PerspectiveCamera }) => {
      cameraRef.current = camera;
    },
    [cameraRef]
  );
  const { handleOrbitChange, handleOrbitEnd } = useOrbitPositionSync({
    lastCameraSampleRef,
    setCameraPosition
  });

  return (
    <Canvas
      camera={{ position: [0, 2, 18], fov: 55 }}
      dpr={1}
      frameloop="demand"
      onPointerMissed={onCanvasMissed}
      onCreated={handleCanvasCreated}
      gl={createWebGlRenderer}
    >
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
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onNodeActionOpen={onNodeActionOpen}
      />
    </Canvas>
  );
};
