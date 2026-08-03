/**
 * @file Focus depths and lock controls shown next to selection when Focus mode is on.
 */

import {
  maxFocusBloodlineDepth,
  maxFocusCollateralDepth,
  minFocusBloodlineDepth,
  minFocusCollateralDepth
} from "@treemich/shared";

type Props = {
  ancestorDepth: number;
  descendantDepth: number;
  collateralDepth: number;
  locked: boolean;
  lockedAnchorLabel: string | null;
  onAncestorDepthChange: (value: number) => void;
  onDescendantDepthChange: (value: number) => void;
  onCollateralDepthChange: (value: number) => void;
  onToggleLock: () => void;
};

const DepthStepper = ({
  label,
  value,
  min,
  max,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) => (
  <label className="graph-focus-depth-stepper">
    <span>{label}</span>
    <span className="graph-focus-depth-stepper-controls">
      <button type="button" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`${label} decrease`}>
        −
      </button>
      <strong aria-live="polite">{value}</strong>
      <button type="button" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`${label} increase`}>
        +
      </button>
    </span>
  </label>
);

export const FocusSelectionChrome = ({
  ancestorDepth,
  descendantDepth,
  collateralDepth,
  locked,
  lockedAnchorLabel,
  onAncestorDepthChange,
  onDescendantDepthChange,
  onCollateralDepthChange,
  onToggleLock
}: Props) => (
  <div className="graph-focus-selection-chrome" role="group" aria-label="Focus mode depths">
    <DepthStepper
      label="Up"
      value={ancestorDepth}
      min={minFocusBloodlineDepth}
      max={maxFocusBloodlineDepth}
      onChange={onAncestorDepthChange}
    />
    <DepthStepper
      label="Down"
      value={descendantDepth}
      min={minFocusBloodlineDepth}
      max={maxFocusBloodlineDepth}
      onChange={onDescendantDepthChange}
    />
    <DepthStepper
      label="Collateral"
      value={collateralDepth}
      min={minFocusCollateralDepth}
      max={maxFocusCollateralDepth}
      onChange={onCollateralDepthChange}
    />
    <button
      type="button"
      className={locked ? "secondary-button graph-focus-lock-on" : "secondary-button"}
      onClick={onToggleLock}
      aria-pressed={locked}
    >
      {locked ? `Locked: ${lockedAnchorLabel ?? "anchor"}` : "Lock anchor"}
    </button>
  </div>
);
