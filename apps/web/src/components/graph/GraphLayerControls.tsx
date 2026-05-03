/**
 * @file Toggles for relationship categories and graph display options.
 */

import type { GraphFilter, GraphFilterVisibility } from "./relationshipStyles";
import { relationshipStyleByKind } from "./relationshipStyles";

type Props = {
  filterVisibility: GraphFilterVisibility;
  onToggleFilter: (filter: GraphFilter) => void;
};

const legendItems: Array<{ label: string; color: string; filter: GraphFilter }> = [
  { label: "Parent/Child", color: relationshipStyleByKind.PARENT_CHILD.color, filter: "parentChild" },
  { label: "Spouse", color: relationshipStyleByKind.SPOUSE.color, filter: "spouse" },
  { label: "Sibling", color: relationshipStyleByKind.SIBLING.color, filter: "sibling" },
  { label: "Friend", color: relationshipStyleByKind.FRIEND.color, filter: "friends" },
  { label: "Pet", color: relationshipStyleByKind.PET.color, filter: "pets" }
];

export const GraphLayerControls = ({ filterVisibility, onToggleFilter }: Props) => {
  return (
    <div className="graph-view-mode-selector">
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
            <span
              className="graph-edge-legend-swatch"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
};
