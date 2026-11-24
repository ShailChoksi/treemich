/**
 * @file Shared open/close state for the graph's secondary control panels (filters, tree layout).
 *
 * On wide screens the filters panel is always visible and only the tree layout panel collapses.
 * On narrow screens (see `styles.css`, `max-width: 768px`) the filters panel collapses behind a
 * toolbar toggle, and only one panel is open at a time so they never stack on top of each other.
 */

import { useCallback, useState } from "react";

export type GraphControlPanel = "filters" | "layout";

export const useGraphControlPanels = () => {
  const [openPanel, setOpenPanel] = useState<GraphControlPanel | null>(null);

  const toggleFilters = useCallback(() => {
    setOpenPanel((current) => (current === "filters" ? null : "filters"));
  }, []);

  const setLayoutExpanded = useCallback((next: boolean) => {
    setOpenPanel((current) => {
      if (next) {
        return "layout";
      }
      return current === "layout" ? null : current;
    });
  }, []);

  return {
    filtersOpen: openPanel === "filters",
    layoutExpanded: openPanel === "layout",
    toggleFilters,
    setLayoutExpanded
  };
};

type GraphFiltersToggleProps = {
  expanded: boolean;
  controlsId: string;
  onToggle: () => void;
};

/** Toolbar button that reveals the graph filters panel on narrow screens (hidden by CSS on wide screens). */
export const GraphFiltersToggle = ({ expanded, controlsId, onToggle }: GraphFiltersToggleProps) => (
  <button
    type="button"
    className="secondary-button graph-filters-toggle"
    aria-expanded={expanded}
    aria-controls={controlsId}
    onClick={onToggle}
  >
    {expanded ? "Hide filters" : "Filters"}
  </button>
);
