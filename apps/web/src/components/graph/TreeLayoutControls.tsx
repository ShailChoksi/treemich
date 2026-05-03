/**
 * @file Tree layout spacing controls for the family graph.
 */

import {
  defaultTreeLayoutPreferences,
  maxTreeLayoutPreference,
  minTreeLayoutPreference,
  type ResolvedTreeLayoutPreferences
} from "@treemich/shared";
import { useState } from "react";

type TreeLayoutPreferenceKey = keyof ResolvedTreeLayoutPreferences;

type Props = {
  value: ResolvedTreeLayoutPreferences;
  onPreferenceChange: (key: TreeLayoutPreferenceKey, value: number) => void;
  onPreferenceReset: (key: TreeLayoutPreferenceKey) => void;
  disabled?: boolean;
  disabledReason?: string;
};

const sliderStep = 0.05;

const controls: Array<{
  key: TreeLayoutPreferenceKey;
  label: string;
  hint: string;
}> = [
  {
    key: "horizontalSpacing",
    label: "Horizontal spacing",
    hint: "Lower is tighter; higher spreads branches left and right."
  },
  {
    key: "verticalSpacing",
    label: "Vertical spacing",
    hint: "Lower is tighter; higher spreads generations up and down."
  },
  {
    key: "spouseBranchZDistance",
    label: "Spouse Z distance",
    hint: "Controls how far rotated spouse-side trees sit in depth."
  },
  {
    key: "spouseBranchSensitivity",
    label: "Spouse Z branch sensitivity",
    hint: "Higher rotates more uneven spouse-side branches into Z."
  }
];

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

export const TreeLayoutControls = ({
  value,
  onPreferenceChange,
  onPreferenceReset,
  disabled = false,
  disabledReason
}: Props) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={`tree-layout-controls ${isExpanded ? "tree-layout-controls-expanded" : "tree-layout-controls-collapsed"}`}
      role="group"
      aria-label="Tree layout controls"
    >
      <button
        type="button"
        className="tree-layout-controls-toggle"
        aria-label={isExpanded ? "Collapse tree layout controls" : "Expand tree layout controls"}
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span>Tree layout</span>
        <span aria-hidden="true">{isExpanded ? "Hide" : "Show"}</span>
      </button>
      {isExpanded ? (
        <>
          <div className="tree-layout-controls-header">
            {disabled && disabledReason ? <span>{disabledReason}</span> : null}
          </div>
          {controls.map((control) => {
            const currentValue = value[control.key];
            const resetDisabled = disabled || currentValue === defaultTreeLayoutPreferences[control.key];
            return (
              <div className="tree-layout-control" key={control.key}>
                <label>
                  <span>
                    {control.label}
                    <small>{control.hint}</small>
                  </span>
                  <output>{formatPercent(currentValue)}</output>
                  <input
                    aria-label={control.label}
                    type="range"
                    min={minTreeLayoutPreference}
                    max={maxTreeLayoutPreference}
                    step={sliderStep}
                    value={currentValue}
                    disabled={disabled}
                    onInput={(event) => onPreferenceChange(control.key, Number(event.currentTarget.value))}
                    onChange={(event) => onPreferenceChange(control.key, Number(event.currentTarget.value))}
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Reset ${control.label}`}
                  disabled={resetDisabled}
                  onClick={() => onPreferenceReset(control.key)}
                >
                  Reset
                </button>
              </div>
            );
          })}
        </>
      ) : null}
    </div>
  );
};
