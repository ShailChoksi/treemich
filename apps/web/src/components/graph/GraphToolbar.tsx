import type { RelationshipType } from "../../lib/api";

export type GraphViewMode = "family" | "photo";

type Props = {
  renderLimit: number;
  onRenderLimitChange: (value: number) => void;
  viewMode: GraphViewMode;
  onViewModeChange: (value: GraphViewMode) => void;
  minSharedPhotos: number;
  onMinSharedPhotosChange: (value: number) => void;
  minScore: number;
  onMinScoreChange: (value: number) => void;
  selectedName: string | null;
  targetName: string | null;
  onClearSelection: () => void;
  onFrameAll: () => void;
  onFocusActive: () => void;
  onTopView: () => void;
  hasVisibleNodes: boolean;
  sourcePersonId: string | null;
  targetPersonId: string | null;
  selectedRelationshipTypes: RelationshipType[];
  relationshipType: RelationshipType;
  relationshipOptions: RelationshipType[];
  onRelationshipTypeChange: (value: string) => void;
  onSaveRelationship: () => void;
  onDeleteRelationship: () => void;
  busy: boolean;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onSearchSubmit: (event: React.FormEvent) => void;
  onResetView: () => void;
  people: Array<{ id: string; name: string }>;
  searchFeedback: string | null;
};

const relationshipTypeLabel: Record<RelationshipType, string> = {
  PARENT_OF: "Parent of",
  CHILD_OF: "Child of",
  SPOUSE_OF: "Spouse of",
  SIBLING_OF: "Sibling of"
};

export const GraphToolbar = ({
  renderLimit,
  onRenderLimitChange,
  viewMode,
  onViewModeChange,
  minSharedPhotos,
  onMinSharedPhotosChange,
  minScore,
  onMinScoreChange,
  selectedName,
  targetName,
  onClearSelection,
  onFrameAll,
  onFocusActive,
  onTopView,
  hasVisibleNodes,
  sourcePersonId,
  targetPersonId,
  selectedRelationshipTypes,
  relationshipType,
  relationshipOptions,
  onRelationshipTypeChange,
  onSaveRelationship,
  onDeleteRelationship,
  busy,
  searchTerm,
  onSearchTermChange,
  onSearchSubmit,
  onResetView,
  people,
  searchFeedback
}: Props) => {
  return (
    <>
      <div className="graph-toolbar">
        <label className="graph-range">
          Visible nodes: {renderLimit}
          <input
            type="range"
            min={40}
            max={240}
            step={20}
            value={renderLimit}
            onChange={(event) => onRenderLimitChange(Number(event.target.value))}
          />
        </label>
        <label>
          Mode
          <select value={viewMode} onChange={(event) => onViewModeChange(event.target.value as GraphViewMode)}>
            <option value="family">Family</option>
            <option value="photo">Photo co-occurrence</option>
          </select>
        </label>
        <label>
          Min shared photos
          <input
            type="number"
            min={1}
            max={1000}
            value={minSharedPhotos}
            disabled={viewMode !== "photo"}
            onChange={(event) => onMinSharedPhotosChange(Number(event.target.value))}
          />
        </label>
        <label>
          Min score
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={minScore}
            disabled={viewMode !== "photo"}
            onChange={(event) => onMinScoreChange(Number(event.target.value))}
          />
        </label>
        {selectedName ? <span>Source: {selectedName}</span> : <span>Source: none</span>}
        {targetName ? <span>Target: {targetName}</span> : <span>Target: none</span>}
        <button type="button" onClick={onClearSelection}>
          Clear selection
        </button>
        <button type="button" onClick={onFrameAll} disabled={!hasVisibleNodes}>
          Frame all
        </button>
        <button type="button" onClick={onFocusActive} disabled={!hasVisibleNodes}>
          Focus active
        </button>
        <button type="button" onClick={onTopView} disabled={!hasVisibleNodes}>
          Top view
        </button>
      </div>
      {sourcePersonId && targetPersonId ? (
        <div className="graph-toolbar relation-actions">
          <span>
            Link ready: {selectedName ?? sourcePersonId} → {targetName ?? targetPersonId}
          </span>
          <select value={relationshipType} onChange={(event) => onRelationshipTypeChange(event.target.value)}>
            {relationshipOptions.map((option) => (
              <option key={option} value={option}>
                {relationshipTypeLabel[option]}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy} onClick={onSaveRelationship}>
            Save relationship
          </button>
          {selectedRelationshipTypes.length > 0 ? (
            <span>Existing: {selectedRelationshipTypes.map((type) => relationshipTypeLabel[type]).join(", ")}</span>
          ) : (
            <span>Existing: none</span>
          )}
          <button type="button" disabled={busy || selectedRelationshipTypes.length === 0} onClick={onDeleteRelationship}>
            Delete relationship link
          </button>
        </div>
      ) : null}
      <form className="graph-search" onSubmit={onSearchSubmit}>
        <input
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder="Search person name"
          list="people-name-options"
        />
        <datalist id="people-name-options">
          {people.map((person) => (
            <option key={person.id} value={person.name} />
          ))}
        </datalist>
        <button type="submit">Find in 3D</button>
        <button type="button" onClick={onResetView}>
          Reset view
        </button>
      </form>
      {searchFeedback ? (
        <p className="hint" aria-live="polite">
          {searchFeedback}
        </p>
      ) : null}
    </>
  );
};
