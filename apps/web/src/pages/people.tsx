import { filterGraphLayoutTopologyRelationships } from "@treemich/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Gender,
  GraphLayoutResponse,
  ImmichPerson,
  LifeEventRecord,
  RelationshipRecord,
  RelationshipType,
  UserPreferences
} from "../lib/api";
import {
  createPersonLifeEvent,
  computeGraphLayout,
  createRelationship,
  deletePersonLifeEvent,
  deleteRelationship,
  getImmichPeople,
  getPersonLifeEvents,
  getRelationships,
  getUserPreferences,
  updatePersonLifeEvent,
  updateSpouseRelationshipDates,
  updatePersonProfile,
  updateUserPreferences
} from "../lib/api";
import { PersonDetailPanel } from "../components/PersonDetailPanel";
import { PeopleGraph3D } from "../components/PeopleGraph3D";

const genders: Gender[] = ["MALE", "FEMALE", "OTHER", "UNKNOWN"];
const isGender = (value: string): value is Gender => genders.includes(value as Gender);
const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unknown error");
const toDateInputValue = (value?: string | null) => {
  if (!value) {
    return "";
  }

  const isoDateMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDateMatch?.[1]) {
    return isoDateMatch[1];
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
};

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

const toDateInputValueFromEvent = (
  event: Pick<LifeEventRecord, "year" | "month" | "day"> | null | undefined
) => {
  if (event?.year == null || event.month == null || event.day == null) {
    return "";
  }
  return `${String(event.year).padStart(4, "0")}-${String(event.month).padStart(2, "0")}-${String(event.day).padStart(2, "0")}`;
};

type IsoDateParts = { year: number; month: number; day: number };

export const parseDateInputToParts = (value: string): IsoDateParts | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
};

export const buildBirthPlaceInput = (city: string | null, country: string | null) => {
  if (!city && !country) {
    return null;
  }
  const cityPart = city?.trim() ? city.trim() : null;
  const countryPart = country?.trim() ? country.trim() : null;
  const countryCode = countryPart && countryPart.length === 2 ? countryPart.toUpperCase() : null;
  const placeName = [cityPart, countryPart].filter((value): value is string => Boolean(value)).join(", ");
  return {
    name: placeName || cityPart || countryPart || "Birth place",
    locality: cityPart,
    countryCode
  };
};

export const deriveProfileDisplayValues = (
  person: ImmichPerson,
  lifeEvents: LifeEventRecord[] | undefined
): { birthDate: string; deathDate: string; birthCity: string; birthCountry: string } => {
  const fallback = {
    birthDate: toDateInputValue(person.birthDate),
    deathDate: toDateInputValue(person.profile?.deathDate),
    birthCity: person.profile?.birthCity ?? "",
    birthCountry: person.profile?.birthCountry ?? ""
  };
  if (!lifeEvents) {
    return fallback;
  }
  const birthEvent = lifeEvents.find((event) => event.eventType === "BIRTH") ?? null;
  const deathEvent = lifeEvents.find((event) => event.eventType === "DEATH") ?? null;
  return {
    birthDate: birthEvent ? toDateInputValueFromEvent(birthEvent) : fallback.birthDate,
    deathDate: deathEvent ? toDateInputValueFromEvent(deathEvent) : fallback.deathDate,
    birthCity: birthEvent ? (birthEvent.place?.locality ?? "") : fallback.birthCity,
    birthCountry: birthEvent ? (birthEvent.place?.countryCode ?? "") : fallback.birthCountry
  };
};

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
  const [people, setPeople] = useState<ImmichPerson[]>([]);
  const [relationships, setRelationships] = useState<RelationshipRecord[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [graphFocusPersonId, setGraphFocusPersonId] = useState<string | null>(null);
  const [graphCameraFocusPersonId, setGraphCameraFocusPersonId] = useState<string | null>(null);
  const [genderByPersonId, setGenderByPersonId] = useState<Record<string, Gender>>({});
  const [birthDateByPersonId, setBirthDateByPersonId] = useState<Record<string, string>>({});
  const [givenNameByPersonId, setGivenNameByPersonId] = useState<Record<string, string>>({});
  const [surnameByPersonId, setSurnameByPersonId] = useState<Record<string, string>>({});
  const [nicknamesByPersonId, setNicknamesByPersonId] = useState<Record<string, string>>({});
  const [deathDateByPersonId, setDeathDateByPersonId] = useState<Record<string, string>>({});
  const [birthCityByPersonId, setBirthCityByPersonId] = useState<Record<string, string>>({});
  const [birthCountryByPersonId, setBirthCountryByPersonId] = useState<Record<string, string>>({});
  const [lifeEventsByPersonId, setLifeEventsByPersonId] = useState<Record<string, LifeEventRecord[]>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingRelationship, setIsSavingRelationship] = useState(false);
  const [savedPreferences, setSavedPreferences] = useState<UserPreferences | null>(null);
  const [serverLayout, setServerLayout] = useState<GraphLayoutResponse | null>(null);
  const selectedPersonIdRef = useRef<string | null>(null);
  const lastPersistedSelectionRef = useRef<string | null>(null);
  const layoutRequestIdRef = useRef(0);

  useEffect(() => {
    selectedPersonIdRef.current = selectedPersonId;
  }, [selectedPersonId]);

  const refreshGraphData = useCallback(async () => {
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
      setGenderByPersonId(
        sortedPeople.reduce<Record<string, Gender>>((acc, person) => {
          acc[person.id] = person.profile?.gender ?? "UNKNOWN";
          return acc;
        }, {})
      );
      setBirthDateByPersonId(
        sortedPeople.reduce<Record<string, string>>((acc, person) => {
          acc[person.id] = toDateInputValue(person.birthDate);
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
      setDeathDateByPersonId(
        sortedPeople.reduce<Record<string, string>>((acc, person) => {
          acc[person.id] = toDateInputValue(person.profile?.deathDate);
          return acc;
        }, {})
      );
      setBirthCityByPersonId(
        sortedPeople.reduce<Record<string, string>>((acc, person) => {
          acc[person.id] = person.profile?.birthCity ?? "";
          return acc;
        }, {})
      );
      setBirthCountryByPersonId(
        sortedPeople.reduce<Record<string, string>>((acc, person) => {
          acc[person.id] = person.profile?.birthCountry ?? "";
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
        people: sortedPeople.map((person) => ({ id: person.id, name: person.name })),
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
        .catch(() => {
          if (layoutRequestIdRef.current !== layoutRequestId) {
            return;
          }
          setServerLayout(null);
        });
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error));
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [currentUserName]);

  useEffect(() => {
    refreshGraphData().catch((error: unknown) => {
      setStatus(getErrorMessage(error));
    });
  }, [refreshGraphData]);

  const selectedPerson = useMemo(
    () => people.find((person) => person.id === selectedPersonId) ?? null,
    [people, selectedPersonId]
  );

  useEffect(() => {
    if (!selectedPerson) {
      return;
    }
    if (lifeEventsByPersonId[selectedPerson.id] !== undefined) {
      return;
    }
    let cancelled = false;
    getPersonLifeEvents(selectedPerson.id)
      .then((events) => {
        if (cancelled) {
          return;
        }
        setLifeEventsByPersonId((current) => ({
          ...current,
          [selectedPerson.id]: events
        }));
        const values = deriveProfileDisplayValues(selectedPerson, events);
        setBirthDateByPersonId((current) => ({ ...current, [selectedPerson.id]: values.birthDate }));
        setDeathDateByPersonId((current) => ({ ...current, [selectedPerson.id]: values.deathDate }));
        setBirthCityByPersonId((current) => ({ ...current, [selectedPerson.id]: values.birthCity }));
        setBirthCountryByPersonId((current) => ({ ...current, [selectedPerson.id]: values.birthCountry }));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setLifeEventsByPersonId((current) => ({
          ...current,
          [selectedPerson.id]: []
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [lifeEventsByPersonId, selectedPerson]);

  useEffect(() => {
    if (!status) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setStatus(null);
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [status]);

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
    updateUserPreferences(prefs)
      .then((nextPrefs) => {
        setSavedPreferences(nextPrefs);
      })
      .catch(() => {});
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

  const onProfileSave = useCallback(async () => {
    if (!selectedPerson) {
      return;
    }
    const normalizeOptionalString = (value: string) => {
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    };
    const selectedGender = genderByPersonId[selectedPerson.id] ?? "UNKNOWN";
    const selectedBirthDate = birthDateByPersonId[selectedPerson.id] || null;
    const selectedGivenName = normalizeOptionalString(givenNameByPersonId[selectedPerson.id] ?? "");
    const selectedSurname = normalizeOptionalString(surnameByPersonId[selectedPerson.id] ?? "");
    const selectedNicknames = normalizeOptionalString(nicknamesByPersonId[selectedPerson.id] ?? "");
    const selectedDeathDate = deathDateByPersonId[selectedPerson.id] || null;
    const selectedBirthCity = normalizeOptionalString(birthCityByPersonId[selectedPerson.id] ?? "");
    const selectedBirthCountry = normalizeOptionalString(birthCountryByPersonId[selectedPerson.id] ?? "");
    const birthParts = selectedBirthDate ? parseDateInputToParts(selectedBirthDate) : null;
    const deathParts = selectedDeathDate ? parseDateInputToParts(selectedDeathDate) : null;
    if (selectedBirthDate && !birthParts) {
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
        lifeEventsByPersonId[selectedPerson.id] ?? (await getPersonLifeEvents(selectedPerson.id));
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
        if (existingBirthEvent) {
          const updatedBirth = await updatePersonLifeEvent(selectedPerson.id, existingBirthEvent.id, {
            dateQualifier: "EXACT",
            year: birthParts?.year ?? null,
            month: birthParts?.month ?? null,
            day: birthParts?.day ?? null,
            place: birthPlaceInput,
            placeId: birthPlaceInput ? undefined : null
          });
          replaceEvent(updatedBirth);
        } else {
          const createdBirth = await createPersonLifeEvent(selectedPerson.id, {
            eventType: "BIRTH",
            dateQualifier: "EXACT",
            year: birthParts?.year ?? null,
            month: birthParts?.month ?? null,
            day: birthParts?.day ?? null,
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
      const mergedPerson: ImmichPerson = {
        ...selectedPerson,
        profile: savedProfile,
        birthDate: selectedPerson.birthDate
      };
      const displayValues = deriveProfileDisplayValues(mergedPerson, nextLifeEvents);
      setPeople((current) =>
        current.map((person) =>
          person.id === selectedPerson.id
            ? {
                ...person,
                profile: savedProfile,
                birthDate: person.birthDate
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
      setBirthDateByPersonId((current) => ({
        ...current,
        [selectedPerson.id]: displayValues.birthDate
      }));
      setDeathDateByPersonId((current) => ({
        ...current,
        [selectedPerson.id]: displayValues.deathDate
      }));
      setBirthCityByPersonId((current) => ({
        ...current,
        [selectedPerson.id]: displayValues.birthCity
      }));
      setBirthCountryByPersonId((current) => ({
        ...current,
        [selectedPerson.id]: displayValues.birthCountry
      }));
      setStatus("Profile saved");
    } catch (error: unknown) {
      setStatus(getErrorMessage(error));
    } finally {
      setIsSavingProfile(false);
    }
  }, [
    birthCityByPersonId,
    birthCountryByPersonId,
    birthDateByPersonId,
    deathDateByPersonId,
    genderByPersonId,
    givenNameByPersonId,
    lifeEventsByPersonId,
    nicknamesByPersonId,
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
          await updateSpouseRelationshipDates(selectedPerson.id, relatedPersonId, spouseDates ?? {});
          await refreshGraphData();
          setStatus("Relationship updated");
          return;
        }
        await deleteRelationship(relationship.fromPersonId, relationship.toPersonId, relationship.type);
        await createRelationship(
          selectedPerson.id,
          relatedPersonId,
          relationshipType,
          relationshipType === "SPOUSE_OF" ? spouseDates : undefined
        );
        await refreshGraphData();
        setStatus("Relationship updated");
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
        throw error;
      } finally {
        setIsSavingRelationship(false);
      }
    },
    [refreshGraphData, selectedPerson]
  );

  const handleGenderChange = useCallback(
    (gender: Gender) => {
      if (!selectedPerson || !isGender(gender)) {
        return;
      }
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
      setBirthDateByPersonId((current) => ({
        ...current,
        [selectedPerson.id]: birthDate
      }));
    },
    [selectedPerson]
  );

  const handleGivenNameChange = useCallback(
    (givenName: string) => {
      if (!selectedPerson) {
        return;
      }
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
      setDeathDateByPersonId((current) => ({
        ...current,
        [selectedPerson.id]: deathDate
      }));
    },
    [selectedPerson]
  );

  const handleBirthCityChange = useCallback(
    (birthCity: string) => {
      if (!selectedPerson) {
        return;
      }
      setBirthCityByPersonId((current) => ({
        ...current,
        [selectedPerson.id]: birthCity
      }));
    },
    [selectedPerson]
  );

  const handleBirthCountryChange = useCallback(
    (birthCountry: string) => {
      if (!selectedPerson) {
        return;
      }
      setBirthCountryByPersonId((current) => ({
        ...current,
        [selectedPerson.id]: birthCountry
      }));
    },
    [selectedPerson]
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

  const noRelationshipsDefaultsEnabled = !hasRelationships && !savedPreferences?.graphFilterVisibility;

  return (
    <main className="people-layout">
      <section className="people-main-column">
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
          onFocusPersonConsumed={clearGraphFocus}
          onCameraFocusPersonConsumed={clearGraphCameraFocus}
          onSelectedPersonChange={setSelectedPersonId}
          onCreateRelationship={onCreateRelationship}
          onPreferencesChange={onPreferencesChange}
        />
      </section>

      <aside className="people-sidebar">
        <PersonDetailPanel
          person={selectedPerson}
          people={people}
          relationships={relationships}
          dismissedSuggestionKeys={savedPreferences?.dismissedSuggestions ?? []}
          genders={genders}
          genderValue={selectedPerson ? (genderByPersonId[selectedPerson.id] ?? "UNKNOWN") : "UNKNOWN"}
          onGenderChange={handleGenderChange}
          birthDateValue={selectedPerson ? (birthDateByPersonId[selectedPerson.id] ?? "") : ""}
          onBirthDateChange={handleBirthDateChange}
          givenNameValue={selectedPerson ? (givenNameByPersonId[selectedPerson.id] ?? "") : ""}
          surnameValue={selectedPerson ? (surnameByPersonId[selectedPerson.id] ?? "") : ""}
          nicknamesValue={selectedPerson ? (nicknamesByPersonId[selectedPerson.id] ?? "") : ""}
          deathDateValue={selectedPerson ? (deathDateByPersonId[selectedPerson.id] ?? "") : ""}
          birthCityValue={selectedPerson ? (birthCityByPersonId[selectedPerson.id] ?? "") : ""}
          birthCountryValue={selectedPerson ? (birthCountryByPersonId[selectedPerson.id] ?? "") : ""}
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
        />
      </aside>
    </main>
  );
};
