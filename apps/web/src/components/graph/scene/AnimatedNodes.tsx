/**
 * @file Three.js scene layer: AnimatedNodes.tsx.
 */

import { Suspense, useMemo } from "react";
import type { Texture } from "three";
import type { Person } from "../../../lib/api";
import { NodeActionButtons, type AddRelativeSlot } from "../NodeActionButtons";
import type { GraphVisibilityBucket } from "../graphVisibility";
import { PersonNode, PersonNodeFallback, PersonNodeMinimal } from "../PersonNode";
import type { NodePosition } from "../layout";
import { NodeInstancedMesh, type NodeRenderTier } from "./NodeInstancedMesh";
import { useAnimatedNodeTransforms } from "./useAnimatedNodeTransforms";

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
  prioritizedNodeIds: Set<string>;
  visibilityBucketByPersonId: Map<string, GraphVisibilityBucket>;
  onNodeClick: (personId: string, event: { stopPropagation: () => void }) => void;
  onNodeHover: (personId: string, hovered: boolean) => void;
  onNodeActionOpen: (slot: AddRelativeSlot) => void;
};

const LARGE_GRAPH_NODE_THRESHOLD = 280;

export const shouldUseLargeGraphTier = (visiblePeopleCount: number) =>
  visiblePeopleCount >= LARGE_GRAPH_NODE_THRESHOLD;

export const shouldRenderDetailedNode = ({
  largeGraphTierEnabled,
  isPriorityNode,
  visibilityBucket = "near"
}: {
  largeGraphTierEnabled: boolean;
  isPriorityNode: boolean;
  visibilityBucket?: GraphVisibilityBucket;
}) =>
  (!largeGraphTierEnabled || isPriorityNode) && visibilityBucket !== "far" && visibilityBucket !== "culled";

const resolveNodeRenderTier = ({
  visibilityBucket,
  isPriorityNode,
  largeGraphTierEnabled
}: {
  visibilityBucket: GraphVisibilityBucket;
  isPriorityNode: boolean;
  largeGraphTierEnabled: boolean;
}) => {
  if (isPriorityNode) {
    return "detailed" as const;
  }
  if (visibilityBucket === "culled") {
    return "minimal" as const;
  }
  if (visibilityBucket === "mid" || visibilityBucket === "far") {
    return "thumbnail" as const;
  }
  return shouldRenderDetailedNode({
    largeGraphTierEnabled,
    isPriorityNode,
    visibilityBucket
  })
    ? ("detailed" as const)
    : ("minimal" as const);
};

export const AnimatedNodes = ({
  displayVisiblePeople,
  selectedPersonId,
  showNodeActionButtons,
  hoveredPersonId,
  highlightedPersonIds,
  thumbnailNodeIds,
  thumbnailTextures,
  prioritizedNodeIds,
  visibilityBucketByPersonId,
  onNodeClick,
  onNodeHover,
  onNodeActionOpen
}: Props) => {
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
      const visibilityBucket = visibilityBucketByPersonId.get(item.person.id) ?? "near";
      const renderTier = resolveNodeRenderTier({
        visibilityBucket,
        isPriorityNode,
        largeGraphTierEnabled
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
    visibilityBucketByPersonId
  ]);

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
        const visibilityBucket = visibilityBucketByPersonId.get(person.id) ?? "near";
        const renderTier = resolveNodeRenderTier({
          visibilityBucket,
          isPriorityNode,
          largeGraphTierEnabled
        });
        const showLabel = isPriorityNode || visibilityBucket === "near" || visibilityBucket === "mid";
        const showThumbnail = thumbnailNodeIds.has(person.id);

        return (
          <group key={person.id} ref={(group) => registerGroupRef(person.id, group)}>
            {renderTier === "minimal" ? (
              <PersonNodeMinimal
                person={person}
                isSelected={isSelected}
                isHovered={isHovered}
                isHighlighted={isHighlighted}
                showLabel={false}
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
