import { useCallback, useEffect, useMemo, useState } from "react";
import type { Gender, ImmichPerson, RelationshipRecord, RelationshipType, UserPreferences } from "../lib/api";
import {
  createRelationship,
  deleteRelationship,
  getImmichPeople,
  getRelationships,
  getUserPreferences,
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

type Props = {
  immichBaseUrl?: string | null;
};

export const PeoplePage = ({ immichBaseUrl = null }: Props) => {
  const [people, setPeople] = useState<ImmichPerson[]>([]);
  const [relationships, setRelationships] = useState<RelationshipRecord[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [graphFocusPersonId, setGraphFocusPersonId] = useState<string | null>(null);
  const [genderByPersonId, setGenderByPersonId] = useState<Record<string, Gender>>({});
  const [birthDateByPersonId, setBirthDateByPersonId] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingRelationship, setIsSavingRelationship] = useState(false);
  const [savedPreferences, setSavedPreferences] = useState<UserPreferences | null>(null);

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
      setSelectedPersonId((current) => current ?? sortedPeople[0]?.id ?? null);
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error));
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshGraphData().catch((error: unknown) => {
      setStatus(getErrorMessage(error));
    });
  }, [refreshGraphData]);

  useEffect(() => {
    if (!status) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setStatus(null);
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const selectedPerson = useMemo(
    () => people.find((person) => person.id === selectedPersonId) ?? null,
    [people, selectedPersonId]
  );

  const onPreferencesChange = useCallback((prefs: Partial<UserPreferences>) => {
    setSavedPreferences((current) => ({
      ...(current ?? {}),
      ...prefs,
      dismissedSuggestions: prefs.dismissedSuggestions ?? current?.dismissedSuggestions,
      familyViewStyle: prefs.familyViewStyle ?? current?.familyViewStyle,
      graphFilterVisibility: prefs.graphFilterVisibility ?? current?.graphFilterVisibility
    }));
    updateUserPreferences(prefs)
      .then((nextPrefs) => {
        setSavedPreferences(nextPrefs);
      })
      .catch(() => {});
  }, []);

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

  const focusPersonInGraph = useCallback((personId: string) => {
    setGraphFocusPersonId(personId);
    setSelectedPersonId(personId);
  }, []);

  const onProfileSave = useCallback(async () => {
    if (!selectedPerson) {
      return;
    }
    const selectedGender = genderByPersonId[selectedPerson.id] ?? "UNKNOWN";
    const selectedBirthDate = birthDateByPersonId[selectedPerson.id] || null;
    setIsSavingProfile(true);
    try {
      const savedProfile = await updatePersonProfile(selectedPerson.id, {
        gender: selectedGender,
        birthDate: selectedBirthDate
      });
      setPeople((current) =>
        current.map((person) =>
          person.id === selectedPerson.id
            ? {
                ...person,
                profile: savedProfile,
                birthDate: selectedBirthDate ?? person.birthDate
              }
            : person
        )
      );
      setGenderByPersonId((current) => ({
        ...current,
        [selectedPerson.id]: savedProfile.gender
      }));
      setStatus("Profile saved");
    } catch (error: unknown) {
      setStatus(getErrorMessage(error));
    } finally {
      setIsSavingProfile(false);
    }
  }, [birthDateByPersonId, genderByPersonId, selectedPerson]);

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
    async (relationship: RelationshipRecord, relatedPersonId: string, relationshipType: RelationshipType) => {
      if (!selectedPerson) {
        throw new Error("Select a person first.");
      }

      setIsSavingRelationship(true);
      try {
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

  return (
    <main className="people-layout">
      <section className="people-main-column">
        <PeopleGraph3D
          people={people}
          relationships={relationships}
          selectedPersonId={selectedPersonId}
          status={status}
          isLoading={isLoading}
          isSavingRelationship={isSavingRelationship}
          loadError={loadError}
          focusPersonRequest={graphFocusPersonId}
          savedPreferences={savedPreferences}
          onFocusPersonConsumed={clearGraphFocus}
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
          onProfileSave={onProfileSave}
          isSavingProfile={isSavingProfile}
          onFocusPerson={focusPersonInGraph}
          onCreateRelationship={onCreateRelationship}
          onUpdateRelationship={onUpdateExistingRelationship}
          onDeleteRelationship={onDeleteExistingRelationship}
          onDismissSuggestion={onDismissSuggestion}
          isSavingRelationship={isSavingRelationship}
          immichBaseUrl={immichBaseUrl}
        />
      </aside>
    </main>
  );
};
