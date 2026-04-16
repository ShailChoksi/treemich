import {
  defaultCooccurrencePreferences,
  defaultGraphLineRoutingStyle,
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
    graphLineRoutingStyle: parsed.graphLineRoutingStyle ?? defaultGraphLineRoutingStyle,
    showSingleFamilyTree: parsed.showSingleFamilyTree ?? defaultShowSingleFamilyTree,
    cooccurrence: getCooccurrencePreferences(parsed)
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
  graphLineRoutingStyle: incoming.graphLineRoutingStyle ?? current.graphLineRoutingStyle,
  showSingleFamilyTree: incoming.showSingleFamilyTree ?? current.showSingleFamilyTree,
  dismissedSuggestions: incoming.dismissedSuggestions ?? current.dismissedSuggestions,
  cooccurrence: incoming.cooccurrence ?? current.cooccurrence
});
