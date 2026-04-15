import type { FamilyViewStyle } from "./layout";

type Props = {
  value: FamilyViewStyle;
  onChange: (next: FamilyViewStyle) => void;
};

const options: Array<{ value: FamilyViewStyle; label: string }> = [
  { value: "generationTree", label: "Generation-based family tree" },
  { value: "centeredRelationshipMap", label: "Centered relationship map" },
  { value: "hybridTreeList", label: "Hybrid tree + list/search" },
  { value: "cleaned3D", label: "Current 3D graph (cleaned up)" }
];

export const GraphViewModeSelector = ({ value, onChange }: Props) => {
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
    </div>
  );
};
