import { useEffect, useMemo, useState } from "react";
import type { Gender, ImmichPerson, RelationshipRecord, RelationshipType } from "../lib/api";
import { createRelationship, deleteRelationship, getImmichPeople, getRelationships, updatePersonProfile } from "../lib/api";
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

export const PeoplePage = () => {
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

  const refreshGraphData = async () => {
    setIsLoading(true);
    try {
      const [peopleResponse, relationshipsResponse] = await Promise.all([getImmichPeople(), getRelationships()]);
      setPeople(peopleResponse);
      setRelationships(relationshipsResponse);
      setLoadError(null);
      setGenderByPersonId(
        peopleResponse.reduce<Record<string, Gender>>((acc, person) => {
          acc[person.id] = person.profile?.gender ?? "UNKNOWN";
          return acc;
        }, {})
      );
      setBirthDateByPersonId(
        peopleResponse.reduce<Record<string, string>>((acc, person) => {
          acc[person.id] = toDateInputValue(person.birthDate);
          return acc;
        }, {})
      );
      if (!selectedPersonId && peopleResponse[0]) {
        setSelectedPersonId(peopleResponse[0].id);
      }
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error));
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshGraphData().catch((error: unknown) => {
      setStatus(getErrorMessage(error));
    });
  }, []);

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

  const focusPersonInGraph = (personId: string) => {
    setGraphFocusPersonId(null);
    window.setTimeout(() => setGraphFocusPersonId(personId), 0);
    setSelectedPersonId(personId);
  };

  const onProfileSave = async () => {
    if (!selectedPerson) {
      return;
    }
    const selectedGender = genderByPersonId[selectedPerson.id] ?? "UNKNOWN";
    const selectedBirthDate = birthDateByPersonId[selectedPerson.id] || null;
    setIsSavingProfile(true);
    try {
      await updatePersonProfile(selectedPerson.id, {
        gender: selectedGender,
        birthDate: selectedBirthDate
      });
      await refreshGraphData();
      setStatus("Profile saved");
    } catch (error: unknown) {
      setStatus(getErrorMessage(error));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const onCreateRelationship = async (
    sourcePersonId: string,
    targetPersonId: string,
    relationshipType: "PARENT_OF" | "CHILD_OF" | "SPOUSE_OF" | "SIBLING_OF"
  ) => {
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
  };

  const onDeleteExistingRelationship = async (relationship: RelationshipRecord) => {
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
  };

  const onUpdateExistingRelationship = async (
    relationship: RelationshipRecord,
    relatedPersonId: string,
    relationshipType: RelationshipType
  ) => {
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
  };

  return (
    <main className="people-layout">
      <section className="people-main-column">
        <PeopleGraph3D
          people={people}
          relationships={relationships}
          status={status}
          isLoading={isLoading}
          isSavingRelationship={isSavingRelationship}
          loadError={loadError}
          focusPersonRequest={graphFocusPersonId}
          onSelectedPersonChange={setSelectedPersonId}
          onCreateRelationship={onCreateRelationship}
        />
      </section>

      <aside className="people-sidebar">
        <PersonDetailPanel
          person={selectedPerson}
          people={people}
          relationships={relationships}
          genders={genders}
          genderValue={selectedPerson ? genderByPersonId[selectedPerson.id] ?? "UNKNOWN" : "UNKNOWN"}
          onGenderChange={(gender) => {
            if (!selectedPerson || !isGender(gender)) {
              return;
            }
            setGenderByPersonId((current) => ({
              ...current,
              [selectedPerson.id]: gender
            }));
          }}
        birthDateValue={selectedPerson ? birthDateByPersonId[selectedPerson.id] ?? "" : ""}
        onBirthDateChange={(birthDate) => {
          if (!selectedPerson) {
            return;
          }
          setBirthDateByPersonId((current) => ({
            ...current,
            [selectedPerson.id]: birthDate
          }));
        }}
          onProfileSave={onProfileSave}
          isSavingProfile={isSavingProfile}
          onFocusPerson={focusPersonInGraph}
          onUpdateRelationship={onUpdateExistingRelationship}
          onDeleteRelationship={onDeleteExistingRelationship}
          isSavingRelationship={isSavingRelationship}
        />
      </aside>
    </main>
  );
};
