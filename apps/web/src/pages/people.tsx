import type { CreateFamilyLifeEventBody, CreateLifeEventBody, PatchLifeEventBody } from "@treemich/shared";
import { filterGraphLayoutTopologyRelationships } from "@treemich/shared";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent
} from "react";
import type {
  CreateResearchTaskBody,
  FamilyRecord,
  Gender,
  GraphLayoutResponse,
  ImmichPerson,
  LifeEventRecord,
  PatchFamilyBody,
  PlacesMapPoint,
  ResearchTaskRecord,
  RelationshipRecord,
  TimelineEventRecord,
  RelationshipType,
  UserPreferences
} from "../lib/api";
import {
  createResearchTask,
  createPersonLifeEvent,
  createRelationshipLifeEvent,
  createFamilyLifeEvent,
  computeGraphLayout,
  createRelationship,
  deleteFamily,
  deleteFamilyLifeEvent,
  deleteResearchTask,
  getFamiliesForPerson,
  getFamilyLifeEvents,
  deletePersonLifeEvent,
  deleteRelationship,
  deleteRelationshipLifeEvent,
  getImmichPeople,
  getPlacesMap,
  getPersonLifeEvents,
  getPersonTimeline,
  getResearchTasks,
  getRelationshipLifeEvents,
  getRelationships,
  getTreeValidation,
  getUserPreferences,
  patchFamily,
  updateFamilyLifeEvent,
  updatePersonLifeEvent,
  updateResearchTask,
  updateRelationshipLifeEvent,
  updatePersonProfile,
  updateUserPreferences
} from "../lib/api";
import {
  buildBirthPlaceInput,
  deriveProfileDisplayValuesFromLifeEvents,
  parseDateInputToParts
} from "../lib/lifeEventUi";
import { getPersonDisplayLabel } from "../lib/personDisplay";
import { getLocalStorageItem, setLocalStorageItem } from "../lib/safeLocalStorage";
import { EvidenceLibrariesSection } from "../components/EvidenceLibrariesSection";
import { EvidenceMediaSection } from "../components/EvidenceMediaSection";
import { GedcomInterchangeSection } from "../components/GedcomInterchangeSection";
import { PersonDetailPanel } from "../components/PersonDetailPanel";
import { MapPlacesPanel } from "../components/MapPlacesPanel";
import { PeopleGraph3D } from "../components/PeopleGraph3D";

const genders: Gender[] = ["MALE", "FEMALE", "OTHER", "UNKNOWN"];
const isGender = (value: string): value is Gender => genders.includes(value as Gender);
const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unknown error");
const WORKSPACE_STORAGE_KEY = "treemich.activeWorkspace";
const LEFT_PANE_OPEN_STORAGE_KEY = "treemich.leftPaneOpen";
const CONTEXT_OPEN_STORAGE_KEY = "treemich.contextOpen";

type WorkspaceId = "tree" | "research" | "evidence" | "interchange" | "places" | "reports" | "settings";

const WORKSPACE_ITEMS: { id: WorkspaceId; label: string; iconLabel: string }[] = [
  { id: "tree", label: "Tree", iconLabel: "TR" },
  { id: "research", label: "Research", iconLabel: "RS" },
  { id: "evidence", label: "Evidence", iconLabel: "EV" },
  { id: "interchange", label: "Interchange", iconLabel: "GX" },
  { id: "places", label: "Places", iconLabel: "MP" },
  { id: "reports", label: "Reports", iconLabel: "RP" },
  { id: "settings", label: "Settings", iconLabel: "ST" }
];

const sortPeopleStable = (people: ImmichPerson[]) =>
  [...people].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));

const sortRelationshipsStable = (relationships: RelationshipRecord[]) =>
  [...relationships].sort(
    (left, right) =>
      left.fromPersonId.localeCompare(right.fromPersonId) ||
      left.toPersonId.localeCompare(right.toPersonId) ||
      left.type.localeCompare(right.type)
  );

const normalizeName = (value: string | null | undefined) => value?.trim().toLocaleLowerCase() ?? "";

export {
  deriveProfileDisplayValuesFromLifeEvents,
  parseDateInputToParts,
  buildBirthPlaceInput
} from "../lib/lifeEventUi";

const noRelationshipsGraphFilterVisibility: NonNullable<UserPreferences["graphFilterVisibility"]> = {
  parentChild: false,
  spouse: false,
  sibling: false,
  friends: false,
  pets: false
};

export const findBestPersonMatchByName = (
  people: ImmichPerson[],
  currentUserName: string | null | undefined
) => {
  const normalizedName = normalizeName(currentUserName);
  if (!normalizedName) {
    return null;
  }

  const exactMatches = people.filter((person) => normalizeName(person.name) === normalizedName);
  if (exactMatches.length > 0) {
    return [...exactMatches].sort(
      (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
    )[0];
  }

  const containsMatches = people.filter((person) => normalizeName(person.name).includes(normalizedName));
  if (containsMatches.length > 0) {
    return [...containsMatches].sort(
      (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
    )[0];
  }

  return null;
};

type ResolvePeopleSelectionOptions = {
  people: ImmichPerson[];
  relationships: RelationshipRecord[];
  currentSelectedPersonId: string | null;
  lastSelectedPersonId: string | null | undefined;
  currentUserName: string | null | undefined;
};

export const resolvePeopleSelection = ({
  people,
  relationships,
  currentSelectedPersonId,
  lastSelectedPersonId,
  currentUserName
}: ResolvePeopleSelectionOptions) => {
  const personIds = new Set(people.map((person) => person.id));
  const hasRelationships = relationships.length > 0;

  if (!hasRelationships) {
    return {
      selectedPersonId: null,
      cameraFocusPersonId: findBestPersonMatchByName(people, currentUserName)?.id ?? null
    };
  }

  if (currentSelectedPersonId && personIds.has(currentSelectedPersonId)) {
    return {
      selectedPersonId: currentSelectedPersonId,
      cameraFocusPersonId: null
    };
  }

  if (lastSelectedPersonId && personIds.has(lastSelectedPersonId)) {
    return {
      selectedPersonId: lastSelectedPersonId,
      cameraFocusPersonId: lastSelectedPersonId
    };
  }

  return {
    selectedPersonId: people[0]?.id ?? null,
    cameraFocusPersonId: null
  };
};

type Props = {
  immichBaseUrl?: string | null;
  currentUserName?: string | null;
};

export const PeoplePage = ({ immichBaseUrl = null, currentUserName = null }: Props) => {
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(() => {
    if (typeof window === "undefined") {
      return "tree";
    }
    const stored = getLocalStorageItem(WORKSPACE_STORAGE_KEY);
    return WORKSPACE_ITEMS.some((item) => item.id === stored) ? (stored as WorkspaceId) : "tree";
  });
  const [leftPaneOpen, setLeftPaneOpen] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return getLocalStorageItem(LEFT_PANE_OPEN_STORAGE_KEY) !== "false";
  });
  const [contextPaneOpen, setContextPaneOpen] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return getLocalStorageItem(CONTEXT_OPEN_STORAGE_KEY) !== "false";
  });
  const [layoutResizeSignal, setLayoutResizeSignal] = useState(0);
  const workspaceMainViewsRef = useRef<HTMLDivElement | null>(null);
  const [people, setPeople] = useState<ImmichPerson[]>([]);
  const [relationships, setRelationships] = useState<RelationshipRecord[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [graphFocusPersonId, setGraphFocusPersonId] = useState<string | null>(null);
  const [graphCameraFocusPersonId, setGraphCameraFocusPersonId] = useState<string | null>(null);
  const [genderByPersonId, setGenderByPersonId] = useState<Record<string, Gender>>({});
  const [givenNameByPersonId, setGivenNameByPersonId] = useState<Record<string, string>>({});
  const [surnameByPersonId, setSurnameByPersonId] = useState<Record<string, string>>({});
  const [nicknamesByPersonId, setNicknamesByPersonId] = useState<Record<string, string>>({});
  /** Quick-edit birth/death/place strings; merged with life-event derive when a key is absent. */
  const [profileEventFieldsByPersonId, setProfileEventFieldsByPersonId] = useState<
    Record<string, { birthDate: string; deathDate: string; birthCity: string; birthCountry: string }>
  >({});
  const [lifeEventsByPersonId, setLifeEventsByPersonId] = useState<Record<string, LifeEventRecord[]>>({});
  const [relationshipLifeEventsById, setRelationshipLifeEventsById] = useState<
    Record<string, LifeEventRecord[]>
  >({});
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingRelationship, setIsSavingRelationship] = useState(false);
  const [savedPreferences, setSavedPreferences] = useState<UserPreferences | null>(null);
  const [serverLayout, setServerLayout] = useState<GraphLayoutResponse | null>(null);
  const [treeValidationIssueCount, setTreeValidationIssueCount] = useState<number | null>(null);
  const [treeValidationEngineDisabled, setTreeValidationEngineDisabled] = useState(false);
  const [personTimelineById, setPersonTimelineById] = useState<Record<string, TimelineEventRecord[]>>({});
  const [researchTasksByPersonId, setResearchTasksByPersonId] = useState<
    Record<string, ResearchTaskRecord[]>
  >({});
  const [familiesByPersonId, setFamiliesByPersonId] = useState<Record<string, FamilyRecord[] | undefined>>(
    {}
  );
  const [savingFamilyId, setSavingFamilyId] = useState<string | null>(null);
  const [familyLifeEventsById, setFamilyLifeEventsById] = useState<
    Partial<Record<string, LifeEventRecord[]>>
  >({});
  const [mapPlaces, setMapPlaces] = useState<PlacesMapPoint[] | null>(null);
  const [mapIncludeLiving, setMapIncludeLiving] = useState(true);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapUiEnabled, setMapUiEnabled] = useState(true);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  const selectedPersonIdRef = useRef<string | null>(null);
  const lastPersistedSelectionRef = useRef<string | null>(null);
  const layoutRequestIdRef = useRef(0);
  const workspaceButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  /** True when quick-edit profile fields were changed but not yet saved via Save profile. */
  const profileDraftDirtyRef = useRef(false);
  const mapPlacesRequestIdRef = useRef(0);
  const layoutResizeRafRef = useRef<number | null>(null);
  const treeValidationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshPeopleOnly = useCallback(async () => {
    const peopleResponse = await getImmichPeople();
    setPeople(sortPeopleStable(peopleResponse));
  }, []);

  useEffect(() => {
    selectedPersonIdRef.current = selectedPersonId;
  }, [selectedPersonId]);

  useEffect(() => {
    profileDraftDirtyRef.current = false;
  }, [selectedPersonId]);

  useEffect(() => {
    setFamilyLifeEventsById({});
  }, [selectedPersonId]);

  const loadMapPlaces = useCallback(async (includeLiving: boolean) => {
    const requestId = (mapPlacesRequestIdRef.current += 1);
    setMapLoading(true);
    setMapLoadError(null);
    try {
      const response = await getPlacesMap({ includeLiving });
      if (mapPlacesRequestIdRef.current !== requestId) {
        return;
      }
      setMapUiEnabled(response.mapUiEnabled);
      setMapPlaces(response.places);
    } catch (error: unknown) {
      if (mapPlacesRequestIdRef.current !== requestId) {
        return;
      }
      setMapLoadError(getErrorMessage(error));
    } finally {
      if (mapPlacesRequestIdRef.current === requestId) {
        setMapLoading(false);
      }
    }
  }, []);

  const refreshGraphData = useCallback(async () => {
    if (profileDraftDirtyRef.current) {
      setStatus("Save your profile changes before refreshing the tree.");
      return;
    }
    if (isSavingProfile || isSavingRelationship || savingFamilyId) {
      setStatus("Wait for the current save to finish before refreshing the tree.");
      return;
    }
    setIsLoading(true);
    try {
      const [peopleResponse, relationshipsResponse, preferencesResponse] = await Promise.all([
        getImmichPeople(),
        getRelationships(),
        getUserPreferences().catch(() => ({}) as UserPreferences)
      ]);
      const sortedPeople = sortPeopleStable(peopleResponse);
      const sortedRelationships = sortRelationshipsStable(relationshipsResponse);
      setPeople(sortedPeople);
      setRelationships(sortedRelationships);
      setSavedPreferences((current) => current ?? preferencesResponse);
      setLoadError(null);
      setLifeEventsByPersonId({});
      setRelationshipLifeEventsById({});
      setProfileEventFieldsByPersonId({});
      setPersonTimelineById({});
      setResearchTasksByPersonId({});
      setFamiliesByPersonId({});
      setFamilyLifeEventsById({});
      setGenderByPersonId(
        sortedPeople.reduce<Record<string, Gender>>((acc, person) => {
          acc[person.id] = person.profile?.gender ?? "UNKNOWN";
          return acc;
        }, {})
      );
      setGivenNameByPersonId(
        sortedPeople.reduce<Record<string, string>>((acc, person) => {
          acc[person.id] = person.profile?.givenName ?? "";
          return acc;
        }, {})
      );
      setSurnameByPersonId(
        sortedPeople.reduce<Record<string, string>>((acc, person) => {
          acc[person.id] = person.profile?.surname ?? "";
          return acc;
        }, {})
      );
      setNicknamesByPersonId(
        sortedPeople.reduce<Record<string, string>>((acc, person) => {
          acc[person.id] = person.profile?.nicknames ?? "";
          return acc;
        }, {})
      );
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
      computeGraphLayout({
        people: sortedPeople.map((person) => ({
          id: person.id,
          name: getPersonDisplayLabel(person)
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
        })
        .catch((err: unknown) => {
          if (layoutRequestIdRef.current !== layoutRequestId) {
            return;
          }
          setServerLayout(null);
          setStatus(`Server layout failed: ${getErrorMessage(err)}. Using a local graph layout.`);
        });
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error));
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [currentUserName, isSavingProfile, isSavingRelationship, savingFamilyId]);

  const handleFamilyPatch = useCallback(
    async (familyId: string, body: PatchFamilyBody) => {
      setSavingFamilyId(familyId);
      try {
        await patchFamily(familyId, body);
        const structureChanged =
          body.children !== undefined ||
          body.parent1ImmichPersonId !== undefined ||
          body.parent2ImmichPersonId !== undefined;
        if (structureChanged) {
          await refreshGraphData();
        } else {
          const pid = selectedPersonIdRef.current;
          if (pid) {
            const next = await getFamiliesForPerson(pid);
            setFamiliesByPersonId((current) => ({ ...current, [pid]: next }));
          }
        }
      } finally {
        setSavingFamilyId(null);
      }
    },
    [refreshGraphData]
  );

  const handleFamilyDelete = useCallback(
    async (familyId: string) => {
      setSavingFamilyId(familyId);
      try {
        await deleteFamily(familyId);
        setFamiliesByPersonId({});
        await refreshGraphData();
      } finally {
        setSavingFamilyId(null);
      }
    },
    [refreshGraphData]
  );

  useEffect(() => {
    refreshGraphData().catch((error: unknown) => {
      setStatus(getErrorMessage(error));
    });
  }, [refreshGraphData]);

  const selectedPerson = useMemo(
    () => people.find((person) => person.id === selectedPersonId) ?? null,
    [people, selectedPersonId]
  );

  const selectedProfileEventFields = useMemo(() => {
    if (!selectedPerson) {
      return { birthDate: "", deathDate: "", birthCity: "", birthCountry: "" };
    }
    const pid = selectedPerson.id;
    return (
      profileEventFieldsByPersonId[pid] ?? deriveProfileDisplayValuesFromLifeEvents(lifeEventsByPersonId[pid])
    );
  }, [selectedPerson, profileEventFieldsByPersonId, lifeEventsByPersonId]);

  const lifeEventsForSelected = selectedPerson ? lifeEventsByPersonId[selectedPerson.id] : undefined;
  useEffect(() => {
    if (!selectedPerson) {
      return;
    }
    if (lifeEventsForSelected !== undefined) {
      return;
    }
    let cancelled = false;
    getPersonLifeEvents(selectedPerson.id, { includeCitations: true })
      .then((events) => {
        if (cancelled) {
          return;
        }
        setLifeEventsByPersonId((current) => ({
          ...current,
          [selectedPerson.id]: events
        }));
        const values = deriveProfileDisplayValuesFromLifeEvents(events);
        setProfileEventFieldsByPersonId((current) => ({
          ...current,
          [selectedPerson.id]: values
        }));
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setStatus(`Could not load life events: ${getErrorMessage(err)}`);
        setLifeEventsByPersonId((current) => ({
          ...current,
          [selectedPerson.id]: []
        }));
        setProfileEventFieldsByPersonId((current) => ({
          ...current,
          [selectedPerson.id]: deriveProfileDisplayValuesFromLifeEvents([])
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [lifeEventsForSelected, selectedPerson]);

  const timelineForSelected = selectedPerson ? personTimelineById[selectedPerson.id] : undefined;
  useEffect(() => {
    if (!selectedPerson) {
      return;
    }
    if (timelineForSelected !== undefined) {
      return;
    }
    let cancelled = false;
    getPersonTimeline(selectedPerson.id)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setPersonTimelineById((current) => ({
          ...current,
          [selectedPerson.id]: response.timeline
        }));
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setStatus(`Could not load timeline: ${getErrorMessage(err)}`);
        setPersonTimelineById((current) => ({
          ...current,
          [selectedPerson.id]: []
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPerson, timelineForSelected]);

  const researchForSelected = selectedPerson ? researchTasksByPersonId[selectedPerson.id] : undefined;
  useEffect(() => {
    if (!selectedPerson) {
      return;
    }
    if (researchForSelected !== undefined) {
      return;
    }
    let cancelled = false;
    getResearchTasks(selectedPerson.id)
      .then((tasks) => {
        if (cancelled) {
          return;
        }
        setResearchTasksByPersonId((current) => ({
          ...current,
          [selectedPerson.id]: tasks
        }));
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setStatus(`Could not load research tasks: ${getErrorMessage(err)}`);
        setResearchTasksByPersonId((current) => ({
          ...current,
          [selectedPerson.id]: []
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [researchForSelected, selectedPerson]);

  const familiesForSelected = selectedPerson ? familiesByPersonId[selectedPerson.id] : undefined;
  useEffect(() => {
    if (!selectedPerson) {
      return;
    }
    if (familiesForSelected !== undefined) {
      return;
    }
    let cancelled = false;
    getFamiliesForPerson(selectedPerson.id)
      .then((families) => {
        if (cancelled) {
          return;
        }
        setFamiliesByPersonId((current) => ({
          ...current,
          [selectedPerson.id]: families
        }));
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setStatus(`Could not load families: ${getErrorMessage(err)}`);
        setFamiliesByPersonId((current) => ({
          ...current,
          [selectedPerson.id]: []
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [familiesForSelected, selectedPerson]);

  useEffect(() => {
    if (!selectedPerson) {
      return;
    }
    const fams = familiesForSelected;
    if (fams === undefined) {
      return;
    }
    const toFetch = fams.map((f) => f.id).filter((id) => familyLifeEventsById[id] === undefined);
    if (toFetch.length === 0) {
      return;
    }
    let cancelled = false;
    Promise.all(
      toFetch.map((id) =>
        getFamilyLifeEvents(id, { includeCitations: true }).then((events) => [id, events] as const)
      )
    )
      .then((rows) => {
        if (cancelled) {
          return;
        }
        setFamilyLifeEventsById((current) => {
          const next = { ...current };
          for (const [id, events] of rows) {
            next[id] = events;
          }
          return next;
        });
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setStatus(`Could not load some family life events: ${getErrorMessage(err)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [familyLifeEventsById, familiesForSelected, selectedPerson]);

  useEffect(() => {
    if (!selectedPersonId) {
      return;
    }
    const pid = selectedPersonId;
    const ids = new Set<string>();
    for (const rel of relationships) {
      if (rel.type === "SPOUSE_OF" && rel.id && (rel.fromPersonId === pid || rel.toPersonId === pid)) {
        ids.add(rel.id);
      }
    }
    const toFetch = [...ids].filter((id) => relationshipLifeEventsById[id] === undefined);
    if (toFetch.length === 0) {
      return;
    }
    let cancelled = false;
    Promise.all(
      toFetch.map((id) =>
        getRelationshipLifeEvents(id, { includeCitations: true }).then((events) => [id, events] as const)
      )
    )
      .then((rows) => {
        if (cancelled) {
          return;
        }
        setRelationshipLifeEventsById((current) => {
          const next = { ...current };
          for (const [id, events] of rows) {
            next[id] = events;
          }
          return next;
        });
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setStatus(`Could not load some relationship life events: ${getErrorMessage(err)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPersonId, relationships, relationshipLifeEventsById]);

  useEffect(() => {
    if (!status) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setStatus(null);
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [status]);

  useEffect(() => {
    setLocalStorageItem(WORKSPACE_STORAGE_KEY, activeWorkspace);
  }, [activeWorkspace]);

  useEffect(() => {
    setLocalStorageItem(LEFT_PANE_OPEN_STORAGE_KEY, leftPaneOpen ? "true" : "false");
  }, [leftPaneOpen]);

  useEffect(() => {
    setLocalStorageItem(CONTEXT_OPEN_STORAGE_KEY, contextPaneOpen ? "true" : "false");
  }, [contextPaneOpen]);

  useEffect(() => {
    const el = workspaceMainViewsRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (layoutResizeRafRef.current != null) {
        return;
      }
      layoutResizeRafRef.current = window.requestAnimationFrame(() => {
        layoutResizeRafRef.current = null;
        setLayoutResizeSignal((n) => n + 1);
      });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (layoutResizeRafRef.current != null) {
        window.cancelAnimationFrame(layoutResizeRafRef.current);
        layoutResizeRafRef.current = null;
      }
    };
  }, []);

  const onPreferencesChange = useCallback((prefs: Partial<UserPreferences>) => {
    setSavedPreferences((current) => ({
      ...(current ?? {}),
      ...prefs,
      dismissedSuggestions: prefs.dismissedSuggestions ?? current?.dismissedSuggestions,
      familyViewStyle: prefs.familyViewStyle ?? current?.familyViewStyle,
      graphFilterVisibility: prefs.graphFilterVisibility ?? current?.graphFilterVisibility,
      lastSelectedPersonId:
        prefs.lastSelectedPersonId !== undefined ? prefs.lastSelectedPersonId : current?.lastSelectedPersonId,
      primaryFamilyUnitByPersonId: prefs.primaryFamilyUnitByPersonId ?? current?.primaryFamilyUnitByPersonId
    }));
    void updateUserPreferences(prefs)
      .then((nextPrefs) => {
        setSavedPreferences(nextPrefs);
      })
      .catch((err: unknown) => {
        setStatus(`Could not save preferences: ${getErrorMessage(err)}`);
      });
  }, []);

  const onPrimaryFamilyUnitChange = useCallback(
    (personId: string, unitKey: string | null) => {
      const current = savedPreferences?.primaryFamilyUnitByPersonId ?? {};
      const next = { ...current };
      if (!unitKey) {
        delete next[personId];
      } else {
        next[personId] = unitKey;
      }
      onPreferencesChange({ primaryFamilyUnitByPersonId: next });
    },
    [onPreferencesChange, savedPreferences?.primaryFamilyUnitByPersonId]
  );

  const onDismissSuggestion = useCallback(
    (suggestionKey: string) => {
      const dismissedSuggestions = new Set(savedPreferences?.dismissedSuggestions ?? []);
      dismissedSuggestions.add(suggestionKey);
      onPreferencesChange({
        dismissedSuggestions: [...dismissedSuggestions].sort((left, right) => left.localeCompare(right))
      });
    },
    [onPreferencesChange, savedPreferences?.dismissedSuggestions]
  );

  const clearGraphFocus = useCallback(() => setGraphFocusPersonId(null), []);
  const clearGraphCameraFocus = useCallback(() => setGraphCameraFocusPersonId(null), []);

  const focusPersonInGraph = useCallback((personId: string) => {
    setGraphFocusPersonId(personId);
    setSelectedPersonId(personId);
  }, []);
  const getPersonLabelForMap = useCallback(
    (personId: string) => people.find((person) => person.id === personId)?.name ?? personId,
    [people]
  );

  const onProfileSave = useCallback(async () => {
    if (!selectedPerson) {
      return;
    }
    const normalizeOptionalString = (value: string) => {
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    };
    const selectedGender = genderByPersonId[selectedPerson.id] ?? "UNKNOWN";
    const pid = selectedPerson.id;
    const eventFormFields =
      profileEventFieldsByPersonId[pid] ??
      deriveProfileDisplayValuesFromLifeEvents(lifeEventsByPersonId[pid]);
    const rawBirthDate = (eventFormFields.birthDate ?? "").trim();
    const selectedGivenName = normalizeOptionalString(givenNameByPersonId[selectedPerson.id] ?? "");
    const selectedSurname = normalizeOptionalString(surnameByPersonId[selectedPerson.id] ?? "");
    const selectedNicknames = normalizeOptionalString(nicknamesByPersonId[selectedPerson.id] ?? "");
    const selectedDeathDate = eventFormFields.deathDate || null;
    const selectedBirthCity = normalizeOptionalString(eventFormFields.birthCity ?? "");
    const selectedBirthCountry = normalizeOptionalString(eventFormFields.birthCountry ?? "");
    const birthParts = rawBirthDate ? parseDateInputToParts(rawBirthDate) : null;
    const deathParts = selectedDeathDate ? parseDateInputToParts(selectedDeathDate) : null;
    if (rawBirthDate && !birthParts) {
      setStatus("Birth date must be a valid YYYY-MM-DD date.");
      return;
    }
    if (selectedDeathDate && !deathParts) {
      setStatus("Death date must be a valid YYYY-MM-DD date.");
      return;
    }
    setIsSavingProfile(true);
    try {
      const resolvedEvents =
        lifeEventsByPersonId[selectedPerson.id] ??
        (await getPersonLifeEvents(selectedPerson.id, { includeCitations: true }));
      const nextLifeEvents = [...resolvedEvents];
      const findEvent = (eventType: "BIRTH" | "DEATH") =>
        nextLifeEvents.find((event) => event.eventType === eventType) ?? null;
      const replaceEvent = (event: LifeEventRecord) => {
        const index = nextLifeEvents.findIndex((current) => current.id === event.id);
        if (index >= 0) {
          nextLifeEvents[index] = event;
          return;
        }
        nextLifeEvents.push(event);
      };
      const removeEvent = (eventId: string) => {
        const index = nextLifeEvents.findIndex((event) => event.id === eventId);
        if (index >= 0) {
          nextLifeEvents.splice(index, 1);
        }
      };

      const birthPlaceInput = buildBirthPlaceInput(selectedBirthCity, selectedBirthCountry);
      const shouldPersistBirthEvent = Boolean(birthParts || birthPlaceInput);
      const existingBirthEvent = findEvent("BIRTH");
      if (!shouldPersistBirthEvent && existingBirthEvent) {
        await deletePersonLifeEvent(selectedPerson.id, existingBirthEvent.id);
        removeEvent(existingBirthEvent.id);
      } else if (shouldPersistBirthEvent) {
        const resolvedBirthParts =
          birthParts ??
          (existingBirthEvent
            ? {
                year: existingBirthEvent.year,
                month: existingBirthEvent.month,
                day: existingBirthEvent.day
              }
            : null);
        if (existingBirthEvent) {
          const updatedBirth = await updatePersonLifeEvent(selectedPerson.id, existingBirthEvent.id, {
            dateQualifier: "EXACT",
            year: resolvedBirthParts?.year ?? null,
            month: resolvedBirthParts?.month ?? null,
            day: resolvedBirthParts?.day ?? null,
            place: birthPlaceInput,
            placeId: birthPlaceInput ? undefined : null
          });
          replaceEvent(updatedBirth);
        } else {
          const createdBirth = await createPersonLifeEvent(selectedPerson.id, {
            eventType: "BIRTH",
            dateQualifier: "EXACT",
            year: resolvedBirthParts?.year ?? null,
            month: resolvedBirthParts?.month ?? null,
            day: resolvedBirthParts?.day ?? null,
            place: birthPlaceInput
          });
          replaceEvent(createdBirth);
        }
      }

      const existingDeathEvent = findEvent("DEATH");
      if (!deathParts && existingDeathEvent) {
        await deletePersonLifeEvent(selectedPerson.id, existingDeathEvent.id);
        removeEvent(existingDeathEvent.id);
      } else if (deathParts) {
        if (existingDeathEvent) {
          const updatedDeath = await updatePersonLifeEvent(selectedPerson.id, existingDeathEvent.id, {
            dateQualifier: "EXACT",
            year: deathParts.year,
            month: deathParts.month,
            day: deathParts.day
          });
          replaceEvent(updatedDeath);
        } else {
          const createdDeath = await createPersonLifeEvent(selectedPerson.id, {
            eventType: "DEATH",
            dateQualifier: "EXACT",
            year: deathParts.year,
            month: deathParts.month,
            day: deathParts.day
          });
          replaceEvent(createdDeath);
        }
      }

      const savedProfile = await updatePersonProfile(selectedPerson.id, {
        gender: selectedGender,
        givenName: selectedGivenName,
        surname: selectedSurname,
        nicknames: selectedNicknames
      });
      const displayValues = deriveProfileDisplayValuesFromLifeEvents(nextLifeEvents);
      setPeople((current) =>
        current.map((person) =>
          person.id === selectedPerson.id
            ? {
                ...person,
                profile: savedProfile
              }
            : person
        )
      );
      setLifeEventsByPersonId((current) => ({
        ...current,
        [selectedPerson.id]: nextLifeEvents
      }));
      setGenderByPersonId((current) => ({
        ...current,
        [selectedPerson.id]: savedProfile.gender
      }));
      setGivenNameByPersonId((current) => ({
        ...current,
        [selectedPerson.id]: savedProfile.givenName ?? ""
      }));
      setSurnameByPersonId((current) => ({
        ...current,
        [selectedPerson.id]: savedProfile.surname ?? ""
      }));
      setNicknamesByPersonId((current) => ({
        ...current,
        [selectedPerson.id]: savedProfile.nicknames ?? ""
      }));
      setProfileEventFieldsByPersonId((current) => ({
        ...current,
        [selectedPerson.id]: displayValues
      }));
      profileDraftDirtyRef.current = false;
      void loadMapPlaces(mapIncludeLiving);
      setStatus("Profile saved");
    } catch (error: unknown) {
      setStatus(getErrorMessage(error));
    } finally {
      setIsSavingProfile(false);
    }
  }, [
    genderByPersonId,
    givenNameByPersonId,
    lifeEventsByPersonId,
    loadMapPlaces,
    mapIncludeLiving,
    nicknamesByPersonId,
    profileEventFieldsByPersonId,
    selectedPerson,
    surnameByPersonId
  ]);

  const onCreateRelationship = useCallback(
    async (sourcePersonId: string, targetPersonId: string, relationshipType: RelationshipType) => {
      setIsSavingRelationship(true);
      try {
        await createRelationship(sourcePersonId, targetPersonId, relationshipType);
        await refreshGraphData();
        setStatus("Relationship saved");
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
        throw error;
      } finally {
        setIsSavingRelationship(false);
      }
    },
    [refreshGraphData]
  );

  const onDeleteExistingRelationship = useCallback(
    async (relationship: RelationshipRecord) => {
      setIsSavingRelationship(true);
      try {
        await deleteRelationship(relationship.fromPersonId, relationship.toPersonId, relationship.type);
        await refreshGraphData();
        setStatus("Relationship deleted");
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
        throw error;
      } finally {
        setIsSavingRelationship(false);
      }
    },
    [refreshGraphData]
  );

  const onUpdateExistingRelationship = useCallback(
    async (
      relationship: RelationshipRecord,
      relatedPersonId: string,
      relationshipType: RelationshipType,
      spouseDates?: {
        marriageAnniversaryDate?: string | null;
        divorceDate?: string | null;
      }
    ) => {
      if (!selectedPerson) {
        throw new Error("Select a person first.");
      }

      setIsSavingRelationship(true);
      try {
        const relationshipTypeUnchanged = relationship.type === relationshipType;
        if (relationshipTypeUnchanged && relationshipType === "SPOUSE_OF") {
          const rid = relationship.id;
          if (!rid) {
            setStatus("Cannot update spouse dates: relationship id is missing. Reload and try again.");
            return;
          }
          const marriageRaw = spouseDates?.marriageAnniversaryDate?.trim()
            ? spouseDates.marriageAnniversaryDate.trim()
            : "";
          const divorceRaw = spouseDates?.divorceDate?.trim() ? spouseDates.divorceDate.trim() : "";
          const marriageParts = marriageRaw ? parseDateInputToParts(marriageRaw) : null;
          const divorceParts = divorceRaw ? parseDateInputToParts(divorceRaw) : null;
          if (marriageRaw && !marriageParts) {
            setStatus("Marriage date must be a valid YYYY-MM-DD date.");
            return;
          }
          if (divorceRaw && !divorceParts) {
            setStatus("Divorce date must be a valid YYYY-MM-DD date.");
            return;
          }

          let resolved =
            relationshipLifeEventsById[rid] ??
            (await getRelationshipLifeEvents(rid, { includeCitations: true }));
          const next = [...resolved];
          const findEvent = (eventType: "MARRIAGE" | "DIVORCE") =>
            next.find((event) => event.eventType === eventType) ?? null;
          const replaceEvent = (event: LifeEventRecord) => {
            const index = next.findIndex((current) => current.id === event.id);
            if (index >= 0) {
              next[index] = event;
              return;
            }
            next.push(event);
          };
          const removeEvent = (eventId: string) => {
            const index = next.findIndex((event) => event.id === eventId);
            if (index >= 0) {
              next.splice(index, 1);
            }
          };

          const existingMarriage = findEvent("MARRIAGE");
          const existingDivorce = findEvent("DIVORCE");

          if (!marriageParts && existingMarriage) {
            await deleteRelationshipLifeEvent(rid, existingMarriage.id);
            removeEvent(existingMarriage.id);
          } else if (marriageParts) {
            if (existingMarriage) {
              const updated = await updateRelationshipLifeEvent(rid, existingMarriage.id, {
                dateQualifier: "EXACT",
                year: marriageParts.year,
                month: marriageParts.month,
                day: marriageParts.day
              });
              replaceEvent(updated);
            } else {
              const created = await createRelationshipLifeEvent(rid, {
                eventType: "MARRIAGE",
                dateQualifier: "EXACT",
                year: marriageParts.year,
                month: marriageParts.month,
                day: marriageParts.day
              });
              replaceEvent(created);
            }
          }

          if (!divorceParts && existingDivorce) {
            await deleteRelationshipLifeEvent(rid, existingDivorce.id);
            removeEvent(existingDivorce.id);
          } else if (divorceParts) {
            if (existingDivorce) {
              const updated = await updateRelationshipLifeEvent(rid, existingDivorce.id, {
                dateQualifier: "EXACT",
                year: divorceParts.year,
                month: divorceParts.month,
                day: divorceParts.day
              });
              replaceEvent(updated);
            } else {
              const created = await createRelationshipLifeEvent(rid, {
                eventType: "DIVORCE",
                dateQualifier: "EXACT",
                year: divorceParts.year,
                month: divorceParts.month,
                day: divorceParts.day
              });
              replaceEvent(created);
            }
          }

          setRelationshipLifeEventsById((current) => ({
            ...current,
            [rid]: next
          }));
          await refreshGraphData();
          setStatus("Relationship updated");
          return;
        }
        await deleteRelationship(relationship.fromPersonId, relationship.toPersonId, relationship.type);
        await createRelationship(selectedPerson.id, relatedPersonId, relationshipType);
        await refreshGraphData();
        setStatus("Relationship updated");
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
        throw error;
      } finally {
        setIsSavingRelationship(false);
      }
    },
    [refreshGraphData, selectedPerson, relationshipLifeEventsById]
  );

  const afterPersonLifeEventsUpdated = useCallback(async (personId: string) => {
    const ev = await getPersonLifeEvents(personId, { includeCitations: true });
    setLifeEventsByPersonId((current) => ({
      ...current,
      [personId]: ev
    }));
    const dv = deriveProfileDisplayValuesFromLifeEvents(ev);
    setProfileEventFieldsByPersonId((prev) => ({
      ...prev,
      [personId]: dv
    }));
  }, []);

  const handlePersonLifeEventCreate = useCallback(
    async (body: CreateLifeEventBody) => {
      if (!selectedPerson) {
        return;
      }
      try {
        await createPersonLifeEvent(selectedPerson.id, body);
        setStatus("Life event saved");
        await afterPersonLifeEventsUpdated(selectedPerson.id);
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
        throw error;
      }
    },
    [afterPersonLifeEventsUpdated, selectedPerson]
  );

  const handlePersonLifeEventPatch = useCallback(
    async (eventId: string, body: PatchLifeEventBody) => {
      if (!selectedPerson) {
        return;
      }
      try {
        await updatePersonLifeEvent(selectedPerson.id, eventId, body);
        setStatus("Life event saved");
        await afterPersonLifeEventsUpdated(selectedPerson.id);
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
        throw error;
      }
    },
    [afterPersonLifeEventsUpdated, selectedPerson]
  );

  const handlePersonLifeEventDelete = useCallback(
    async (eventId: string) => {
      if (!selectedPerson) {
        return;
      }
      try {
        await deletePersonLifeEvent(selectedPerson.id, eventId);
        setStatus("Life event deleted");
        await afterPersonLifeEventsUpdated(selectedPerson.id);
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
        throw error;
      }
    },
    [afterPersonLifeEventsUpdated, selectedPerson]
  );

  const refreshResearchTasksForSelectedPerson = useCallback(async () => {
    if (!selectedPerson) {
      return;
    }
    const tasks = await getResearchTasks(selectedPerson.id);
    setResearchTasksByPersonId((current) => ({
      ...current,
      [selectedPerson.id]: tasks
    }));
  }, [selectedPerson]);

  const handleResearchTaskCreate = useCallback(
    async (body: CreateResearchTaskBody) => {
      try {
        await createResearchTask(body);
        await refreshResearchTasksForSelectedPerson();
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
      }
    },
    [refreshResearchTasksForSelectedPerson]
  );

  const handleResearchTaskUpdate = useCallback(
    async (
      taskId: string,
      patch: Partial<Pick<ResearchTaskRecord, "title" | "status" | "dueDate" | "notes" | "immichPersonId">>
    ) => {
      try {
        await updateResearchTask(taskId, patch);
        await refreshResearchTasksForSelectedPerson();
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
      }
    },
    [refreshResearchTasksForSelectedPerson]
  );

  const handleResearchTaskDelete = useCallback(
    async (taskId: string) => {
      try {
        await deleteResearchTask(taskId);
        await refreshResearchTasksForSelectedPerson();
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
      }
    },
    [refreshResearchTasksForSelectedPerson]
  );

  const handleRelationshipLifeEventCreate = useCallback(
    async (relationshipId: string, body: CreateLifeEventBody) => {
      try {
        await createRelationshipLifeEvent(relationshipId, body);
        setStatus("Life event saved");
        const ev = await getRelationshipLifeEvents(relationshipId, { includeCitations: true });
        setRelationshipLifeEventsById((current) => ({ ...current, [relationshipId]: ev }));
        await refreshGraphData();
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
        throw error;
      }
    },
    [refreshGraphData]
  );

  const handleRelationshipLifeEventPatch = useCallback(
    async (relationshipId: string, eventId: string, body: PatchLifeEventBody) => {
      try {
        await updateRelationshipLifeEvent(relationshipId, eventId, body);
        setStatus("Life event saved");
        const ev = await getRelationshipLifeEvents(relationshipId, { includeCitations: true });
        setRelationshipLifeEventsById((current) => ({ ...current, [relationshipId]: ev }));
        await refreshGraphData();
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
        throw error;
      }
    },
    [refreshGraphData]
  );

  const handleRelationshipLifeEventDelete = useCallback(
    async (relationshipId: string, eventId: string) => {
      try {
        await deleteRelationshipLifeEvent(relationshipId, eventId);
        setStatus("Life event deleted");
        const ev = await getRelationshipLifeEvents(relationshipId, { includeCitations: true });
        setRelationshipLifeEventsById((current) => ({ ...current, [relationshipId]: ev }));
        await refreshGraphData();
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
        throw error;
      }
    },
    [refreshGraphData]
  );

  const handleFamilyLifeEventCreate = useCallback(async (familyId: string, body: CreateLifeEventBody) => {
    try {
      await createFamilyLifeEvent(familyId, body as CreateFamilyLifeEventBody);
      setStatus("Household event saved");
      const ev = await getFamilyLifeEvents(familyId, { includeCitations: true });
      setFamilyLifeEventsById((current) => ({ ...current, [familyId]: ev }));
    } catch (error: unknown) {
      setStatus(getErrorMessage(error));
      throw error;
    }
  }, []);

  const handleFamilyLifeEventPatch = useCallback(
    async (familyId: string, eventId: string, body: PatchLifeEventBody) => {
      try {
        await updateFamilyLifeEvent(familyId, eventId, body);
        setStatus("Household event saved");
        const ev = await getFamilyLifeEvents(familyId, { includeCitations: true });
        setFamilyLifeEventsById((current) => ({ ...current, [familyId]: ev }));
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
        throw error;
      }
    },
    []
  );

  const handleFamilyLifeEventDelete = useCallback(async (familyId: string, eventId: string) => {
    try {
      await deleteFamilyLifeEvent(familyId, eventId);
      setStatus("Household event deleted");
      const ev = await getFamilyLifeEvents(familyId, { includeCitations: true });
      setFamilyLifeEventsById((current) => ({ ...current, [familyId]: ev }));
    } catch (error: unknown) {
      setStatus(getErrorMessage(error));
      throw error;
    }
  }, []);

  const handleGenderChange = useCallback(
    (gender: Gender) => {
      if (!selectedPerson || !isGender(gender)) {
        return;
      }
      profileDraftDirtyRef.current = true;
      setGenderByPersonId((current) => ({
        ...current,
        [selectedPerson.id]: gender
      }));
    },
    [selectedPerson]
  );

  const handleBirthDateChange = useCallback(
    (birthDate: string) => {
      if (!selectedPerson) {
        return;
      }
      profileDraftDirtyRef.current = true;
      const pid = selectedPerson.id;
      setProfileEventFieldsByPersonId((current) => {
        const base = current[pid] ?? deriveProfileDisplayValuesFromLifeEvents(lifeEventsByPersonId[pid]);
        return {
          ...current,
          [pid]: { ...base, birthDate }
        };
      });
    },
    [lifeEventsByPersonId, selectedPerson]
  );

  const handleGivenNameChange = useCallback(
    (givenName: string) => {
      if (!selectedPerson) {
        return;
      }
      profileDraftDirtyRef.current = true;
      setGivenNameByPersonId((current) => ({
        ...current,
        [selectedPerson.id]: givenName
      }));
    },
    [selectedPerson]
  );

  const handleSurnameChange = useCallback(
    (surname: string) => {
      if (!selectedPerson) {
        return;
      }
      profileDraftDirtyRef.current = true;
      setSurnameByPersonId((current) => ({
        ...current,
        [selectedPerson.id]: surname
      }));
    },
    [selectedPerson]
  );

  const handleNicknamesChange = useCallback(
    (nicknames: string) => {
      if (!selectedPerson) {
        return;
      }
      profileDraftDirtyRef.current = true;
      setNicknamesByPersonId((current) => ({
        ...current,
        [selectedPerson.id]: nicknames
      }));
    },
    [selectedPerson]
  );

  const handleDeathDateChange = useCallback(
    (deathDate: string) => {
      if (!selectedPerson) {
        return;
      }
      profileDraftDirtyRef.current = true;
      const pid = selectedPerson.id;
      setProfileEventFieldsByPersonId((current) => {
        const base = current[pid] ?? deriveProfileDisplayValuesFromLifeEvents(lifeEventsByPersonId[pid]);
        return {
          ...current,
          [pid]: { ...base, deathDate }
        };
      });
    },
    [lifeEventsByPersonId, selectedPerson]
  );

  const handleBirthCityChange = useCallback(
    (birthCity: string) => {
      if (!selectedPerson) {
        return;
      }
      profileDraftDirtyRef.current = true;
      const pid = selectedPerson.id;
      setProfileEventFieldsByPersonId((current) => {
        const base = current[pid] ?? deriveProfileDisplayValuesFromLifeEvents(lifeEventsByPersonId[pid]);
        return {
          ...current,
          [pid]: { ...base, birthCity }
        };
      });
    },
    [lifeEventsByPersonId, selectedPerson]
  );

  const handleBirthCountryChange = useCallback(
    (birthCountry: string) => {
      if (!selectedPerson) {
        return;
      }
      profileDraftDirtyRef.current = true;
      const pid = selectedPerson.id;
      setProfileEventFieldsByPersonId((current) => {
        const base = current[pid] ?? deriveProfileDisplayValuesFromLifeEvents(lifeEventsByPersonId[pid]);
        return {
          ...current,
          [pid]: { ...base, birthCountry }
        };
      });
    },
    [lifeEventsByPersonId, selectedPerson]
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
    onPreferencesChange({ lastSelectedPersonId: selectedPersonId });
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
        .then((r) => {
          setTreeValidationEngineDisabled(r.engineDisabled);
          setTreeValidationIssueCount(r.findings.length);
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
  }, [isLoading, people, relationships]);

  useEffect(() => {
    if (activeWorkspace !== "places") {
      return;
    }
    void loadMapPlaces(mapIncludeLiving);
  }, [activeWorkspace, loadMapPlaces, mapIncludeLiving]);

  const noRelationshipsDefaultsEnabled = !hasRelationships && !savedPreferences?.graphFilterVisibility;

  const handleWorkspaceNavKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nextIndex =
      event.key === "ArrowDown"
        ? (index + 1) % WORKSPACE_ITEMS.length
        : (index - 1 + WORKSPACE_ITEMS.length) % WORKSPACE_ITEMS.length;
    workspaceButtonRefs.current[nextIndex]?.focus();
  }, []);

  const renderSecondaryWorkspace = () => {
    if (activeWorkspace === "evidence") {
      return (
        <section className="workspace-main-stack workspace-main-stack--evidence">
          <section className="card stack">
            <h2>Evidence workspace</h2>
            <p className="hint">
              Manage repositories, sources, and linked media outside of the person profile flow.
            </p>
          </section>
          {import.meta.env.VITE_EVIDENCE_MANAGEMENT_UI !== "false" ? (
            <>
              <EvidenceLibrariesSection />
              <EvidenceMediaSection />
            </>
          ) : (
            <section className="card stack">
              <p className="hint">Evidence workspace is disabled by feature flag.</p>
            </section>
          )}
        </section>
      );
    }

    if (activeWorkspace === "interchange") {
      return (
        <section className="workspace-main-stack workspace-main-stack--interchange">
          <section className="card stack">
            <h2>Interchange workspace</h2>
            <p className="hint">Use this space for GEDCOM import/export without crowding person editing.</p>
          </section>
          <GedcomInterchangeSection people={people} onTreeChanged={() => void refreshGraphData()} />
        </section>
      );
    }

    if (activeWorkspace === "research") {
      return (
        <section className="card stack workspace-placeholder">
          <h2>Research workspace</h2>
          <p className="hint">
            Research tasks and validation will land here as dedicated modules while remaining available in the
            tree inspector for now.
          </p>
        </section>
      );
    }

    if (activeWorkspace === "reports") {
      return (
        <section className="card stack workspace-placeholder">
          <h2>Reports workspace</h2>
          <p className="hint">Reserved for lineage, completeness, and quality reports.</p>
        </section>
      );
    }

    if (activeWorkspace === "settings") {
      return (
        <section className="card stack workspace-placeholder">
          <h2>Settings workspace</h2>
          <p className="hint">Reserved for global app and workspace preferences.</p>
        </section>
      );
    }

    return null;
  };

  const workspaceLayoutStyle = useMemo(
    () =>
      ({
        "--workspace-left-width": leftPaneOpen ? "206px" : "0px",
        "--workspace-right-width": contextPaneOpen ? "360px" : "0px"
      }) as CSSProperties,
    [contextPaneOpen, leftPaneOpen]
  );

  return (
    <section
      className="people-layout people-layout--workspace"
      style={workspaceLayoutStyle}
      aria-label="People workspace: navigation, main view, and context"
    >
      <aside
        className={`workspace-nav workspace-nav--expanded ${leftPaneOpen ? "" : "workspace-pane--closed"}`}
      >
        <nav aria-label="Workspace navigation" className="workspace-nav-list">
          {WORKSPACE_ITEMS.map((workspace, index) => {
            const isActive = workspace.id === activeWorkspace;
            return (
              <button
                key={workspace.id}
                data-workspace={workspace.id}
                ref={(node) => {
                  workspaceButtonRefs.current[index] = node;
                }}
                type="button"
                className={`workspace-nav-item ${isActive ? "workspace-nav-item--active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                onKeyDown={(event) => handleWorkspaceNavKeyDown(event, index)}
                onClick={() => setActiveWorkspace(workspace.id)}
              >
                <span className="workspace-nav-icon" aria-hidden="true">
                  {workspace.iconLabel}
                </span>
                <span className="workspace-nav-label">{workspace.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <button
        type="button"
        className="secondary-button workspace-column-toggle workspace-column-toggle--left"
        onClick={() => setLeftPaneOpen((current) => !current)}
        aria-label={
          leftPaneOpen ? "Collapse workspace navigation column" : "Expand workspace navigation column"
        }
        title={leftPaneOpen ? "Collapse left column (workspace nav)" : "Expand left column (workspace nav)"}
      >
        <span className="workspace-column-toggle-hint" aria-hidden="true">
          Nav
        </span>
        <span className="workspace-column-grip" aria-hidden="true">
          ||
        </span>
      </button>

      <section className="workspace-main">
        <div className="workspace-main-views" ref={workspaceMainViewsRef}>
          <section
            className={`people-main-column ${activeWorkspace === "tree" ? "" : "workspace-view-hidden"}`}
            aria-hidden={activeWorkspace !== "tree"}
          >
            {activeWorkspace === "tree" ? (
              <PeopleGraph3D
                people={people}
                relationships={relationships}
                serverPositionsByPersonId={serverLayout?.positionsByPersonId}
                serverLayoutRevision={serverLayout?.layoutRevision ?? null}
                serverLayoutAlgorithmVersion={serverLayout?.algorithmVersion ?? null}
                selectedPersonId={selectedPersonId}
                status={status}
                isLoading={isLoading}
                isSavingRelationship={isSavingRelationship}
                loadError={loadError}
                focusPersonRequest={graphFocusPersonId}
                cameraFocusPersonRequest={graphCameraFocusPersonId}
                noRelationshipsGraphFilterVisibility={noRelationshipsGraphFilterVisibility}
                defaultToNoRelationshipsGraphState={noRelationshipsDefaultsEnabled}
                savedPreferences={savedPreferences}
                treeValidationIssueCount={treeValidationIssueCount}
                treeValidationEngineDisabled={treeValidationEngineDisabled}
                onFocusPersonConsumed={clearGraphFocus}
                onCameraFocusPersonConsumed={clearGraphCameraFocus}
                onSelectedPersonChange={setSelectedPersonId}
                onCreateRelationship={onCreateRelationship}
                onPreferencesChange={onPreferencesChange}
                graphKeyboardEnabled
                layoutResizeSignal={layoutResizeSignal}
              />
            ) : null}
          </section>
          <section
            className={`workspace-main-stack workspace-main-stack--places ${
              activeWorkspace === "places" ? "" : "workspace-view-hidden"
            }`}
            aria-hidden={activeWorkspace !== "places"}
          >
            <section className="card stack">
              <h2>Places workspace</h2>
              <p className="hint">Review mapped places and focus people from geographic context.</p>
            </section>
            {activeWorkspace === "places" ? (
              <MapPlacesPanel
                mapUiEnabled={mapUiEnabled}
                places={mapPlaces}
                isLoading={mapLoading}
                includeLiving={mapIncludeLiving}
                onIncludeLivingChange={setMapIncludeLiving}
                onFocusPerson={focusPersonInGraph}
                getPersonLabel={getPersonLabelForMap}
                selectedPersonId={selectedPersonId}
                error={mapLoadError}
                layoutResizeSignal={layoutResizeSignal}
              />
            ) : null}
          </section>
          {activeWorkspace !== "tree" ? renderSecondaryWorkspace() : null}
        </div>
      </section>
      <button
        type="button"
        className="secondary-button workspace-column-toggle workspace-column-toggle--right"
        onClick={() => setContextPaneOpen((current) => !current)}
        aria-label={contextPaneOpen ? "Collapse person context column" : "Expand person context column"}
        title={
          contextPaneOpen ? "Collapse right column (person context)" : "Expand right column (person context)"
        }
      >
        <span className="workspace-column-toggle-hint" aria-hidden="true">
          Profile
        </span>
        <span className="workspace-column-grip" aria-hidden="true">
          ||
        </span>
      </button>

      <aside
        className={`people-sidebar workspace-context-pane ${contextPaneOpen ? "" : "workspace-pane--closed"}`}
      >
        <div
          className={activeWorkspace === "tree" ? "workspace-tree-context" : "workspace-view-hidden"}
          inert={activeWorkspace !== "tree" ? true : undefined}
          aria-hidden={activeWorkspace !== "tree"}
        >
          <PersonDetailPanel
            person={selectedPerson}
            people={people}
            relationships={relationships}
            dismissedSuggestionKeys={savedPreferences?.dismissedSuggestions ?? []}
            genders={genders}
            genderValue={selectedPerson ? (genderByPersonId[selectedPerson.id] ?? "UNKNOWN") : "UNKNOWN"}
            onGenderChange={handleGenderChange}
            birthDateValue={selectedProfileEventFields.birthDate}
            onBirthDateChange={handleBirthDateChange}
            givenNameValue={selectedPerson ? (givenNameByPersonId[selectedPerson.id] ?? "") : ""}
            surnameValue={selectedPerson ? (surnameByPersonId[selectedPerson.id] ?? "") : ""}
            nicknamesValue={selectedPerson ? (nicknamesByPersonId[selectedPerson.id] ?? "") : ""}
            deathDateValue={selectedProfileEventFields.deathDate}
            birthCityValue={selectedProfileEventFields.birthCity}
            birthCountryValue={selectedProfileEventFields.birthCountry}
            onGivenNameChange={handleGivenNameChange}
            onSurnameChange={handleSurnameChange}
            onNicknamesChange={handleNicknamesChange}
            onDeathDateChange={handleDeathDateChange}
            onBirthCityChange={handleBirthCityChange}
            onBirthCountryChange={handleBirthCountryChange}
            onProfileSave={onProfileSave}
            isSavingProfile={isSavingProfile}
            onFocusPerson={focusPersonInGraph}
            onCreateRelationship={onCreateRelationship}
            onUpdateRelationship={onUpdateExistingRelationship}
            onDeleteRelationship={onDeleteExistingRelationship}
            onDismissSuggestion={onDismissSuggestion}
            isSavingRelationship={isSavingRelationship}
            immichBaseUrl={immichBaseUrl}
            primaryFamilyUnitByPersonId={savedPreferences?.primaryFamilyUnitByPersonId ?? {}}
            onPrimaryFamilyUnitChange={onPrimaryFamilyUnitChange}
            relationshipLifeEventsById={relationshipLifeEventsById}
            personLifeEvents={selectedPerson ? lifeEventsByPersonId[selectedPerson.id] : undefined}
            onPersonLifeEventCreate={handlePersonLifeEventCreate}
            onPersonLifeEventPatch={handlePersonLifeEventPatch}
            onPersonLifeEventDelete={handlePersonLifeEventDelete}
            onRelationshipLifeEventCreate={handleRelationshipLifeEventCreate}
            onRelationshipLifeEventPatch={handleRelationshipLifeEventPatch}
            onRelationshipLifeEventDelete={handleRelationshipLifeEventDelete}
            onPersonNamesChanged={refreshPeopleOnly}
            personTimeline={selectedPerson ? personTimelineById[selectedPerson.id] : undefined}
            researchTasks={selectedPerson ? researchTasksByPersonId[selectedPerson.id] : undefined}
            families={selectedPerson ? familiesByPersonId[selectedPerson.id] : undefined}
            onFamilyPatch={handleFamilyPatch}
            onFamilyDelete={handleFamilyDelete}
            savingFamilyId={savingFamilyId}
            familyLifeEventsById={familyLifeEventsById}
            onFamilyLifeEventCreate={handleFamilyLifeEventCreate}
            onFamilyLifeEventPatch={handleFamilyLifeEventPatch}
            onFamilyLifeEventDelete={handleFamilyLifeEventDelete}
            onResearchTaskCreate={handleResearchTaskCreate}
            onResearchTaskUpdate={handleResearchTaskUpdate}
            onResearchTaskDelete={handleResearchTaskDelete}
          />
        </div>
        {activeWorkspace !== "tree" ? (
          <section
            className="card stack workspace-context-placeholder"
            hidden={!contextPaneOpen}
            aria-hidden={!contextPaneOpen}
          >
            <p className="hint">
              Optional context for {activeWorkspace} will appear here as this workspace gains secondary
              details, filters, and inspectors.
            </p>
          </section>
        ) : null}
      </aside>
    </section>
  );
};
