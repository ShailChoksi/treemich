import { useEffect, useRef, useState } from "react";
import { PerspectiveCamera, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  searchRelationships,
  type ImmichPerson,
  type RelationshipRecord,
  type RelationshipType
} from "../lib/api";
import { type NodePosition } from "./graph/layout";
import { AddRelativePopup } from "./graph/AddRelativePopup";
import { useThumbnailLoader } from "./graph/useThumbnailLoader";
import { findPersonBySearchTerm, useGraphSearch } from "./graph/useGraphSearch";
import { useGraphCamera } from "./graph/useGraphCamera";
import { useGraphSelection } from "./graph/useGraphSelection";
import { GraphCanvasScene } from "./graph/GraphCanvasScene";
import { GraphSearchOverlay } from "./graph/GraphSearchOverlay";
import type { AddRelativeSlot } from "./graph/NodeActionButtons";
import { relationshipStyleByKind } from "./graph/relationshipStyles";
import { defaultFamilyViewStyle, type FamilyViewStyle } from "./graph/layout";
import { useGraphLayoutState } from "./graph/useGraphLayoutState";
import { useGraphCameraControls } from "./graph/useGraphCameraControls";
import { useGraphLifecycle } from "./graph/useGraphLifecycle";
import { GraphSurfaceOverlays } from "./graph/GraphSurfaceOverlays";
import { GraphFooterStatus } from "./graph/GraphFooterStatus";
import { ErrorBoundary } from "./ErrorBoundary";
import { GraphViewModeSelector } from "./graph/GraphViewModeSelector";

type Props = {
  people: ImmichPerson[];
  relationships: RelationshipRecord[];
  selectedPersonId: string | null;
  status: string | null;
  isLoading: boolean;
  isSavingRelationship: boolean;
  loadError: string | null;
  focusPersonRequest: string | null;
  onSelectedPersonChange?: (personId: string | null) => void;
  onCreateRelationship: (
    sourcePersonId: string,
    targetPersonId: string,
    relationshipType: RelationshipType
  ) => Promise<void>;
};

const DEFAULT_RENDER_LIMIT = 120;

type AddRelativeIntent = {
  slot: AddRelativeSlot;
  selectedPersonId: string;
};

export const PeopleGraph3D = ({
  people,
  relationships,
  selectedPersonId: parentSelectedPersonId,
  status,
  isLoading,
  isSavingRelationship,
  loadError,
  focusPersonRequest,
  onSelectedPersonChange,
  onCreateRelationship
}: Props) => {
  const [hoveredPersonId, setHoveredPersonId] = useState<string | null>(null);
  const [focusPersonId, setFocusPersonId] = useState<string | null>(null);
  const [pinnedPersonId, setPinnedPersonId] = useState<string | null>(null);
  const [cameraPosition, setCameraPosition] = useState<NodePosition>([0, 2, 18]);
  const [addRelativeIntent, setAddRelativeIntent] = useState<AddRelativeIntent | null>(null);
  const [familyViewStyle, setFamilyViewStyle] = useState<FamilyViewStyle>(defaultFamilyViewStyle);
  const lastCameraSampleRef = useRef(new Vector3(0, 2, 18));
  const hasInitializedCameraRef = useRef(false);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const orbitControlsRef = useRef<OrbitControlsImpl | null>(null);

  const { selectedPersonId, setSelectedPersonId, clearSelection, handleNodeClick } = useGraphSelection({
    selectedPersonId: parentSelectedPersonId,
    setFocusPersonId,
    setPinnedPersonId
  });
  const {
    selectedPerson,
    prioritizedNodeIds,
    displayVisiblePeople,
    visiblePositionsById,
    graphBounds,
    visibleRelationshipLines
  } = useGraphLayoutState({
    people,
    relationships,
    photoEdges: [],
    photoClusters: [],
    viewMode: "family",
    familyViewStyle,
    selectedPersonId,
    hoveredPersonId,
    focusPersonId,
    pinnedPersonId,
    renderLimit: DEFAULT_RENDER_LIMIT
  });
  const { thumbnailNodeIds } = useThumbnailLoader({
    peopleIds: people.map((person) => person.id),
    prioritizedNodeIds,
    displayVisiblePeople,
    cameraPosition
  });
  useGraphLifecycle({ thumbnailNodeIds, selectedPersonId, onSelectedPersonChange });

  const { searchTerm, setSearchTerm, searchFeedback, setSearchFeedback, highlightedPersonIds, clearHighlights, handleSearchSubmit } = useGraphSearch(
    {
      people,
      focusPersonRequest,
      setSelectedPersonId,
      setFocusPersonId,
      setPinnedPersonId,
      setHoveredPersonId,
      onSearchFallback: async (query) => {
        const response = await searchRelationships(query);
        const allMatches = response.matches ?? [];
        if (allMatches.length === 0) {
          return null;
        }

        const names = allMatches.map((m) => m.person.name);
        const feedback = `Found ${allMatches.length} result${allMatches.length === 1 ? "" : "s"}: ${names.join(", ")}`;
        return {
          matches: allMatches.map((m) => ({ personId: m.person.id, personName: m.person.name })),
          feedback: response.message ?? feedback
        };
      }
    }
  );
  const { frameAllNodes, focusActiveNode, topDownView } = useGraphCameraControls({
    graphBounds,
    visiblePositionsById,
    selectedPersonId,
    hoveredPersonId,
    focusPersonId,
    pinnedPersonId,
    familyViewStyle,
    cameraRef,
    orbitControlsRef,
    lastCameraSampleRef,
    setCameraPosition
  });

  useGraphCamera({ frameAllNodes, focusActiveNode, topDownView });

  useEffect(() => {
    if (hasInitializedCameraRef.current) {
      return;
    }

    frameAllNodes();
    hasInitializedCameraRef.current = true;
  }, [frameAllNodes]);

  useEffect(() => {
    if (selectedPersonId) {
      return;
    }
    setAddRelativeIntent(null);
  }, [selectedPersonId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (addRelativeIntent) {
        setAddRelativeIntent(null);
        return;
      }
      clearSelection();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addRelativeIntent, clearSelection]);

  const handleCanvasMissed = () => {
    if (addRelativeIntent) {
      return;
    }
    clearSelection();
    clearHighlights();
    setHoveredPersonId(null);
  };

  const handleOpenAddRelative = (slot: AddRelativeSlot) => {
    if (!selectedPersonId) {
      return;
    }
    setAddRelativeIntent({
      slot,
      selectedPersonId
    });
  };

  const handleAddRelative = async (personName: string, relationshipType?: RelationshipType) => {
    if (!addRelativeIntent) {
      throw new Error("Select a person first.");
    }

    const match = findPersonBySearchTerm(people, personName);
    if (!personName.trim()) {
      throw new Error("Type a person name.");
    }
    if (!match) {
      throw new Error(`No person found for "${personName}"`);
    }
    if (match.id === addRelativeIntent.selectedPersonId) {
      throw new Error("Choose a different person.");
    }

    let nextRelationshipType: RelationshipType;
    if (addRelativeIntent.slot === "parent") {
      nextRelationshipType = "CHILD_OF";
    } else if (addRelativeIntent.slot === "child") {
      nextRelationshipType = "PARENT_OF";
    } else {
      nextRelationshipType = relationshipType ?? "SIBLING_OF";
    }

    await onCreateRelationship(addRelativeIntent.selectedPersonId, match.id, nextRelationshipType);
    setAddRelativeIntent(null);
    setSearchFeedback(`Added ${match.name}`);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    setSearchFeedback(null);
    clearHighlights();
  };

  return (
    <section className="card graph-card">
      <div className="graph-surface">
        <GraphSearchOverlay
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          onSearchSubmit={handleSearchSubmit}
          onClearSearch={handleClearSearch}
          people={people}
          searchFeedback={searchFeedback}
        />
        <GraphViewModeSelector value={familyViewStyle} onChange={setFamilyViewStyle} />
        <GraphSurfaceOverlays isLoading={isLoading} loadError={loadError} />
        {addRelativeIntent && selectedPerson ? (
          <AddRelativePopup
            slot={addRelativeIntent.slot}
            selectedPersonName={selectedPerson.name}
            people={people}
            busy={isSavingRelationship}
            onCancel={() => setAddRelativeIntent(null)}
            onSubmit={handleAddRelative}
          />
        ) : null}
        <ErrorBoundary
          fallback={
            <div className="graph-overlay graph-overlay-error">
              <p>Graph rendering failed. Reload the page to recover WebGL rendering.</p>
            </div>
          }
        >
          <GraphCanvasScene
            displayVisiblePeople={displayVisiblePeople}
            visibleRelationshipLines={visibleRelationshipLines}
            relationshipStyleByKind={relationshipStyleByKind}
            selectedPersonId={selectedPersonId}
            showNodeActionButtons={!addRelativeIntent}
            hoveredPersonId={hoveredPersonId}
            highlightedPersonIds={highlightedPersonIds}
            thumbnailNodeIds={thumbnailNodeIds}
            setHoveredPersonId={setHoveredPersonId}
            onNodeClick={handleNodeClick}
            onNodeActionOpen={handleOpenAddRelative}
            onCanvasMissed={handleCanvasMissed}
            cameraRef={cameraRef}
            orbitControlsRef={orbitControlsRef}
            lastCameraSampleRef={lastCameraSampleRef}
            setCameraPosition={setCameraPosition}
          />
        </ErrorBoundary>
      </div>
      <GraphFooterStatus status={status} busy={isSavingRelationship} />
    </section>
  );
};
