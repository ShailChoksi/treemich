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

const LOCK_FOCUS_TOOLTIP = "Lock Focus on Person";

const DEPTH_CONTROLS = {
  ancestors: {
    label: "Ancestors",
    tooltip: "How many generations of parents and grandparents to include from the Focus person."
  },
  descendants: {
    label: "Descendants",
    tooltip: "How many generations of children and grandchildren to include from the Focus person."
  },
  siblings: {
    label: "Siblings",
    tooltip:
      "How deep to follow siblings of people on the bloodline. 0 shows siblings only; higher values include their children (nieces, nephews, and further)."
  }
} as const;

const LockIcon = ({ locked }: { locked: boolean }) => (
  <svg
    className="graph-focus-lock-icon"
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    {locked ? <path d="M7 11V7a5 5 0 0 1 10 0v4" /> : <path d="M7 11V7a5 5 0 0 1 9.9-1" />}
  </svg>
);

const DepthStepper = ({
  label,
  tooltip,
  value,
  min,
  max,
  onChange
}: {
  label: string;
  tooltip: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) => (
  <label className="graph-focus-depth-stepper" title={tooltip}>
    <span>{label}</span>
    <span className="graph-focus-depth-stepper-controls">
      <button
        type="button"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        aria-label={`${label} decrease`}
        title={tooltip}
      >
        −
      </button>
      <strong aria-live="polite">{value}</strong>
      <button
        type="button"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        aria-label={`${label} increase`}
        title={tooltip}
      >
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
      label={DEPTH_CONTROLS.ancestors.label}
      tooltip={DEPTH_CONTROLS.ancestors.tooltip}
      value={ancestorDepth}
      min={minFocusBloodlineDepth}
      max={maxFocusBloodlineDepth}
      onChange={onAncestorDepthChange}
    />
    <DepthStepper
      label={DEPTH_CONTROLS.descendants.label}
      tooltip={DEPTH_CONTROLS.descendants.tooltip}
      value={descendantDepth}
      min={minFocusBloodlineDepth}
      max={maxFocusBloodlineDepth}
      onChange={onDescendantDepthChange}
    />
    <DepthStepper
      label={DEPTH_CONTROLS.siblings.label}
      tooltip={DEPTH_CONTROLS.siblings.tooltip}
      value={collateralDepth}
      min={minFocusCollateralDepth}
      max={maxFocusCollateralDepth}
      onChange={onCollateralDepthChange}
    />
    <button
      type="button"
      className={
        locked
          ? "icon-action-button graph-focus-lock-button graph-focus-lock-on"
          : "icon-action-button graph-focus-lock-button"
      }
      onClick={onToggleLock}
      aria-pressed={locked}
      aria-label={
        locked && lockedAnchorLabel ? `${LOCK_FOCUS_TOOLTIP} (${lockedAnchorLabel})` : LOCK_FOCUS_TOOLTIP
      }
      title={LOCK_FOCUS_TOOLTIP}
    >
      <LockIcon locked={locked} />
    </button>
  </div>
);
