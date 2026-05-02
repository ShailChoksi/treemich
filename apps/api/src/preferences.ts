import {
  defaultCooccurrencePreferences,
  defaultGraphRenderLimit,
  defaultShowSingleFamilyTree,
  userPreferencesSchema,
  type CooccurrencePreferences,
  type UserPreferences
} from "@treemich/shared";

export const parseUserPreferences = (value: unknown): UserPreferences => {
  const parsed = userPreferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
};

export const getCooccurrencePreferences = (
  preferences: UserPreferences | undefined | null
): CooccurrencePreferences => ({
  ...defaultCooccurrencePreferences,
  ...(preferences?.cooccurrence ?? {})
});

export const withUserPreferenceDefaults = (
  preferences: UserPreferences | undefined | null
): UserPreferences => {
  const parsed = preferences ?? {};

  return {
    ...parsed,
    graphRenderLimit: parsed.graphRenderLimit ?? defaultGraphRenderLimit,
    showSingleFamilyTree: parsed.showSingleFamilyTree ?? defaultShowSingleFamilyTree,
    primaryFamilyUnitByPersonId: parsed.primaryFamilyUnitByPersonId ?? {},
    cooccurrence: getCooccurrencePreferences(parsed),
    searchIncludeAlternateNames: parsed.searchIncludeAlternateNames ?? true
  };
};

export const mergeUserPreferences = (
  current: UserPreferences,
  incoming: UserPreferences
): UserPreferences => ({
  ...current,
  ...incoming,
  graphFilterVisibility: incoming.graphFilterVisibility ?? current.graphFilterVisibility,
  familyViewStyle: incoming.familyViewStyle ?? current.familyViewStyle,
  graphRenderLimit: incoming.graphRenderLimit ?? current.graphRenderLimit,
  showSingleFamilyTree: incoming.showSingleFamilyTree ?? current.showSingleFamilyTree,
  lastSelectedPersonId:
    incoming.lastSelectedPersonId !== undefined
      ? incoming.lastSelectedPersonId
      : current.lastSelectedPersonId,
  primaryFamilyUnitByPersonId: incoming.primaryFamilyUnitByPersonId ?? current.primaryFamilyUnitByPersonId,
  dismissedSuggestions: incoming.dismissedSuggestions ?? current.dismissedSuggestions,
  cooccurrence: incoming.cooccurrence ?? current.cooccurrence,
  searchIncludeAlternateNames: incoming.searchIncludeAlternateNames ?? current.searchIncludeAlternateNames,
  onboardingTutorial:
    incoming.onboardingTutorial !== undefined ? incoming.onboardingTutorial : current.onboardingTutorial
});
