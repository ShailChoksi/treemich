import { filterGraphLayoutTopologyRelationships } from "@treemich/shared";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from "react";
import type {
  CreatePersonBody,
  GraphLayoutResponse,
  PersonRecord,
  RelationshipRecord,
  RelationshipType,
  UserPreferences
} from "../lib/api";
import {
  computeGraphLayout,
  createPerson,
  createPersonExternalIdentity,
  createRelationship,
  deletePerson,
  deletePersonExternalIdentity,
  deleteRelationship,
  getPeople,
  getRelationships,
  getTreeValidation,
  getUserPreferences,
  importPersonImmichThumbnail,
  updateUserPreferences,
  uploadPersonThumbnail
} from "../lib/api";
import { getPersonNameForGraphLayout } from "../lib/personDisplay";
import { getLocalStorageItem, setLocalStorageItem } from "../lib/safeLocalStorage";
import { parseGraphUiSnapshot, type GraphUiSnapshot } from "../lib/workspaceUiState";
import { resolvePeopleSelection } from "./people-selection";
import { useToast } from "./ToastContext";

const GRAPH_UI_STATE_STORAGE_KEY = "treemich.graph.uiState";

type RefreshGraphDataOptions = {
  bypassSaveGuard?: boolean;
};

type PeopleGraphDataProviderProps = {
  immichBaseUrl: string | null;
  currentUserName: string | null;
  children?: ReactNode;
};

type PeopleGraphDataContextValue = {
  people: PersonRecord[];
  relationships: RelationshipRecord[];
  selectedPersonId: string | null;
  selectedPerson: PersonRecord | null;
  graphFocusPersonId: string | null;
  graphCameraFocusPersonId: string | null;
  isLoading: boolean;
  loadError: string | null;
  serverLayout: GraphLayoutResponse | null;
  graphLayoutError: string | null;
  savedPreferences: UserPreferences | null;
  graphUiSnapshot: GraphUiSnapshot;
  treeValidationIssueCount: number | null;
  treeValidationEngineDisabled: boolean;
  isSavingProfile: boolean;
  isSavingRelationship: boolean;
  isSavingSearchPreferences: boolean;
  savingFamilyId: string | null;
  dataRevision: number;
  immichBaseUrl: string | null;
  setPeople: Dispatch<SetStateAction<PersonRecord[]>>;
  setIsSavingProfile: (value: boolean) => void;
  setIsSavingRelationship: (value: boolean) => void;
  setSavingFamilyId: (id: string | null) => void;
  setProfileDraftDirty: (value: boolean) => void;
  profileDraftDirty: boolean;
  mergePersonIntoPeople: (person: PersonRecord) => void;
  setSelectedPersonId: (id: string | null) => void;
  setGraphCameraFocusPersonId: (id: string | null) => void;
  setGraphUiSnapshot: (snapshot: GraphUiSnapshot) => void;
  setTreeValidationIssueCount: (count: number | null) => void;
  setTreeValidationEngineDisabled: (disabled: boolean) => void;
  refreshGraphData: (options?: RefreshGraphDataOptions) => Promise<void>;
  /** Stable `void refreshGraphData()` for memoized graph props (retry buttons, layout error). */
  retryGraphData: () => void;
  refreshPeopleOnly: () => Promise<void>;
  refreshRelationshipsOnly: () => Promise<void>;
  onPreferencesChange: (prefs: Partial<UserPreferences>) => Promise<boolean>;
  onSearchIncludeAlternateNamesChange: (next: boolean) => void;
  onPrimaryFamilyUnitChange: (personId: string, unitKey: string | null) => void;
  onDismissSuggestion: (key: string) => void;
  onCreateRelationship: (
    sourcePersonId: string,
    targetPersonId: string,
    type: RelationshipType
  ) => Promise<void>;
  handleCreatePerson: (body: CreatePersonBody) => Promise<void>;
  handleDeletePerson: () => Promise<void>;
  onDeleteExistingRelationship: (relationship: RelationshipRecord) => Promise<void>;
  handleUploadPersonThumbnail: (file: File) => Promise<void>;
  handleImportImmichThumbnail: () => Promise<void>;
  handleLinkImmichIdentity: (providerPersonId: string) => Promise<void>;
  handleUnlinkImmichIdentity: (identityId: string) => Promise<void>;
  clearGraphFocus: () => void;
  clearGraphCameraFocus: () => void;
  focusPersonInGraph: (personId: string) => void;
};

const PeopleGraphDataContext = createContext<PeopleGraphDataContextValue | null>(null);

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unknown error");

const sortPeopleStable = (people: PersonRecord[]) =>
  [...people].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));

const sortRelationshipsStable = (relationships: RelationshipRecord[]) =>
  [...relationships].sort(
    (left, right) =>
      left.fromPersonId.localeCompare(right.fromPersonId) ||
      left.toPersonId.localeCompare(right.toPersonId) ||
      left.type.localeCompare(right.type)
  );

export const samePeopleList = (left: PersonRecord[], right: PersonRecord[]) =>
  left.length === right.length &&
  left.every((person, index) => {
    const other = right[index];
    return (
      other != null &&
      person.id === other.id &&
      person.name === other.name &&
      person.birthDate === other.birthDate &&
      person.displayName === other.displayName &&
      person.hasRelationship === other.hasRelationship &&
      person.profile?.gender === other.profile?.gender &&
      person.profile?.givenName === other.profile?.givenName &&
      person.profile?.surname === other.profile?.surname &&
      person.profile?.nicknames === other.profile?.nicknames
    );
  });

export const sameRelationshipList = (left: RelationshipRecord[], right: RelationshipRecord[]) =>
  left.length === right.length &&
  left.every((relationship, index) => {
    const other = right[index];
    return (
      other != null &&
      relationship.id === other.id &&
      relationship.fromPersonId === other.fromPersonId &&
      relationship.toPersonId === other.toPersonId &&
      relationship.type === other.type &&
      relationship.familyId === other.familyId &&
      relationship.marriageAnniversaryDate === other.marriageAnniversaryDate &&
      relationship.divorceDate === other.divorceDate
    );
  });

export const PeopleGraphDataProvider = ({
  immichBaseUrl,
  currentUserName,
  children
}: PeopleGraphDataProviderProps) => {
  const { setStatus } = useToast();
  const [people, setPeople] = useState<PersonRecord[]>([]);
  const [relationships, setRelationships] = useState<RelationshipRecord[]>([]);
  const [selectedPersonId, setSelectedPersonIdState] = useState<string | null>(null);
  const [graphFocusPersonId, setGraphFocusPersonId] = useState<string | null>(null);
  const [graphCameraFocusPersonId, setGraphCameraFocusPersonId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfileState] = useState(false);
  const [isSavingRelationship, setIsSavingRelationshipState] = useState(false);
  const [isSavingSearchPreferences, setIsSavingSearchPreferences] = useState(false);
  const [savedPreferences, setSavedPreferences] = useState<UserPreferences | null>(null);
  const [serverLayout, setServerLayout] = useState<GraphLayoutResponse | null>(null);
  const [graphLayoutError, setGraphLayoutError] = useState<string | null>(null);
  const [treeValidationIssueCount, setTreeValidationIssueCount] = useState<number | null>(null);
  const [treeValidationEngineDisabled, setTreeValidationEngineDisabled] = useState(false);
  const [savingFamilyId, setSavingFamilyIdState] = useState<string | null>(null);
  const [dataRevision, setDataRevision] = useState(0);
  const [graphUiSnapshot, setGraphUiSnapshot] = useState<GraphUiSnapshot>(() =>
    parseGraphUiSnapshot(getLocalStorageItem(GRAPH_UI_STATE_STORAGE_KEY))
  );

  const selectedPersonIdRef = useRef<string | null>(null);
  const selectedPersonRef = useRef<PersonRecord | null>(null);
  const lastPersistedSelectionRef = useRef<string | null>(null);
  const layoutRequestIdRef = useRef(0);
  const profileDraftDirtyRef = useRef(false);
  const [profileDraftDirty, setProfileDraftDirtyState] = useState(false);
  const isSavingProfileRef = useRef(false);
  const isSavingRelationshipRef = useRef(false);
  const savingFamilyIdRef = useRef<string | null>(null);
  const treeValidationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedGraphUiSnapshotRef = useRef<string | null>(null);

  const selectedPerson = useMemo(
    () => people.find((person) => person.id === selectedPersonId) ?? null,
    [people, selectedPersonId]
  );

  if (lastPersistedGraphUiSnapshotRef.current === null) {
    lastPersistedGraphUiSnapshotRef.current = JSON.stringify(graphUiSnapshot);
  }

  const setSelectedPersonId = useCallback((id: string | null) => {
    selectedPersonIdRef.current = id;
    setSelectedPersonIdState(id);
  }, []);

  const setIsSavingProfile = useCallback((value: boolean) => {
    isSavingProfileRef.current = value;
    setIsSavingProfileState(value);
  }, []);

  const setIsSavingRelationship = useCallback((value: boolean) => {
    isSavingRelationshipRef.current = value;
    setIsSavingRelationshipState(value);
  }, []);

  const setSavingFamilyId = useCallback((id: string | null) => {
    savingFamilyIdRef.current = id;
    setSavingFamilyIdState(id);
  }, []);

  const setProfileDraftDirty = useCallback((value: boolean) => {
    profileDraftDirtyRef.current = value;
    setProfileDraftDirtyState(value);
  }, []);

  const mergePersonIntoPeople = useCallback((person: PersonRecord) => {
    setPeople((current) => {
      const without = current.filter((entry) => entry.id !== person.id);
      return sortPeopleStable([...without, person]);
    });
  }, []);

  const refreshPeopleOnly = useCallback(async () => {
    const peopleResponse = await getPeople();
    const sortedPeople = sortPeopleStable(peopleResponse);
    setPeople((current) => (samePeopleList(current, sortedPeople) ? current : sortedPeople));
  }, []);

  const refreshRelationshipsOnly = useCallback(async () => {
    const relationshipsResponse = await getRelationships();
    const sortedRelationships = sortRelationshipsStable(relationshipsResponse);
    setRelationships((current) =>
      sameRelationshipList(current, sortedRelationships) ? current : sortedRelationships
    );
  }, []);

  const refreshGraphData = useCallback(
    async (options: RefreshGraphDataOptions = {}) => {
      if (!options.bypassSaveGuard && profileDraftDirtyRef.current) {
        setStatus("Save your profile changes before refreshing the tree.");
        return;
      }
      if (
        !options.bypassSaveGuard &&
        (isSavingProfileRef.current || isSavingRelationshipRef.current || savingFamilyIdRef.current)
      ) {
        setStatus("Wait for the current save to finish before refreshing the tree.");
        return;
      }
      setIsLoading(true);
      try {
        const [peopleResponse, relationshipsResponse, preferencesResponse] = await Promise.all([
          getPeople(),
          getRelationships(),
          getUserPreferences().catch(() => ({}) as UserPreferences)
        ]);
        const sortedPeople = sortPeopleStable(peopleResponse);
        const sortedRelationships = sortRelationshipsStable(relationshipsResponse);
        startTransition(() => {
          setPeople((current) => (samePeopleList(current, sortedPeople) ? current : sortedPeople));
          setRelationships((current) =>
            sameRelationshipList(current, sortedRelationships) ? current : sortedRelationships
          );
          setSavedPreferences((current) => current ?? preferencesResponse);
          setLoadError(null);
          setDataRevision((revision) => revision + 1);
        });

        const nextSelection = resolvePeopleSelection({
          people: sortedPeople,
          relationships: sortedRelationships,
          currentSelectedPersonId: selectedPersonIdRef.current,
          lastSelectedPersonId: preferencesResponse.lastSelectedPersonId,
          currentUserName
        });
        setSelectedPersonId(nextSelection.selectedPersonId);
        setGraphCameraFocusPersonId(nextSelection.cameraFocusPersonId);

        const layoutRequestId = layoutRequestIdRef.current + 1;
        layoutRequestIdRef.current = layoutRequestId;
        setServerLayout(null);
        setGraphLayoutError(null);
        computeGraphLayout({
          people: sortedPeople.map((person) => ({
            id: person.id,
            name: getPersonNameForGraphLayout(person)
          })),
          relationships: filterGraphLayoutTopologyRelationships(sortedRelationships),
          viewMode: "family",
          familyViewStyle: preferencesResponse.familyViewStyle,
          selectedPersonId: nextSelection.selectedPersonId,
          primaryFamilyUnitByPersonId: preferencesResponse.primaryFamilyUnitByPersonId
        })
          .then((layout) => {
            if (layoutRequestIdRef.current !== layoutRequestId) {
              return;
            }
            setServerLayout(layout);
            setGraphLayoutError(null);
          })
          .catch((err: unknown) => {
            if (layoutRequestIdRef.current !== layoutRequestId) {
              return;
            }
            setServerLayout(null);
            const message = `Server layout failed: ${getErrorMessage(err)}. Using a local graph layout.`;
            setGraphLayoutError(message);
            setStatus(message);
          });
      } catch (error: unknown) {
        setLoadError(getErrorMessage(error));
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [currentUserName, setSelectedPersonId, setStatus]
  );

  const retryGraphData = useCallback(() => {
    void refreshGraphData();
  }, [refreshGraphData]);

  useEffect(() => {
    refreshGraphData().catch((error: unknown) => {
      setStatus(getErrorMessage(error));
    });
  }, [refreshGraphData, setStatus]);

  useEffect(() => {
    selectedPersonIdRef.current = selectedPersonId;
  }, [selectedPersonId]);

  useEffect(() => {
    selectedPersonRef.current = selectedPerson;
  }, [selectedPerson]);

  useEffect(() => {
    setProfileDraftDirty(false);
  }, [selectedPersonId, setProfileDraftDirty]);

  useEffect(() => {
    const serialized = JSON.stringify(graphUiSnapshot);
    if (lastPersistedGraphUiSnapshotRef.current === serialized) {
      return;
    }
    const timeout = window.setTimeout(() => {
      lastPersistedGraphUiSnapshotRef.current = serialized;
      setLocalStorageItem(GRAPH_UI_STATE_STORAGE_KEY, serialized);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [graphUiSnapshot]);

  const onPreferencesChange = useCallback(
    (prefs: Partial<UserPreferences>) => {
      setSavedPreferences((current) => ({
        ...(current ?? {}),
        ...prefs,
        dismissedSuggestions: prefs.dismissedSuggestions ?? current?.dismissedSuggestions,
        familyViewStyle: prefs.familyViewStyle ?? current?.familyViewStyle,
        graphFilterVisibility: prefs.graphFilterVisibility ?? current?.graphFilterVisibility,
        lastSelectedPersonId:
          prefs.lastSelectedPersonId !== undefined
            ? prefs.lastSelectedPersonId
            : current?.lastSelectedPersonId,
        primaryFamilyUnitByPersonId: prefs.primaryFamilyUnitByPersonId ?? current?.primaryFamilyUnitByPersonId
      }));
      return updateUserPreferences(prefs)
        .then((nextPrefs) => {
          setSavedPreferences(nextPrefs);
          return true;
        })
        .catch((err: unknown) => {
          setStatus(`Could not save preferences: ${getErrorMessage(err)}`);
          return false;
        });
    },
    [setStatus]
  );

  const onSearchIncludeAlternateNamesChange = useCallback(
    (next: boolean) => {
      const previous = savedPreferences;
      setIsSavingSearchPreferences(true);
      setSavedPreferences((current) => ({
        ...(current ?? {}),
        searchIncludeAlternateNames: next
      }));
      void updateUserPreferences({ searchIncludeAlternateNames: next })
        .then((nextPrefs) => {
          setSavedPreferences(nextPrefs);
          setStatus(
            next
              ? "Alternate-name relationship search enabled."
              : "Alternate-name relationship search disabled."
          );
        })
        .catch((err: unknown) => {
          setSavedPreferences(previous);
          setStatus(`Could not save search settings: ${getErrorMessage(err)}`);
        })
        .finally(() => {
          setIsSavingSearchPreferences(false);
        });
    },
    [savedPreferences, setStatus]
  );

  const onPrimaryFamilyUnitChange = useCallback(
    (personId: string, unitKey: string | null) => {
      const current = savedPreferences?.primaryFamilyUnitByPersonId ?? {};
      const next = { ...current };
      if (!unitKey) {
        delete next[personId];
      } else {
        next[personId] = unitKey;
      }
      void onPreferencesChange({ primaryFamilyUnitByPersonId: next });
    },
    [onPreferencesChange, savedPreferences?.primaryFamilyUnitByPersonId]
  );

  const onDismissSuggestion = useCallback(
    (suggestionKey: string) => {
      const dismissedSuggestions = new Set(savedPreferences?.dismissedSuggestions ?? []);
      dismissedSuggestions.add(suggestionKey);
      void onPreferencesChange({
        dismissedSuggestions: [...dismissedSuggestions].sort((left, right) => left.localeCompare(right))
      });
    },
    [onPreferencesChange, savedPreferences?.dismissedSuggestions]
  );

  const clearGraphFocus = useCallback(() => setGraphFocusPersonId(null), []);
  const clearGraphCameraFocus = useCallback(() => setGraphCameraFocusPersonId(null), []);

  const focusPersonInGraph = useCallback(
    (personId: string) => {
      setGraphFocusPersonId(personId);
      setSelectedPersonId(personId);
    },
    [setSelectedPersonId]
  );

  const onCreateRelationship = useCallback(
    async (sourcePersonId: string, targetPersonId: string, relationshipType: RelationshipType) => {
      setIsSavingRelationship(true);
      try {
        await createRelationship(sourcePersonId, targetPersonId, relationshipType);
        await refreshGraphData({ bypassSaveGuard: true });
        setStatus("Relationship saved");
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
        throw error;
      } finally {
        setIsSavingRelationship(false);
      }
    },
    [refreshGraphData, setIsSavingRelationship, setStatus]
  );

  const handleCreatePerson = useCallback(
    async (body: CreatePersonBody) => {
      if (profileDraftDirtyRef.current) {
        setStatus("Save your profile changes before creating a new person.");
        return;
      }
      try {
        const newPerson = await createPerson(body);
        selectedPersonIdRef.current = newPerson.id;
        setSelectedPersonId(newPerson.id);
        setGraphCameraFocusPersonId(newPerson.id);
        await refreshGraphData();
        setStatus("Person created");
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
        throw error;
      }
    },
    [refreshGraphData, setSelectedPersonId, setStatus]
  );

  const handleDeletePerson = useCallback(async () => {
    const person = selectedPersonRef.current;
    if (!person) {
      return;
    }
    try {
      await deletePerson(person.id);
      setProfileDraftDirty(false);
      selectedPersonIdRef.current = null;
      setSelectedPersonId(null);
      await refreshGraphData();
      setStatus("Person deleted");
    } catch (error: unknown) {
      setStatus(getErrorMessage(error));
      throw error;
    }
  }, [refreshGraphData, setSelectedPersonId, setStatus]);

  const handleUploadPersonThumbnail = useCallback(
    async (file: File) => {
      const person = selectedPersonRef.current;
      if (!person) {
        return;
      }
      try {
        await uploadPersonThumbnail(person.id, file);
        await refreshGraphData({ bypassSaveGuard: true });
        setStatus("Thumbnail uploaded");
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
        throw error;
      }
    },
    [refreshGraphData, setStatus]
  );

  const handleImportImmichThumbnail = useCallback(async () => {
    const person = selectedPersonRef.current;
    if (!person) {
      return;
    }
    try {
      await importPersonImmichThumbnail(person.id);
      await refreshGraphData({ bypassSaveGuard: true });
      setStatus("Immich thumbnail imported");
    } catch (error: unknown) {
      setStatus(getErrorMessage(error));
      throw error;
    }
  }, [refreshGraphData, setStatus]);

  const handleLinkImmichIdentity = useCallback(
    async (providerPersonId: string) => {
      const person = selectedPersonRef.current;
      if (!person) {
        return;
      }
      try {
        await createPersonExternalIdentity(person.id, {
          provider: "IMMICH",
          providerPersonId,
          providerBaseUrl: immichBaseUrl ?? undefined
        });
        await refreshGraphData({ bypassSaveGuard: true });
        setStatus("Immich identity linked");
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
        throw error;
      }
    },
    [immichBaseUrl, refreshGraphData, setStatus]
  );

  const handleUnlinkImmichIdentity = useCallback(
    async (identityId: string) => {
      const person = selectedPersonRef.current;
      if (!person) {
        return;
      }
      try {
        await deletePersonExternalIdentity(person.id, identityId);
        await refreshGraphData({ bypassSaveGuard: true });
        setStatus("Immich identity unlinked");
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
        throw error;
      }
    },
    [refreshGraphData, setStatus]
  );

  const onDeleteExistingRelationship = useCallback(
    async (relationship: RelationshipRecord) => {
      setIsSavingRelationship(true);
      try {
        await deleteRelationship(relationship.fromPersonId, relationship.toPersonId, relationship.type);
        await refreshGraphData({ bypassSaveGuard: true });
        setStatus("Relationship deleted");
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
        throw error;
      } finally {
        setIsSavingRelationship(false);
      }
    },
    [refreshGraphData, setIsSavingRelationship, setStatus]
  );

  const hasRelationships = relationships.length > 0;

  useEffect(() => {
    if (!hasRelationships || !selectedPersonId) {
      lastPersistedSelectionRef.current = null;
      return;
    }
    if (!people.some((person) => person.id === selectedPersonId)) {
      return;
    }
    if (savedPreferences?.lastSelectedPersonId === selectedPersonId) {
      lastPersistedSelectionRef.current = selectedPersonId;
      return;
    }
    if (lastPersistedSelectionRef.current === selectedPersonId) {
      return;
    }
    lastPersistedSelectionRef.current = selectedPersonId;
    void onPreferencesChange({ lastSelectedPersonId: selectedPersonId });
  }, [
    hasRelationships,
    onPreferencesChange,
    people,
    savedPreferences?.lastSelectedPersonId,
    selectedPersonId
  ]);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (treeValidationDebounceRef.current != null) {
      window.clearTimeout(treeValidationDebounceRef.current);
    }
    treeValidationDebounceRef.current = window.setTimeout(() => {
      treeValidationDebounceRef.current = null;
      void getTreeValidation()
        .then((result) => {
          setTreeValidationEngineDisabled(result.engineDisabled);
          setTreeValidationIssueCount(result.findings.length);
        })
        .catch((err: unknown) => {
          setTreeValidationIssueCount(null);
          setStatus(`Tree validation check failed: ${getErrorMessage(err)}`);
        });
    }, 400);
    return () => {
      if (treeValidationDebounceRef.current != null) {
        window.clearTimeout(treeValidationDebounceRef.current);
        treeValidationDebounceRef.current = null;
      }
    };
  }, [isLoading, people, relationships, setStatus]);

  const value = useMemo<PeopleGraphDataContextValue>(
    () => ({
      people,
      relationships,
      selectedPersonId,
      selectedPerson,
      graphFocusPersonId,
      graphCameraFocusPersonId,
      isLoading,
      loadError,
      serverLayout,
      graphLayoutError,
      savedPreferences,
      graphUiSnapshot,
      treeValidationIssueCount,
      treeValidationEngineDisabled,
      isSavingProfile,
      isSavingRelationship,
      isSavingSearchPreferences,
      savingFamilyId,
      dataRevision,
      immichBaseUrl,
      setPeople,
      setIsSavingProfile,
      setIsSavingRelationship,
      setSavingFamilyId,
      setProfileDraftDirty,
      profileDraftDirty,
      mergePersonIntoPeople,
      setSelectedPersonId,
      setGraphCameraFocusPersonId,
      setGraphUiSnapshot,
      setTreeValidationIssueCount,
      setTreeValidationEngineDisabled,
      refreshGraphData,
      retryGraphData,
      refreshPeopleOnly,
      refreshRelationshipsOnly,
      onPreferencesChange,
      onSearchIncludeAlternateNamesChange,
      onPrimaryFamilyUnitChange,
      onDismissSuggestion,
      onCreateRelationship,
      handleCreatePerson,
      handleDeletePerson,
      onDeleteExistingRelationship,
      handleUploadPersonThumbnail,
      handleImportImmichThumbnail,
      handleLinkImmichIdentity,
      handleUnlinkImmichIdentity,
      clearGraphFocus,
      clearGraphCameraFocus,
      focusPersonInGraph
    }),
    [
      clearGraphCameraFocus,
      clearGraphFocus,
      dataRevision,
      focusPersonInGraph,
      graphCameraFocusPersonId,
      graphFocusPersonId,
      graphLayoutError,
      graphUiSnapshot,
      handleCreatePerson,
      handleDeletePerson,
      handleImportImmichThumbnail,
      handleLinkImmichIdentity,
      handleUnlinkImmichIdentity,
      handleUploadPersonThumbnail,
      immichBaseUrl,
      isLoading,
      isSavingProfile,
      isSavingRelationship,
      isSavingSearchPreferences,
      loadError,
      mergePersonIntoPeople,
      onCreateRelationship,
      onDeleteExistingRelationship,
      onDismissSuggestion,
      onPreferencesChange,
      onPrimaryFamilyUnitChange,
      onSearchIncludeAlternateNamesChange,
      people,
      profileDraftDirty,
      refreshGraphData,
      retryGraphData,
      refreshPeopleOnly,
      refreshRelationshipsOnly,
      relationships,
      savedPreferences,
      savingFamilyId,
      selectedPerson,
      selectedPersonId,
      serverLayout,
      setGraphCameraFocusPersonId,
      setGraphUiSnapshot,
      setIsSavingProfile,
      setIsSavingRelationship,
      setProfileDraftDirty,
      setSavingFamilyId,
      setSelectedPersonId,
      treeValidationEngineDisabled,
      treeValidationIssueCount
    ]
  );

  return <PeopleGraphDataContext.Provider value={value}>{children}</PeopleGraphDataContext.Provider>;
};

export const usePeopleGraphData = () => {
  const context = useContext(PeopleGraphDataContext);
  if (!context) {
    throw new Error("usePeopleGraphData must be used within PeopleGraphDataProvider");
  }
  return context;
};
