import { useGraphLayoutState } from "./useGraphLayoutState";
import { defaultGraphFilterVisibility } from "./relationshipStyles";

export type LayoutStateHookOptions = Parameters<typeof useGraphLayoutState>[0];

/**
 * Default props for `useGraphLayoutState` in tests — override only what each case needs.
 */
export const createLayoutStateHookProps = (
  overrides: Partial<LayoutStateHookOptions> = {}
): LayoutStateHookOptions => ({
  people: [{ id: "a", name: "Alpha", hasRelationship: true }],
  relationships: [],
  photoEdges: [],
  photoClusters: [],
  viewMode: "family",
  primaryFamilyUnitByPersonId: {},
  showSingleFamilyTree: false,
  singleFamilyTreeAnchorId: null,
  filterVisibility: defaultGraphFilterVisibility,
  selectedPersonId: null,
  hoveredPersonId: null,
  focusPersonId: null,
  pinnedPersonId: null,
  renderLimit: 50,
  ...overrides
});
