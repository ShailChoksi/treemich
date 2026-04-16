import { Suspense, useMemo } from "react";
import type { ImmichPerson } from "../../../lib/api";
import { NodeActionButtons, type AddRelativeSlot } from "../NodeActionButtons";
import { PersonNode, PersonNodeFallback } from "../PersonNode";
import type { NodePosition } from "../layout";
import { useAnimatedNodeTransforms } from "./useAnimatedNodeTransforms";

type DisplayPerson = {
  person: ImmichPerson;
  displayPosition: NodePosition;
};

type Props = {
  displayVisiblePeople: DisplayPerson[];
  selectedPersonId: string | null;
  showNodeActionButtons: boolean;
  hoveredPersonId: string | null;
  highlightedPersonIds: Set<string>;
  thumbnailNodeIds: Set<string>;
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
  onNodeClick,
  onNodeHover,
  onNodeActionOpen
}: Props) => {
  const displayPositions = useMemo(
    () =>
      displayVisiblePeople.map(({ person, displayPosition }) => ({
        personId: person.id,
        displayPosition
      })),
    [displayVisiblePeople]
  );
  const { registerGroupRef } = useAnimatedNodeTransforms({
    displayPositions
  });

  return (
    <>
      {displayVisiblePeople.map(({ person }) => {
        const isSelected = selectedPersonId === person.id;
        const isHovered = hoveredPersonId === person.id;
        const isHighlighted = highlightedPersonIds.has(person.id);
        const showThumbnail = thumbnailNodeIds.has(person.id);

        return (
          <group key={person.id} ref={(group) => registerGroupRef(person.id, group)}>
            {showThumbnail ? (
              <Suspense
                fallback={
                  <PersonNodeFallback
                    person={person}
                    isSelected={isSelected}
                    isHovered={isHovered}
                    isHighlighted={isHighlighted}
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
