/**
 * @file Instanced disk/ring geometry for graph person nodes.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import {
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  RingGeometry,
  Vector3
} from "three";
import type { Person } from "../../../lib/api";
import type { NodePosition } from "../layout";
import { instancedNodeLayerZ } from "./nodeInstancedMeshConstants";

export { instancedNodeLayerZ } from "./nodeInstancedMeshConstants";

export type NodeRenderTier = "detailed" | "thumbnail" | "minimal";

type DisplayPerson = {
  person: Person;
  displayPosition: NodePosition;
};

type Props = {
  people: DisplayPerson[];
  currentPositionByPersonIdRef: MutableRefObject<Map<string, Vector3>>;
  selectedPersonId: string | null;
  hoveredPersonId: string | null;
  highlightedPersonIds: Set<string>;
  tier: NodeRenderTier;
};

const tierGeometryConfig = {
  detailed: {
    diskRadius: 0.72,
    diskSegments: 20,
    ringInnerRadius: 0.755,
    ringOuterRadius: 0.79,
    ringSegments: 20
  },
  thumbnail: {
    diskRadius: 0.72,
    diskSegments: 16,
    ringInnerRadius: 0.755,
    ringOuterRadius: 0.79,
    ringSegments: 16
  },
  minimal: {
    diskRadius: 0.56,
    diskSegments: 12,
    ringInnerRadius: 0.58,
    ringOuterRadius: 0.64,
    ringSegments: 12
  }
} as const;

const colorForState = ({
  isSelected,
  isHovered,
  isHighlighted
}: {
  isSelected: boolean;
  isHovered: boolean;
  isHighlighted: boolean;
}) => {
  if (isSelected) {
    return "#22d3ee";
  }
  if (isHighlighted) {
    return "#a78bfa";
  }
  if (isHovered) {
    return "#93c5fd";
  }
  return "#64748b";
};

const scaleForState = ({
  isSelected,
  isHovered,
  isHighlighted
}: {
  isSelected: boolean;
  isHovered: boolean;
  isHighlighted: boolean;
}) => {
  if (isSelected) return 1.08;
  if (isHighlighted) return 0.9;
  if (isHovered) return 0.86;
  return 0.82;
};

export const NodeInstancedMesh = ({
  people,
  currentPositionByPersonIdRef,
  selectedPersonId,
  hoveredPersonId,
  highlightedPersonIds,
  tier
}: Props) => {
  const camera = useThree((state) => state.camera);
  const diskRef = useRef<InstancedMesh>(null);
  const ringRef = useRef<InstancedMesh>(null);
  const matrix = useMemo(() => new Matrix4(), []);
  const matrixObject = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  const scaleVector = useMemo(() => new Vector3(), []);
  const config = tierGeometryConfig[tier];
  const instanceCount = Math.max(people.length, 1);
  const geometries = useMemo(
    () => ({
      disk: new CircleGeometry(config.diskRadius, config.diskSegments),
      ring: new RingGeometry(config.ringInnerRadius, config.ringOuterRadius, config.ringSegments)
    }),
    [
      config.diskRadius,
      config.diskSegments,
      config.ringInnerRadius,
      config.ringOuterRadius,
      config.ringSegments
    ]
  );
  const materials = useMemo(
    () => ({
      disk: new MeshBasicMaterial({ color: "#64748b", vertexColors: true }),
      ring: new MeshBasicMaterial({ color: "#64748b", vertexColors: true })
    }),
    []
  );

  useEffect(() => {
    diskRef.current?.instanceMatrix.setUsage(DynamicDrawUsage);
    ringRef.current?.instanceMatrix.setUsage(DynamicDrawUsage);
  }, []);

  useEffect(
    () => () => {
      geometries.disk.dispose();
      geometries.ring.dispose();
      materials.disk.dispose();
      materials.ring.dispose();
    },
    [geometries, materials]
  );

  useFrame(() => {
    const disk = diskRef.current;
    const ring = ringRef.current;
    if (!disk || !ring) {
      return;
    }
    disk.count = people.length;
    ring.count = people.length;
    for (let index = 0; index < people.length; index += 1) {
      const entry = people[index];
      if (!entry) {
        continue;
      }
      const isSelected = selectedPersonId === entry.person.id;
      const isHovered = hoveredPersonId === entry.person.id;
      const isHighlighted = highlightedPersonIds.has(entry.person.id);
      const scale = scaleForState({ isSelected, isHovered, isHighlighted });
      const currentPosition = currentPositionByPersonIdRef.current.get(entry.person.id);
      const resetMatrixObjectPosition = () => {
        if (currentPosition) {
          matrixObject.position.copy(currentPosition);
        } else {
          matrixObject.position.set(...entry.displayPosition);
        }
      };
      resetMatrixObjectPosition();
      matrixObject.quaternion.copy(camera.quaternion);
      scaleVector.set(scale, scale, scale);
      matrixObject.scale.copy(scaleVector);
      matrixObject.translateZ(instancedNodeLayerZ.disk);
      matrixObject.updateMatrix();
      matrix.copy(matrixObject.matrix);
      disk.setMatrixAt(index, matrix);
      resetMatrixObjectPosition();
      matrixObject.quaternion.copy(camera.quaternion);
      matrixObject.scale.copy(scaleVector);
      matrixObject.translateZ(instancedNodeLayerZ.ring);
      matrixObject.updateMatrix();
      matrix.copy(matrixObject.matrix);
      ring.setMatrixAt(index, matrix);
      color.set(colorForState({ isSelected, isHovered, isHighlighted }));
      disk.setColorAt(index, color);
      ring.setColorAt(index, color);
    }
    disk.instanceMatrix.needsUpdate = true;
    ring.instanceMatrix.needsUpdate = true;
    if (disk.instanceColor) {
      disk.instanceColor.needsUpdate = true;
    }
    if (ring.instanceColor) {
      ring.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh
        ref={diskRef}
        args={[geometries.disk, materials.disk, instanceCount]}
        raycast={() => null}
      />
      <instancedMesh
        ref={ringRef}
        args={[geometries.ring, materials.ring, instanceCount]}
        raycast={() => null}
      />
    </>
  );
};
