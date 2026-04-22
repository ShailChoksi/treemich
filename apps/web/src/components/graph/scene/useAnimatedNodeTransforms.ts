/**
 * @file Three.js scene layer: useAnimatedNodeTransforms.ts.
 */

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
  prioritizedPersonIds?: Set<string>;
  reduceWorkForLargeGraph?: boolean;
};

export const shouldSkipNodeAnimationFrame = ({
  reduceWorkForLargeGraph,
  isPriorityNode,
  frameTick
}: {
  reduceWorkForLargeGraph: boolean;
  isPriorityNode: boolean;
  frameTick: number;
}) => reduceWorkForLargeGraph && !isPriorityNode && frameTick % 2 !== 0;

export const useAnimatedNodeTransforms = ({
  displayPositions,
  prioritizedPersonIds,
  reduceWorkForLargeGraph = false
}: UseAnimatedNodeTransformsOptions) => {
  const groupRefsByPersonIdRef = useRef(new Map<string, Group>());
  const targetPositionByPersonIdRef = useRef(new Map<string, Vector3>());
  const frameTickRef = useRef(0);

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
    frameTickRef.current += 1;
    const frameTick = frameTickRef.current;
    const alpha = 1 - Math.exp(-delta * 9);
    const snappedDistanceSq = 0.000064;
    for (const [personId, group] of groupRefsByPersonIdRef.current) {
      const target = targetPositionByPersonIdRef.current.get(personId);
      if (!target) {
        continue;
      }
      const isPriorityNode = prioritizedPersonIds?.has(personId) ?? false;
      if (
        shouldSkipNodeAnimationFrame({
          reduceWorkForLargeGraph,
          isPriorityNode,
          frameTick
        })
      ) {
        continue;
      }
      if (group.position.lengthSq() === 0) {
        group.position.copy(target);
        continue;
      }
      const distanceSq = group.position.distanceToSquared(target);
      if (distanceSq <= snappedDistanceSq) {
        if (distanceSq > 0) {
          group.position.copy(target);
        }
        continue;
      }
      const appliedAlpha = reduceWorkForLargeGraph && !isPriorityNode ? Math.min(alpha, 0.22) : alpha;
      group.position.lerp(target, appliedAlpha);
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
