import type { FamilyViewStyle } from "./layout";
import type { GraphFilter, GraphFilterVisibility } from "./relationshipStyles";
import { relationshipStyleByKind } from "./relationshipStyles";

type Props = {
  value: FamilyViewStyle;
  onChange: (next: FamilyViewStyle) => void;
  filterVisibility: GraphFilterVisibility;
  onToggleFilter: (filter: GraphFilter) => void;
};

const options: Array<{ value: FamilyViewStyle; label: string }> = [
  { value: "generationTree", label: "Generation-based family tree" },
  { value: "centeredRelationshipMap", label: "Centered relationship map" },
  { value: "hybridTreeList", label: "Hybrid tree + list/search" },
  { value: "cleaned3D", label: "Current 3D graph (cleaned up)" }
];

const legendItems: Array<{ label: string; color: string; filter: GraphFilter }> = [
  { label: "Parent/Child", color: relationshipStyleByKind.PARENT_CHILD.color, filter: "parentChild" },
  { label: "Spouse", color: relationshipStyleByKind.SPOUSE.color, filter: "spouse" },
  { label: "Sibling", color: relationshipStyleByKind.SIBLING.color, filter: "sibling" },
  { label: "Friend", color: relationshipStyleByKind.FRIEND.color, filter: "friends" },
  { label: "Pet", color: relationshipStyleByKind.PET.color, filter: "pets" }
];

export const GraphViewModeSelector = ({ value, onChange, filterVisibility, onToggleFilter }: Props) => {
  return (
    <div className="graph-view-mode-selector">
      <label htmlFor="graph-view-mode-select">View style</label>
      <select
        id="graph-view-mode-select"
        value={value}
        onChange={(event) => onChange(event.target.value as FamilyViewStyle)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="graph-layer-toggles" role="group" aria-label="Graph layer filters">
        <label>
          <input
            type="checkbox"
            checked={filterVisibility.parentChild}
            onChange={() => onToggleFilter("parentChild")}
          />
          Parent/Child
        </label>
        <label>
          <input
            type="checkbox"
            checked={filterVisibility.spouse}
            onChange={() => onToggleFilter("spouse")}
          />
          Spouse
        </label>
        <label>
          <input
            type="checkbox"
            checked={filterVisibility.sibling}
            onChange={() => onToggleFilter("sibling")}
          />
          Sibling
        </label>
        <label>
          <input
            type="checkbox"
            checked={filterVisibility.friends}
            onChange={() => onToggleFilter("friends")}
          />
          Friends
        </label>
        <label>
          <input type="checkbox" checked={filterVisibility.pets} onChange={() => onToggleFilter("pets")} />
          Pets
        </label>
      </div>
      <div className="graph-edge-legend" role="list" aria-label="Relationship color legend">
        {legendItems.map((item) => (
          <span
            key={item.label}
            className={`graph-edge-legend-item ${filterVisibility[item.filter] ? "" : "graph-edge-legend-item-off"}`}
            role="listitem"
          >
            <span className="graph-edge-legend-swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
};
