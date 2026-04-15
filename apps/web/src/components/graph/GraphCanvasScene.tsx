import { Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useRef, type ReactNode } from "react";
import { Group, MOUSE, PerspectiveCamera, Vector3, WebGLRenderer } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { ImmichPerson } from "../../lib/api";
import { NodeActionButtons, type AddRelativeSlot } from "./NodeActionButtons";
import { PersonNode, PersonNodeFallback } from "./PersonNode";
import type { NodePosition } from "./layout";
import type { RelationshipKind } from "./relationshipStyles";

type VisibleLine = {
  key: string;
  from: NodePosition;
  to: NodePosition;
  kind: RelationshipKind;
  opacity?: number;
};

type DisplayPerson = {
  person: ImmichPerson;
  displayPosition: NodePosition;
};

type Props = {
  displayVisiblePeople: DisplayPerson[];
  visibleRelationshipLines: VisibleLine[];
  relationshipStyleByKind: Record<RelationshipKind, { color: string; opacity: number }>;
  selectedPersonId: string | null;
  showNodeActionButtons: boolean;
  hoveredPersonId: string | null;
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

type AnimatedGroupProps = {
  position: NodePosition;
  children: ReactNode;
};

const AnimatedGroup = ({ position, children }: AnimatedGroupProps) => {
  const groupRef = useRef<Group>(null);
  const targetRef = useRef(new Vector3(position[0], position[1], position[2]));

  useEffect(() => {
    targetRef.current.set(position[0], position[1], position[2]);
    if (!groupRef.current) {
      return;
    }
    if (groupRef.current.position.lengthSq() === 0) {
      groupRef.current.position.copy(targetRef.current);
    }
  }, [position]);

  useFrame((_, delta) => {
    if (!groupRef.current) {
      return;
    }
    // Exponential smoothing gives fluid motion regardless of frame rate.
    const alpha = 1 - Math.exp(-delta * 9);
    groupRef.current.position.lerp(targetRef.current, alpha);
  });

  return <group ref={groupRef}>{children}</group>;
};

export const GraphCanvasScene = ({
  displayVisiblePeople,
  visibleRelationshipLines,
  relationshipStyleByKind,
  selectedPersonId,
  showNodeActionButtons,
  hoveredPersonId,
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
  const lastCameraStateUpdateMsRef = useRef(0);

  return (
    <Canvas
      camera={{ position: [0, 2, 18], fov: 55 }}
      dpr={1}
      frameloop="demand"
      onPointerMissed={onCanvasMissed}
      onCreated={({ camera }) => {
        cameraRef.current = camera as PerspectiveCamera;
      }}
      gl={(defaults) => {
        const canvas = defaults.canvas as HTMLCanvasElement;
        const contextAttributes: WebGLContextAttributes = {
          alpha: true,
          antialias: false,
          depth: true,
          desynchronized: false,
          failIfMajorPerformanceCaveat: false,
          powerPreference: "default",
          premultipliedAlpha: true,
          preserveDrawingBuffer: false,
          stencil: false
        };

        const context =
          // three@0.180 requires WebGL2, so only request webgl2 contexts.
          canvas.getContext("webgl2") ?? canvas.getContext("webgl2", contextAttributes);

        if (!context) {
          throw new Error(
            "WebGL2 context creation failed: browser/driver returned no context. Enable WebGL2/hardware acceleration in Firefox."
          );
        }

        return new WebGLRenderer({
          ...defaults,
          context: context as WebGL2RenderingContext
        });
      }}
    >
      <ambientLight intensity={1.1} />
      <pointLight position={[15, 15, 10]} intensity={1.2} />
      <gridHelper args={[40, 20, "#334155", "#1f2937"]} />
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
        mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
        onChange={(event) => {
          if (!event) {
            return;
          }
          const controls = event.target as { object?: { position?: Vector3 } };
          const position = controls.object?.position;
          if (!position) {
            return;
          }

          if (lastCameraSampleRef.current.distanceToSquared(position) < 0.2) {
            return;
          }

          const now = performance.now();
          if (now - lastCameraStateUpdateMsRef.current < 90) {
            return;
          }

          lastCameraStateUpdateMsRef.current = now;
          lastCameraSampleRef.current.copy(position);
          setCameraPosition([position.x, position.y, position.z]);
        }}
        onEnd={(event) => {
          if (!event) {
            return;
          }
          const controls = event.target as { object?: { position?: Vector3 } };
          const position = controls.object?.position;
          if (!position) {
            return;
          }
          lastCameraStateUpdateMsRef.current = performance.now();
          lastCameraSampleRef.current.copy(position);
          setCameraPosition([position.x, position.y, position.z]);
        }}
      />
      {visibleRelationshipLines.map((line) => (
        <Line
          key={line.key}
          points={[line.from, line.to]}
          color={relationshipStyleByKind[line.kind].color}
          lineWidth={1.35}
          transparent
          opacity={line.opacity ?? relationshipStyleByKind[line.kind].opacity}
        />
      ))}

      {displayVisiblePeople.map(({ person, displayPosition }) => {
        const isSelected = selectedPersonId === person.id;
        const isHovered = hoveredPersonId === person.id;
        const showThumbnail = thumbnailNodeIds.has(person.id);
        const nodePosition = displayPosition;
        const onHover = (hovered: boolean) =>
          setHoveredPersonId((current) => {
            if (!hovered) {
              return current === person.id ? null : current;
            }
            return person.id;
          });
        const onClick = () => onNodeClick(person.id);

        if (!showThumbnail) {
          return (
            <AnimatedGroup key={person.id} position={nodePosition}>
              <PersonNodeFallback
                person={person}
                isSelected={isSelected}
                isHovered={isHovered}
                onClick={onClick}
                onHover={onHover}
              />
              {isSelected && showNodeActionButtons ? <NodeActionButtons onOpen={onNodeActionOpen} /> : null}
            </AnimatedGroup>
          );
        }

        return (
          <AnimatedGroup key={person.id} position={nodePosition}>
            <Suspense
              fallback={
                <PersonNodeFallback
                  person={person}
                  isSelected={isSelected}
                  isHovered={isHovered}
                  onClick={onClick}
                  onHover={onHover}
                />
              }
            >
              <PersonNode
                person={person}
                isSelected={isSelected}
                isHovered={isHovered}
                onClick={onClick}
                onHover={onHover}
              />
            </Suspense>
            {isSelected && showNodeActionButtons ? <NodeActionButtons onOpen={onNodeActionOpen} /> : null}
          </AnimatedGroup>
        );
      })}
    </Canvas>
  );
};
