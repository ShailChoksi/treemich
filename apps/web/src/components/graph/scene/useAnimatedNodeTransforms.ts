import { useEffect, useRef, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Vector3 } from "three";
import type { NodePosition } from "../layout";

type DisplayPositionEntry = {
  personId: string;
  displayPosition: NodePosition;
};

type UseAnimatedNodeTransformsOptions = {
  displayPositions: DisplayPositionEntry[];
};

export const useAnimatedNodeTransforms = ({ displayPositions }: UseAnimatedNodeTransformsOptions) => {
  const groupRefsByPersonIdRef = useRef(new Map<string, Group>());
  const targetPositionByPersonIdRef = useRef(new Map<string, Vector3>());

  useEffect(() => {
    const nextIds = new Set(displayPositions.map((entry) => entry.personId));

    for (const [personId] of targetPositionByPersonIdRef.current) {
      if (!nextIds.has(personId)) {
        targetPositionByPersonIdRef.current.delete(personId);
      }
    }
    for (const [personId] of groupRefsByPersonIdRef.current) {
      if (!nextIds.has(personId)) {
        groupRefsByPersonIdRef.current.delete(personId);
      }
    }

    for (const { personId, displayPosition } of displayPositions) {
      const target = targetPositionByPersonIdRef.current.get(personId);
      if (target) {
        target.set(displayPosition[0], displayPosition[1], displayPosition[2]);
      } else {
        targetPositionByPersonIdRef.current.set(
          personId,
          new Vector3(displayPosition[0], displayPosition[1], displayPosition[2])
        );
      }
    }
  }, [displayPositions]);

  useFrame((_, delta) => {
    const alpha = 1 - Math.exp(-delta * 9);
    for (const [personId, group] of groupRefsByPersonIdRef.current) {
      const target = targetPositionByPersonIdRef.current.get(personId);
      if (!target) {
        continue;
      }
      if (group.position.lengthSq() === 0) {
        group.position.copy(target);
        continue;
      }
      group.position.lerp(target, alpha);
    }
  });

  const registerGroupRef = useCallback((personId: string, group: Group | null) => {
    if (!group) {
      groupRefsByPersonIdRef.current.delete(personId);
      return;
    }
    groupRefsByPersonIdRef.current.set(personId, group);
  }, []);

  return {
    registerGroupRef
  };
};
