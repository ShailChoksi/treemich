/**
 * @file Three.js scene layer: AnimatedNodes.tsx.
 */

import { Suspense, useEffect, useMemo } from "react";
import type { Texture } from "three";
import type { Person } from "../../../lib/api";
import { useGraphScene } from "../GraphSceneContext";
import { NodeActionButtons, type AddRelativeSlot } from "../NodeActionButtons";
import { PersonNode, PersonNodeFallback, PersonNodeMinimal } from "../PersonNode";
import type { NodePosition } from "../layout";
import { logThumbnailRenderProfile } from "../thumbnailPerfProfiler";
import { NodeInstancedMesh, type NodeRenderTier } from "./NodeInstancedMesh";
import { useAnimatedNodeTransforms } from "./useAnimatedNodeTransforms";
import {
  resolveNodeRenderTier,
  shouldShowNodeLabel,
  shouldRenderInstancedVisualForNode,
  shouldUseLargeGraphTier
} from "./graphRenderTiers";

export {
  resolveNodeRenderTier,
  shouldRenderDetailedNode,
  shouldRenderInstancedVisualForNode,
  shouldShowNodeLabel,
  shouldUseLargeGraphTier
} from "./graphRenderTiers";

type DisplayPerson = {
  person: Person;
  displayPosition: NodePosition;
};

type Props = {
  displayVisiblePeople: DisplayPerson[];
  selectedPersonId: string | null;
  showNodeActionButtons: boolean;
  hoveredPersonId: string | null;
  highlightedPersonIds: Set<string>;
  thumbnailNodeIds: Set<string>;
  thumbnailTextures: Map<string, Texture>;
  onNodeClick: (personId: string, event: { stopPropagation: () => void }) => void;
  onNodeHover: (personId: string, hovered: boolean) => void;
  onNodeActionOpen: (slot: AddRelativeSlot) => void;
};

export const AnimatedNodes = ({
  displayVisiblePeople,
  selectedPersonId,
  showNodeActionButtons,
  hoveredPersonId,
  highlightedPersonIds,
  thumbnailNodeIds,
  thumbnailTextures,
  onNodeClick,
  onNodeHover,
  onNodeActionOpen
}: Props) => {
  const { prioritizedNodeIds, renderVisibilityBucketByPersonId } = useGraphScene();
  const largeGraphTierEnabled = shouldUseLargeGraphTier(displayVisiblePeople.length);
  const displayPositions = useMemo(
    () =>
      displayVisiblePeople.map(({ person, displayPosition }) => ({
        personId: person.id,
        displayPosition
      })),
    [displayVisiblePeople]
  );
  const { currentPositionByPersonIdRef, registerGroupRef } = useAnimatedNodeTransforms({
    displayPositions,
    prioritizedPersonIds: prioritizedNodeIds,
    reduceWorkForLargeGraph: largeGraphTierEnabled
  });
  const peopleByTier = useMemo(() => {
    const next: Record<NodeRenderTier, DisplayPerson[]> = {
      detailed: [],
      thumbnail: [],
      minimal: []
    };
    for (const item of displayVisiblePeople) {
      const isSelected = selectedPersonId === item.person.id;
      const isHovered = hoveredPersonId === item.person.id;
      const isHighlighted = highlightedPersonIds.has(item.person.id);
      const isPriorityNode =
        isSelected || isHovered || isHighlighted || prioritizedNodeIds.has(item.person.id);
      const visibilityBucket = renderVisibilityBucketByPersonId.get(item.person.id) ?? "near";
      const hasThumbnail = thumbnailNodeIds.has(item.person.id);
      if (!shouldRenderInstancedVisualForNode({ hasThumbnail })) {
        continue;
      }
      const renderTier = resolveNodeRenderTier({
        visibilityBucket,
        isPriorityNode,
        largeGraphTierEnabled,
        hasThumbnail
      });
      next[renderTier].push(item);
    }
    return next;
  }, [
    displayVisiblePeople,
    highlightedPersonIds,
    hoveredPersonId,
    largeGraphTierEnabled,
    prioritizedNodeIds,
    selectedPersonId,
    renderVisibilityBucketByPersonId,
    thumbnailNodeIds
  ]);

  useEffect(() => {
    let nearBucketCount = 0;
    let midBucketCount = 0;
    let farBucketCount = 0;
    let culledBucketCount = 0;
    for (const item of displayVisiblePeople) {
      const bucket = renderVisibilityBucketByPersonId.get(item.person.id) ?? "near";
      if (bucket === "near") {
        nearBucketCount += 1;
      } else if (bucket === "mid") {
        midBucketCount += 1;
      } else if (bucket === "far") {
        farBucketCount += 1;
      } else {
        culledBucketCount += 1;
      }
    }
    logThumbnailRenderProfile({
      visiblePeopleCount: displayVisiblePeople.length,
      detailedNodeCount: peopleByTier.detailed.length,
      thumbnailTierNodeCount: peopleByTier.thumbnail.length,
      minimalNodeCount: peopleByTier.minimal.length,
      visibleThumbnailNodeCount: thumbnailNodeIds.size,
      nearBucketCount,
      midBucketCount,
      farBucketCount,
      culledBucketCount
    });
  }, [displayVisiblePeople, peopleByTier, renderVisibilityBucketByPersonId, thumbnailNodeIds.size]);

  return (
    <>
      <NodeInstancedMesh
        people={peopleByTier.detailed}
        currentPositionByPersonIdRef={currentPositionByPersonIdRef}
        selectedPersonId={selectedPersonId}
        hoveredPersonId={hoveredPersonId}
        highlightedPersonIds={highlightedPersonIds}
        tier="detailed"
      />
      <NodeInstancedMesh
        people={peopleByTier.thumbnail}
        currentPositionByPersonIdRef={currentPositionByPersonIdRef}
        selectedPersonId={selectedPersonId}
        hoveredPersonId={hoveredPersonId}
        highlightedPersonIds={highlightedPersonIds}
        tier="thumbnail"
      />
      <NodeInstancedMesh
        people={peopleByTier.minimal}
        currentPositionByPersonIdRef={currentPositionByPersonIdRef}
        selectedPersonId={selectedPersonId}
        hoveredPersonId={hoveredPersonId}
        highlightedPersonIds={highlightedPersonIds}
        tier="minimal"
      />
      {displayVisiblePeople.map(({ person }) => {
        const isSelected = selectedPersonId === person.id;
        const isHovered = hoveredPersonId === person.id;
        const isHighlighted = highlightedPersonIds.has(person.id);
        const isPriorityNode = isSelected || isHovered || isHighlighted || prioritizedNodeIds.has(person.id);
        const visibilityBucket = renderVisibilityBucketByPersonId.get(person.id) ?? "near";
        const showThumbnail = thumbnailNodeIds.has(person.id);
        const renderTier = resolveNodeRenderTier({
          visibilityBucket,
          isPriorityNode,
          largeGraphTierEnabled,
          hasThumbnail: showThumbnail
        });
        const showLabel = shouldShowNodeLabel({ visibilityBucket, isPriorityNode });

        return (
          <group key={person.id} ref={(group) => registerGroupRef(person.id, group)}>
            {renderTier === "minimal" ? (
              <PersonNodeMinimal
                person={person}
                isSelected={isSelected}
                isHovered={isHovered}
                isHighlighted={isHighlighted}
                showLabel={showLabel}
                instancedVisuals
                onClick={onNodeClick}
                onHover={onNodeHover}
              />
            ) : (renderTier === "detailed" || renderTier === "thumbnail") && showThumbnail ? (
              <Suspense
                fallback={
                  <PersonNodeFallback
                    person={person}
                    isSelected={isSelected}
                    isHovered={isHovered}
                    isHighlighted={isHighlighted}
                    showLabel={showLabel}
                    instancedVisuals
                    onClick={onNodeClick}
                    onHover={onNodeHover}
                  />
                }
              >
                <PersonNode
                  person={person}
                  isSelected={isSelected}
                  isHovered={isHovered}
                  isHighlighted={isHighlighted}
                  showLabel={showLabel}
                  preloadedTexture={thumbnailTextures.get(person.id)}
                  instancedVisuals
                  onClick={onNodeClick}
                  onHover={onNodeHover}
                />
              </Suspense>
            ) : (
              <PersonNodeFallback
                person={person}
                isSelected={isSelected}
                isHovered={isHovered}
                isHighlighted={isHighlighted}
                showLabel={showLabel}
                instancedVisuals
                onClick={onNodeClick}
                onHover={onNodeHover}
              />
            )}
            {isSelected && showNodeActionButtons ? <NodeActionButtons onOpen={onNodeActionOpen} /> : null}
          </group>
        );
      })}
    </>
  );
};
