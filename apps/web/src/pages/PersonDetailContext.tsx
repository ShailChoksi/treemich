import type { CreateFamilyLifeEventBody, CreateLifeEventBody, PatchLifeEventBody } from "@treemich/shared";
import { formatPersonNameDisplay } from "@treemich/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type {
  FamilyRecord,
  Gender,
  LifeEventRecord,
  MediaObjectRecord,
  PatchFamilyBody,
  RelationshipRecord,
  RelationshipType,
  TargetMediaLinkRecord,
  TimelineEventRecord
} from "../lib/api";
import {
  createEvidenceMediaLink,
  createFamilyLifeEvent,
  createPersonLifeEvent,
  createRelationship,
  createRelationshipLifeEvent,
  deleteEvidenceMediaLink,
  deleteFamily,
  deleteFamilyLifeEvent,
  deletePersonLifeEvent,
  deleteRelationship,
  deleteRelationshipLifeEvent,
  getFamiliesForPerson,
  getFamilyLifeEvents,
  getMediaLinksForTarget,
  getPersonLifeEvents,
  getPersonTimeline,
  getRelationshipLifeEvents,
  listEvidenceMediaObjects,
  patchFamily,
  updateFamilyLifeEvent,
  updatePersonLifeEvent,
  updatePersonProfile,
  updateRelationshipLifeEvent
} from "../lib/api";
import {
  buildBirthPlaceInput,
  deriveProfileDisplayValuesFromLifeEvents,
  parseDateInputToParts
} from "../lib/lifeEventUi";
import { RELATIONSHIP_TYPES } from "../lib/relationshipConstants";
import { usePeopleGraphData } from "./PeopleGraphDataContext";
import { useToast } from "./ToastContext";

const genders: Gender[] = ["MALE", "FEMALE", "OTHER", "UNKNOWN"];
const isGender = (value: string): value is Gender => genders.includes(value as Gender);
const isAbortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError";
const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unknown error");

const profileNamePatchForPerson = (profile: NonNullable<import("../lib/api").PersonRecord["profile"]>) => {
  const name = formatPersonNameDisplay({
    givenName: profile.givenName,
    surname: profile.surname
  });
  return name ? { name, displayName: null } : {};
};

type ProfileEventFields = {
  birthDate: string;
  deathDate: string;
  birthCity: string;
  birthCountry: string;
};

type PersonDetailContextValue = {
  genders: Gender[];
  genderByPersonId: Record<string, Gender>;
  givenNameByPersonId: Record<string, string>;
  surnameByPersonId: Record<string, string>;
  nicknamesByPersonId: Record<string, string>;
  selectedProfileEventFields: ProfileEventFields;
  lifeEventsByPersonId: Record<string, LifeEventRecord[]>;
  relationshipLifeEventsById: Record<string, LifeEventRecord[]>;
  personTimelineById: Record<string, TimelineEventRecord[]>;
  familiesByPersonId: Record<string, FamilyRecord[] | undefined>;
  familyMediaLinksById: Partial<Record<string, TargetMediaLinkRecord[]>>;
  evidenceMediaObjects: MediaObjectRecord[];
  familyLifeEventsById: Partial<Record<string, LifeEventRecord[]>>;
  handleGenderChange: (gender: Gender) => void;
  handleBirthDateChange: (birthDate: string) => void;
  handleGivenNameChange: (givenName: string) => void;
  handleSurnameChange: (surname: string) => void;
  handleNicknamesChange: (nicknames: string) => void;
  handleDeathDateChange: (deathDate: string) => void;
  handleBirthCityChange: (birthCity: string) => void;
  handleBirthCountryChange: (birthCountry: string) => void;
  onProfileSave: () => Promise<void>;
  onUpdateExistingRelationship: (
    relationship: RelationshipRecord,
    relatedPersonId: string,
    relationshipType: RelationshipType,
    spouseDates?: { marriageAnniversaryDate?: string | null; divorceDate?: string | null }
  ) => Promise<void>;
  handlePersonLifeEventCreate: (body: CreateLifeEventBody) => Promise<void>;
  handlePersonLifeEventPatch: (eventId: string, body: PatchLifeEventBody) => Promise<void>;
  handlePersonLifeEventDelete: (eventId: string) => Promise<void>;
  handleFamilyPatch: (familyId: string, body: PatchFamilyBody) => Promise<void>;
  handleFamilyDelete: (familyId: string) => Promise<void>;
  handleFamilyMediaLinkCreate: (familyId: string, mediaObjectId: string) => Promise<void>;
  handleFamilyMediaLinkDelete: (linkId: string) => Promise<void>;
  handleRelationshipLifeEventCreate: (relationshipId: string, body: CreateLifeEventBody) => Promise<void>;
  handleRelationshipLifeEventPatch: (
    relationshipId: string,
    eventId: string,
    body: PatchLifeEventBody
  ) => Promise<void>;
  handleRelationshipLifeEventDelete: (relationshipId: string, eventId: string) => Promise<void>;
  handleFamilyLifeEventCreate: (familyId: string, body: CreateLifeEventBody) => Promise<void>;
  handleFamilyLifeEventPatch: (familyId: string, eventId: string, body: PatchLifeEventBody) => Promise<void>;
  handleFamilyLifeEventDelete: (familyId: string, eventId: string) => Promise<void>;
};

const PersonDetailContext = createContext<PersonDetailContextValue | null>(null);

export const PersonDetailProvider = ({ children }: { children: ReactNode }) => {
  const graph = usePeopleGraphData();
  const { setStatus } = useToast();
  const { people, relationships, selectedPerson, selectedPersonId } = graph;
  const [genderByPersonId, setGenderByPersonId] = useState<Record<string, Gender>>({});
  const [givenNameByPersonId, setGivenNameByPersonId] = useState<Record<string, string>>({});
  const [surnameByPersonId, setSurnameByPersonId] = useState<Record<string, string>>({});
  const [nicknamesByPersonId, setNicknamesByPersonId] = useState<Record<string, string>>({});
  const [profileEventFieldsByPersonId, setProfileEventFieldsByPersonId] = useState<
    Record<string, ProfileEventFields>
  >({});
  const [lifeEventsByPersonId, setLifeEventsByPersonId] = useState<Record<string, LifeEventRecord[]>>({});
  const [relationshipLifeEventsById, setRelationshipLifeEventsById] = useState<
    Record<string, LifeEventRecord[]>
  >({});
  const [personTimelineById, setPersonTimelineById] = useState<Record<string, TimelineEventRecord[]>>({});
  const [familiesByPersonId, setFamiliesByPersonId] = useState<Record<string, FamilyRecord[] | undefined>>(
    {}
  );
  const [familyMediaLinksById, setFamilyMediaLinksById] = useState<
    Partial<Record<string, TargetMediaLinkRecord[]>>
  >({});
  const [evidenceMediaObjects, setEvidenceMediaObjects] = useState<MediaObjectRecord[]>([]);
  const [familyLifeEventsById, setFamilyLifeEventsById] = useState<
    Partial<Record<string, LifeEventRecord[]>>
  >({});

  const genderByPersonIdRef = useRef(genderByPersonId);
  const givenNameByPersonIdRef = useRef(givenNameByPersonId);
  const surnameByPersonIdRef = useRef(surnameByPersonId);
  const nicknamesByPersonIdRef = useRef(nicknamesByPersonId);
  const profileEventFieldsByPersonIdRef = useRef(profileEventFieldsByPersonId);
  const lifeEventsByPersonIdRef = useRef(lifeEventsByPersonId);

  useEffect(() => {
    genderByPersonIdRef.current = genderByPersonId;
  }, [genderByPersonId]);
  useEffect(() => {
    givenNameByPersonIdRef.current = givenNameByPersonId;
  }, [givenNameByPersonId]);
  useEffect(() => {
    surnameByPersonIdRef.current = surnameByPersonId;
  }, [surnameByPersonId]);
  useEffect(() => {
    nicknamesByPersonIdRef.current = nicknamesByPersonId;
  }, [nicknamesByPersonId]);
  useEffect(() => {
    profileEventFieldsByPersonIdRef.current = profileEventFieldsByPersonId;
  }, [profileEventFieldsByPersonId]);
  useEffect(() => {
    lifeEventsByPersonIdRef.current = lifeEventsByPersonId;
  }, [lifeEventsByPersonId]);

  useEffect(() => {
    setGenderByPersonId(
      people.reduce<Record<string, Gender>>((acc, person) => {
        acc[person.id] = person.profile?.gender ?? "UNKNOWN";
        return acc;
      }, {})
    );
    setGivenNameByPersonId(
      people.reduce<Record<string, string>>((acc, person) => {
        acc[person.id] = person.profile?.givenName ?? "";
        return acc;
      }, {})
    );
    setSurnameByPersonId(
      people.reduce<Record<string, string>>((acc, person) => {
        acc[person.id] = person.profile?.surname ?? "";
        return acc;
      }, {})
    );
    setNicknamesByPersonId(
      people.reduce<Record<string, string>>((acc, person) => {
        acc[person.id] = person.profile?.nicknames ?? "";
        return acc;
      }, {})
    );
  }, [people]);

  useEffect(() => {
    setLifeEventsByPersonId({});
    setRelationshipLifeEventsById({});
    setProfileEventFieldsByPersonId({});
    setPersonTimelineById({});
    setFamiliesByPersonId({});
    setFamilyLifeEventsById({});
    setFamilyMediaLinksById({});
  }, [graph.dataRevision]);

  const selectedProfileEventFields = useMemo(() => {
    if (!selectedPerson) {
      return { birthDate: "", deathDate: "", birthCity: "", birthCountry: "" };
    }
    const pid = selectedPerson.id;
    return (
      profileEventFieldsByPersonId[pid] ?? deriveProfileDisplayValuesFromLifeEvents(lifeEventsByPersonId[pid])
    );
  }, [lifeEventsByPersonId, profileEventFieldsByPersonId, selectedPerson]);

  const lifeEventsForSelected = selectedPerson ? lifeEventsByPersonId[selectedPerson.id] : undefined;
  useEffect(() => {
    if (!selectedPerson || lifeEventsForSelected !== undefined) {
      return;
    }
    const controller = new AbortController();
    getPersonLifeEvents(selectedPerson.id, { includeCitations: true, signal: controller.signal })
      .then((events) => {
        if (controller.signal.aborted) {
          return;
        }
        setLifeEventsByPersonId((current) => ({ ...current, [selectedPerson.id]: events }));
        setProfileEventFieldsByPersonId((current) => ({
          ...current,
          [selectedPerson.id]: deriveProfileDisplayValuesFromLifeEvents(events)
        }));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) {
          return;
        }
        setStatus(`Could not load life events: ${getErrorMessage(err)}`);
        setLifeEventsByPersonId((current) => ({ ...current, [selectedPerson.id]: [] }));
        setProfileEventFieldsByPersonId((current) => ({
          ...current,
          [selectedPerson.id]: deriveProfileDisplayValuesFromLifeEvents([])
        }));
      });
    return () => controller.abort();
  }, [lifeEventsForSelected, selectedPerson, setStatus]);

  const timelineForSelected = selectedPerson ? personTimelineById[selectedPerson.id] : undefined;
  useEffect(() => {
    if (!selectedPerson || timelineForSelected !== undefined) {
      return;
    }
    const controller = new AbortController();
    getPersonTimeline(selectedPerson.id, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) {
          setPersonTimelineById((current) => ({ ...current, [selectedPerson.id]: response.timeline }));
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) {
          return;
        }
        setStatus(`Could not load timeline: ${getErrorMessage(err)}`);
        setPersonTimelineById((current) => ({ ...current, [selectedPerson.id]: [] }));
      });
    return () => controller.abort();
  }, [selectedPerson, setStatus, timelineForSelected]);

  const familiesForSelected = selectedPerson ? familiesByPersonId[selectedPerson.id] : undefined;
  useEffect(() => {
    if (!selectedPerson || familiesForSelected !== undefined) {
      return;
    }
    const controller = new AbortController();
    getFamiliesForPerson(selectedPerson.id, { signal: controller.signal })
      .then((families) => {
        if (!controller.signal.aborted) {
          setFamiliesByPersonId((current) => ({ ...current, [selectedPerson.id]: families }));
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) {
          return;
        }
        setStatus(`Could not load families: ${getErrorMessage(err)}`);
        setFamiliesByPersonId((current) => ({ ...current, [selectedPerson.id]: [] }));
      });
    return () => controller.abort();
  }, [familiesForSelected, selectedPerson, setStatus]);

  useEffect(() => {
    const fams = familiesForSelected;
    if (fams === undefined) {
      return;
    }
    const toFetch = fams.map((family) => family.id).filter((id) => familyLifeEventsById[id] === undefined);
    if (toFetch.length === 0) {
      return;
    }
    const controller = new AbortController();
    Promise.all(
      toFetch.map((id) =>
        getFamilyLifeEvents(id, { includeCitations: true, signal: controller.signal }).then(
          (events) => [id, events] as const
        )
      )
    )
      .then((rows) => {
        if (controller.signal.aborted) {
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
        if (!controller.signal.aborted && !isAbortError(err)) {
          setStatus(`Could not load some family life events: ${getErrorMessage(err)}`);
        }
      });
    return () => controller.abort();
  }, [familiesForSelected, familyLifeEventsById, setStatus]);

  useEffect(() => {
    const fams = familiesForSelected;
    if (fams === undefined) {
      return;
    }
    const toFetch = fams.map((family) => family.id).filter((id) => familyMediaLinksById[id] === undefined);
    if (toFetch.length === 0) {
      return;
    }
    const controller = new AbortController();
    Promise.all(
      toFetch.map((id) =>
        getMediaLinksForTarget("FAMILY", id, { signal: controller.signal }).then(
          (links) => [id, links] as const
        )
      )
    )
      .then((rows) => {
        if (controller.signal.aborted) {
          return;
        }
        setFamilyMediaLinksById((current) => {
          const next = { ...current };
          for (const [id, links] of rows) {
            next[id] = links;
          }
          return next;
        });
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted && !isAbortError(err)) {
          setStatus(`Could not load family media: ${getErrorMessage(err)}`);
        }
      });
    return () => controller.abort();
  }, [familiesForSelected, familyMediaLinksById, setStatus]);

  useEffect(() => {
    if (import.meta.env.VITE_EVIDENCE_MANAGEMENT_UI === "false") {
      return;
    }
    let cancelled = false;
    listEvidenceMediaObjects()
      .then((items) => {
        if (!cancelled) {
          setEvidenceMediaObjects(items);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStatus(`Could not load evidence media: ${getErrorMessage(err)}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [setStatus]);

  useEffect(() => {
    if (!selectedPersonId) {
      return;
    }
    const ids = new Set<string>();
    for (const rel of relationships) {
      if (
        rel.type === RELATIONSHIP_TYPES.spouseOf &&
        rel.id &&
        (rel.fromPersonId === selectedPersonId || rel.toPersonId === selectedPersonId)
      ) {
        ids.add(rel.id);
      }
    }
    const toFetch = [...ids].filter((id) => relationshipLifeEventsById[id] === undefined);
    if (toFetch.length === 0) {
      return;
    }
    const controller = new AbortController();
    Promise.all(
      toFetch.map((id) =>
        getRelationshipLifeEvents(id, { includeCitations: true, signal: controller.signal }).then(
          (events) => [id, events] as const
        )
      )
    )
      .then((rows) => {
        if (controller.signal.aborted) {
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
        if (!controller.signal.aborted && !isAbortError(err)) {
          setStatus(`Could not load some relationship life events: ${getErrorMessage(err)}`);
        }
      });
    return () => controller.abort();
  }, [relationshipLifeEventsById, relationships, selectedPersonId, setStatus]);

  const onProfileSave = useCallback(async () => {
    const personToSave = selectedPerson;
    if (!personToSave) {
      return;
    }
    const normalizeOptionalString = (value: string) => {
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    };
    const selectedGender = genderByPersonIdRef.current[personToSave.id] ?? "UNKNOWN";
    const pid = personToSave.id;
    const eventFormFields =
      profileEventFieldsByPersonIdRef.current[pid] ??
      deriveProfileDisplayValuesFromLifeEvents(lifeEventsByPersonIdRef.current[pid]);
    const rawBirthDate = (eventFormFields.birthDate ?? "").trim();
    const selectedGivenName = normalizeOptionalString(givenNameByPersonIdRef.current[personToSave.id] ?? "");
    const selectedSurname = normalizeOptionalString(surnameByPersonIdRef.current[personToSave.id] ?? "");
    const selectedNicknames = normalizeOptionalString(nicknamesByPersonIdRef.current[personToSave.id] ?? "");
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
    graph.setIsSavingProfile(true);
    try {
      const resolvedEvents =
        lifeEventsByPersonIdRef.current[personToSave.id] ??
        (await getPersonLifeEvents(personToSave.id, { includeCitations: true }));
      const nextLifeEvents = [...resolvedEvents];
      const findEvent = (eventType: "BIRTH" | "DEATH") =>
        nextLifeEvents.find((event) => event.eventType === eventType) ?? null;
      const replaceEvent = (event: LifeEventRecord) => {
        const index = nextLifeEvents.findIndex((current) => current.id === event.id);
        if (index >= 0) {
          nextLifeEvents[index] = event;
        } else {
          nextLifeEvents.push(event);
        }
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
        await deletePersonLifeEvent(personToSave.id, existingBirthEvent.id);
        removeEvent(existingBirthEvent.id);
      } else if (shouldPersistBirthEvent) {
        const resolvedBirthParts =
          birthParts ??
          (existingBirthEvent
            ? { year: existingBirthEvent.year, month: existingBirthEvent.month, day: existingBirthEvent.day }
            : null);
        if (existingBirthEvent) {
          replaceEvent(
            await updatePersonLifeEvent(personToSave.id, existingBirthEvent.id, {
              dateQualifier: "EXACT",
              year: resolvedBirthParts?.year ?? null,
              month: resolvedBirthParts?.month ?? null,
              day: resolvedBirthParts?.day ?? null,
              place: birthPlaceInput,
              placeId: birthPlaceInput ? undefined : null
            })
          );
        } else {
          replaceEvent(
            await createPersonLifeEvent(personToSave.id, {
              eventType: "BIRTH",
              dateQualifier: "EXACT",
              year: resolvedBirthParts?.year ?? null,
              month: resolvedBirthParts?.month ?? null,
              day: resolvedBirthParts?.day ?? null,
              place: birthPlaceInput
            })
          );
        }
      }

      const existingDeathEvent = findEvent("DEATH");
      if (!deathParts && existingDeathEvent) {
        await deletePersonLifeEvent(personToSave.id, existingDeathEvent.id);
        removeEvent(existingDeathEvent.id);
      } else if (deathParts) {
        if (existingDeathEvent) {
          replaceEvent(
            await updatePersonLifeEvent(personToSave.id, existingDeathEvent.id, {
              dateQualifier: "EXACT",
              year: deathParts.year,
              month: deathParts.month,
              day: deathParts.day
            })
          );
        } else {
          replaceEvent(
            await createPersonLifeEvent(personToSave.id, {
              eventType: "DEATH",
              dateQualifier: "EXACT",
              year: deathParts.year,
              month: deathParts.month,
              day: deathParts.day
            })
          );
        }
      }

      const savedProfile = await updatePersonProfile(personToSave.id, {
        gender: selectedGender,
        givenName: selectedGivenName,
        surname: selectedSurname,
        nicknames: selectedNicknames
      });
      const displayValues = deriveProfileDisplayValuesFromLifeEvents(nextLifeEvents);
      graph.setPeople((current) =>
        current.map((person) =>
          person.id === personToSave.id
            ? {
                ...person,
                ...profileNamePatchForPerson(savedProfile),
                birthDate: displayValues.birthDate || null,
                profile: savedProfile
              }
            : person
        )
      );
      setLifeEventsByPersonId((current) => ({ ...current, [personToSave.id]: nextLifeEvents }));
      setGenderByPersonId((current) => ({ ...current, [personToSave.id]: savedProfile.gender }));
      setGivenNameByPersonId((current) => ({ ...current, [personToSave.id]: savedProfile.givenName ?? "" }));
      setSurnameByPersonId((current) => ({ ...current, [personToSave.id]: savedProfile.surname ?? "" }));
      setNicknamesByPersonId((current) => ({ ...current, [personToSave.id]: savedProfile.nicknames ?? "" }));
      setProfileEventFieldsByPersonId((current) => ({ ...current, [personToSave.id]: displayValues }));
      setPersonTimelineById((current) => {
        if (!(personToSave.id in current)) {
          return current;
        }
        const next = { ...current };
        delete next[personToSave.id];
        return next;
      });
      graph.setProfileDraftDirty(false);
      setStatus("Profile saved");
    } catch (error: unknown) {
      setStatus(getErrorMessage(error));
    } finally {
      graph.setIsSavingProfile(false);
    }
  }, [graph, selectedPerson, setStatus]);

  const afterPersonLifeEventsUpdated = useCallback(async (personId: string) => {
    const ev = await getPersonLifeEvents(personId, { includeCitations: true });
    setLifeEventsByPersonId((current) => ({ ...current, [personId]: ev }));
    setProfileEventFieldsByPersonId((prev) => ({
      ...prev,
      [personId]: deriveProfileDisplayValuesFromLifeEvents(ev)
    }));
  }, []);

  const handlePersonLifeEventCreate = useCallback(
    async (body: CreateLifeEventBody) => {
      if (!selectedPerson) {
        return;
      }
      await createPersonLifeEvent(selectedPerson.id, body);
      setStatus("Life event saved");
      await afterPersonLifeEventsUpdated(selectedPerson.id);
    },
    [afterPersonLifeEventsUpdated, selectedPerson, setStatus]
  );

  const handlePersonLifeEventPatch = useCallback(
    async (eventId: string, body: PatchLifeEventBody) => {
      if (!selectedPerson) {
        return;
      }
      await updatePersonLifeEvent(selectedPerson.id, eventId, body);
      setStatus("Life event saved");
      await afterPersonLifeEventsUpdated(selectedPerson.id);
    },
    [afterPersonLifeEventsUpdated, selectedPerson, setStatus]
  );

  const handlePersonLifeEventDelete = useCallback(
    async (eventId: string) => {
      if (!selectedPerson) {
        return;
      }
      await deletePersonLifeEvent(selectedPerson.id, eventId);
      setStatus("Life event deleted");
      await afterPersonLifeEventsUpdated(selectedPerson.id);
    },
    [afterPersonLifeEventsUpdated, selectedPerson, setStatus]
  );

  const handleFamilyPatch = useCallback(
    async (familyId: string, body: PatchFamilyBody) => {
      graph.setSavingFamilyId(familyId);
      try {
        await patchFamily(familyId, body);
        const structureChanged =
          body.children !== undefined ||
          body.parent1PersonId !== undefined ||
          body.parent2PersonId !== undefined;
        if (structureChanged) {
          await graph.refreshGraphData({ bypassSaveGuard: true });
        } else if (selectedPersonId) {
          const next = await getFamiliesForPerson(selectedPersonId);
          setFamiliesByPersonId((current) => ({ ...current, [selectedPersonId]: next }));
        }
      } finally {
        graph.setSavingFamilyId(null);
      }
    },
    [graph, selectedPersonId]
  );

  const handleFamilyDelete = useCallback(
    async (familyId: string) => {
      graph.setSavingFamilyId(familyId);
      try {
        await deleteFamily(familyId);
        setFamiliesByPersonId({});
        await graph.refreshGraphData({ bypassSaveGuard: true });
      } finally {
        graph.setSavingFamilyId(null);
      }
    },
    [graph]
  );

  const onUpdateExistingRelationship = useCallback(
    async (
      relationship: RelationshipRecord,
      relatedPersonId: string,
      relationshipType: RelationshipType,
      spouseDates?: { marriageAnniversaryDate?: string | null; divorceDate?: string | null }
    ) => {
      if (!selectedPerson) {
        throw new Error("Select a person first.");
      }
      graph.setIsSavingRelationship(true);
      try {
        const relationshipTypeUnchanged = relationship.type === relationshipType;
        if (relationshipTypeUnchanged && relationshipType === RELATIONSHIP_TYPES.spouseOf) {
          const rid = relationship.id;
          if (!rid) {
            setStatus("Cannot update spouse dates: relationship id is missing. Reload and try again.");
            return;
          }
          const marriageRaw = spouseDates?.marriageAnniversaryDate?.trim() ?? "";
          const divorceRaw = spouseDates?.divorceDate?.trim() ?? "";
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
          const resolved =
            relationshipLifeEventsById[rid] ??
            (await getRelationshipLifeEvents(rid, { includeCitations: true }));
          const next = [...resolved];
          const findEvent = (eventType: "MARRIAGE" | "DIVORCE") =>
            next.find((event) => event.eventType === eventType) ?? null;
          const replaceEvent = (event: LifeEventRecord) => {
            const index = next.findIndex((current) => current.id === event.id);
            if (index >= 0) {
              next[index] = event;
            } else {
              next.push(event);
            }
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
            replaceEvent(
              existingMarriage
                ? await updateRelationshipLifeEvent(rid, existingMarriage.id, {
                    dateQualifier: "EXACT",
                    year: marriageParts.year,
                    month: marriageParts.month,
                    day: marriageParts.day
                  })
                : await createRelationshipLifeEvent(rid, {
                    eventType: "MARRIAGE",
                    dateQualifier: "EXACT",
                    year: marriageParts.year,
                    month: marriageParts.month,
                    day: marriageParts.day
                  })
            );
          }
          if (!divorceParts && existingDivorce) {
            await deleteRelationshipLifeEvent(rid, existingDivorce.id);
            removeEvent(existingDivorce.id);
          } else if (divorceParts) {
            replaceEvent(
              existingDivorce
                ? await updateRelationshipLifeEvent(rid, existingDivorce.id, {
                    dateQualifier: "EXACT",
                    year: divorceParts.year,
                    month: divorceParts.month,
                    day: divorceParts.day
                  })
                : await createRelationshipLifeEvent(rid, {
                    eventType: "DIVORCE",
                    dateQualifier: "EXACT",
                    year: divorceParts.year,
                    month: divorceParts.month,
                    day: divorceParts.day
                  })
            );
          }
          setRelationshipLifeEventsById((current) => ({ ...current, [rid]: next }));
          void graph.refreshRelationshipsOnly().catch((err: unknown) => {
            setStatus(`Could not refresh relationships: ${getErrorMessage(err)}`);
          });
          setStatus("Relationship updated");
          return;
        }
        await deleteRelationship(relationship.fromPersonId, relationship.toPersonId, relationship.type);
        await createRelationship(selectedPerson.id, relatedPersonId, relationshipType);
        await graph.refreshGraphData({ bypassSaveGuard: true });
        setStatus("Relationship updated");
      } catch (error: unknown) {
        setStatus(getErrorMessage(error));
        throw error;
      } finally {
        graph.setIsSavingRelationship(false);
      }
    },
    [graph, relationshipLifeEventsById, selectedPerson, setStatus]
  );

  const refreshFamilyMediaLinks = useCallback(async (familyId: string) => {
    const links = await getMediaLinksForTarget("FAMILY", familyId);
    setFamilyMediaLinksById((current) => ({ ...current, [familyId]: links }));
  }, []);

  const handleFamilyMediaLinkCreate = useCallback(
    async (familyId: string, mediaObjectId: string) => {
      await createEvidenceMediaLink(mediaObjectId, { targetType: "FAMILY", targetId: familyId });
      await refreshFamilyMediaLinks(familyId);
    },
    [refreshFamilyMediaLinks]
  );

  const handleFamilyMediaLinkDelete = useCallback(
    async (linkId: string) => {
      await deleteEvidenceMediaLink(linkId);
      for (const [familyId, links] of Object.entries(familyMediaLinksById)) {
        if (links?.some((link) => link.id === linkId)) {
          await refreshFamilyMediaLinks(familyId);
          break;
        }
      }
    },
    [familyMediaLinksById, refreshFamilyMediaLinks]
  );

  const handleRelationshipLifeEventCreate = useCallback(
    async (relationshipId: string, body: CreateLifeEventBody) => {
      await createRelationshipLifeEvent(relationshipId, body);
      setStatus("Life event saved");
      const ev = await getRelationshipLifeEvents(relationshipId, { includeCitations: true });
      setRelationshipLifeEventsById((current) => ({ ...current, [relationshipId]: ev }));
      void graph.refreshRelationshipsOnly().catch((err: unknown) => {
        setStatus(`Could not refresh relationships: ${getErrorMessage(err)}`);
      });
    },
    [graph, setStatus]
  );

  const handleRelationshipLifeEventPatch = useCallback(
    async (relationshipId: string, eventId: string, body: PatchLifeEventBody) => {
      await updateRelationshipLifeEvent(relationshipId, eventId, body);
      setStatus("Life event saved");
      const ev = await getRelationshipLifeEvents(relationshipId, { includeCitations: true });
      setRelationshipLifeEventsById((current) => ({ ...current, [relationshipId]: ev }));
      void graph.refreshRelationshipsOnly().catch((err: unknown) => {
        setStatus(`Could not refresh relationships: ${getErrorMessage(err)}`);
      });
    },
    [graph, setStatus]
  );

  const handleRelationshipLifeEventDelete = useCallback(
    async (relationshipId: string, eventId: string) => {
      await deleteRelationshipLifeEvent(relationshipId, eventId);
      setStatus("Life event deleted");
      const ev = await getRelationshipLifeEvents(relationshipId, { includeCitations: true });
      setRelationshipLifeEventsById((current) => ({ ...current, [relationshipId]: ev }));
      void graph.refreshRelationshipsOnly().catch((err: unknown) => {
        setStatus(`Could not refresh relationships: ${getErrorMessage(err)}`);
      });
    },
    [graph, setStatus]
  );

  const handleFamilyLifeEventCreate = useCallback(
    async (familyId: string, body: CreateLifeEventBody) => {
      await createFamilyLifeEvent(familyId, body as CreateFamilyLifeEventBody);
      setStatus("Household event saved");
      const ev = await getFamilyLifeEvents(familyId, { includeCitations: true });
      setFamilyLifeEventsById((current) => ({ ...current, [familyId]: ev }));
    },
    [setStatus]
  );

  const handleFamilyLifeEventPatch = useCallback(
    async (familyId: string, eventId: string, body: PatchLifeEventBody) => {
      await updateFamilyLifeEvent(familyId, eventId, body);
      setStatus("Household event saved");
      const ev = await getFamilyLifeEvents(familyId, { includeCitations: true });
      setFamilyLifeEventsById((current) => ({ ...current, [familyId]: ev }));
    },
    [setStatus]
  );

  const handleFamilyLifeEventDelete = useCallback(
    async (familyId: string, eventId: string) => {
      await deleteFamilyLifeEvent(familyId, eventId);
      setStatus("Household event deleted");
      const ev = await getFamilyLifeEvents(familyId, { includeCitations: true });
      setFamilyLifeEventsById((current) => ({ ...current, [familyId]: ev }));
    },
    [setStatus]
  );

  const markDraftDirty = graph.setProfileDraftDirty;
  const handleGenderChange = useCallback(
    (gender: Gender) => {
      if (!selectedPerson || !isGender(gender)) {
        return;
      }
      markDraftDirty(true);
      setGenderByPersonId((current) => ({ ...current, [selectedPerson.id]: gender }));
    },
    [markDraftDirty, selectedPerson]
  );

  const updateProfileEventField = useCallback(
    (key: keyof ProfileEventFields, value: string) => {
      if (!selectedPerson) {
        return;
      }
      markDraftDirty(true);
      const pid = selectedPerson.id;
      setProfileEventFieldsByPersonId((current) => {
        const base = current[pid] ?? deriveProfileDisplayValuesFromLifeEvents(lifeEventsByPersonId[pid]);
        return { ...current, [pid]: { ...base, [key]: value } };
      });
    },
    [lifeEventsByPersonId, markDraftDirty, selectedPerson]
  );

  const handleBirthDateChange = useCallback(
    (birthDate: string) => updateProfileEventField("birthDate", birthDate),
    [updateProfileEventField]
  );
  const handleDeathDateChange = useCallback(
    (deathDate: string) => updateProfileEventField("deathDate", deathDate),
    [updateProfileEventField]
  );
  const handleBirthCityChange = useCallback(
    (birthCity: string) => updateProfileEventField("birthCity", birthCity),
    [updateProfileEventField]
  );
  const handleBirthCountryChange = useCallback(
    (birthCountry: string) => updateProfileEventField("birthCountry", birthCountry),
    [updateProfileEventField]
  );

  const handleGivenNameChange = useCallback(
    (givenName: string) => {
      if (!selectedPerson) {
        return;
      }
      markDraftDirty(true);
      setGivenNameByPersonId((current) => ({ ...current, [selectedPerson.id]: givenName }));
    },
    [markDraftDirty, selectedPerson]
  );
  const handleSurnameChange = useCallback(
    (surname: string) => {
      if (!selectedPerson) {
        return;
      }
      markDraftDirty(true);
      setSurnameByPersonId((current) => ({ ...current, [selectedPerson.id]: surname }));
    },
    [markDraftDirty, selectedPerson]
  );
  const handleNicknamesChange = useCallback(
    (nicknames: string) => {
      if (!selectedPerson) {
        return;
      }
      markDraftDirty(true);
      setNicknamesByPersonId((current) => ({ ...current, [selectedPerson.id]: nicknames }));
    },
    [markDraftDirty, selectedPerson]
  );

  const value = useMemo<PersonDetailContextValue>(
    () => ({
      genders,
      genderByPersonId,
      givenNameByPersonId,
      surnameByPersonId,
      nicknamesByPersonId,
      selectedProfileEventFields,
      lifeEventsByPersonId,
      relationshipLifeEventsById,
      personTimelineById,
      familiesByPersonId,
      familyMediaLinksById,
      evidenceMediaObjects,
      familyLifeEventsById,
      handleGenderChange,
      handleBirthDateChange,
      handleGivenNameChange,
      handleSurnameChange,
      handleNicknamesChange,
      handleDeathDateChange,
      handleBirthCityChange,
      handleBirthCountryChange,
      onProfileSave,
      onUpdateExistingRelationship,
      handlePersonLifeEventCreate,
      handlePersonLifeEventPatch,
      handlePersonLifeEventDelete,
      handleFamilyPatch,
      handleFamilyDelete,
      handleFamilyMediaLinkCreate,
      handleFamilyMediaLinkDelete,
      handleRelationshipLifeEventCreate,
      handleRelationshipLifeEventPatch,
      handleRelationshipLifeEventDelete,
      handleFamilyLifeEventCreate,
      handleFamilyLifeEventPatch,
      handleFamilyLifeEventDelete
    }),
    [
      evidenceMediaObjects,
      familiesByPersonId,
      familyLifeEventsById,
      familyMediaLinksById,
      genderByPersonId,
      givenNameByPersonId,
      handleBirthCityChange,
      handleBirthCountryChange,
      handleBirthDateChange,
      handleDeathDateChange,
      handleFamilyDelete,
      handleFamilyLifeEventCreate,
      handleFamilyLifeEventDelete,
      handleFamilyLifeEventPatch,
      handleFamilyMediaLinkCreate,
      handleFamilyMediaLinkDelete,
      handleFamilyPatch,
      handleGenderChange,
      handleGivenNameChange,
      handleNicknamesChange,
      handlePersonLifeEventCreate,
      handlePersonLifeEventDelete,
      handlePersonLifeEventPatch,
      handleRelationshipLifeEventCreate,
      handleRelationshipLifeEventDelete,
      handleRelationshipLifeEventPatch,
      handleSurnameChange,
      lifeEventsByPersonId,
      nicknamesByPersonId,
      onProfileSave,
      onUpdateExistingRelationship,
      personTimelineById,
      relationshipLifeEventsById,
      selectedProfileEventFields,
      surnameByPersonId
    ]
  );

  return <PersonDetailContext.Provider value={value}>{children}</PersonDetailContext.Provider>;
};

export const usePersonDetail = () => {
  const context = useContext(PersonDetailContext);
  if (!context) {
    throw new Error("usePersonDetail must be used within PersonDetailProvider");
  }
  return context;
};
