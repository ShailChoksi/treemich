import { useCallback, useMemo } from "react";
import type { RelationshipRecord } from "../lib/api";
import type { PersonDetailPanelProps } from "../components/PersonDetailPanel";
import { usePeopleGraphData } from "./PeopleGraphDataContext";
import { usePersonDetail } from "./PersonDetailContext";

/**
 * Builds the full prop object for {@link PersonDetailPanelWithProps} from graph + detail contexts.
 * Centralises the former `DetailContainer` mega-memo so the page shell does not resynthesise props.
 */
export const usePersonDetailPanelProps = (): PersonDetailPanelProps => {
  const graph = usePeopleGraphData();
  const detail = usePersonDetail();

  const onDeleteRelationship = useCallback(
    async (relationship: RelationshipRecord, _relatedPersonId: string) => {
      await graph.onDeleteExistingRelationship(relationship);
    },
    [graph]
  );

  return useMemo<PersonDetailPanelProps>(
    () => ({
      person: graph.selectedPerson,
      people: graph.people,
      relationships: graph.relationships,
      dismissedSuggestionKeys: graph.savedPreferences?.dismissedSuggestions ?? [],
      genders: detail.genders,
      genderValue: graph.selectedPerson
        ? (detail.genderByPersonId[graph.selectedPerson.id] ?? "UNKNOWN")
        : "UNKNOWN",
      onGenderChange: detail.handleGenderChange,
      birthDateValue: detail.selectedProfileEventFields.birthDate,
      onBirthDateChange: detail.handleBirthDateChange,
      givenNameValue: graph.selectedPerson ? (detail.givenNameByPersonId[graph.selectedPerson.id] ?? "") : "",
      surnameValue: graph.selectedPerson ? (detail.surnameByPersonId[graph.selectedPerson.id] ?? "") : "",
      nicknamesValue: graph.selectedPerson ? (detail.nicknamesByPersonId[graph.selectedPerson.id] ?? "") : "",
      deathDateValue: detail.selectedProfileEventFields.deathDate,
      birthCityValue: detail.selectedProfileEventFields.birthCity,
      birthCountryValue: detail.selectedProfileEventFields.birthCountry,
      onGivenNameChange: detail.handleGivenNameChange,
      onSurnameChange: detail.handleSurnameChange,
      onNicknamesChange: detail.handleNicknamesChange,
      onDeathDateChange: detail.handleDeathDateChange,
      onBirthCityChange: detail.handleBirthCityChange,
      onBirthCountryChange: detail.handleBirthCountryChange,
      onProfileSave: detail.onProfileSave,
      isSavingProfile: graph.isSavingProfile,
      onFocusPerson: graph.focusPersonInGraph,
      onCreateRelationship: graph.onCreateRelationship,
      onUpdateRelationship: detail.onUpdateExistingRelationship,
      onDeleteRelationship,
      onDeletePerson: graph.handleDeletePerson,
      onThumbnailUpload: graph.handleUploadPersonThumbnail,
      onImmichThumbnailImport: graph.handleImportImmichThumbnail,
      onImmichIdentityLink: graph.handleLinkImmichIdentity,
      onImmichIdentityUnlink: graph.handleUnlinkImmichIdentity,
      onDismissSuggestion: graph.onDismissSuggestion,
      isSavingRelationship: graph.isSavingRelationship,
      immichBaseUrl: graph.immichBaseUrl,
      primaryFamilyUnitByPersonId: graph.savedPreferences?.primaryFamilyUnitByPersonId ?? {},
      onPrimaryFamilyUnitChange: graph.onPrimaryFamilyUnitChange,
      relationshipLifeEventsById: detail.relationshipLifeEventsById,
      personLifeEvents: graph.selectedPerson
        ? detail.lifeEventsByPersonId[graph.selectedPerson.id]
        : undefined,
      onPersonLifeEventCreate: detail.handlePersonLifeEventCreate,
      onPersonLifeEventPatch: detail.handlePersonLifeEventPatch,
      onPersonLifeEventDelete: detail.handlePersonLifeEventDelete,
      onRelationshipLifeEventCreate: detail.handleRelationshipLifeEventCreate,
      onRelationshipLifeEventPatch: detail.handleRelationshipLifeEventPatch,
      onRelationshipLifeEventDelete: detail.handleRelationshipLifeEventDelete,
      onPersonNamesChanged: graph.refreshPeopleOnly,
      personTimeline: graph.selectedPerson ? detail.personTimelineById[graph.selectedPerson.id] : undefined,
      families: graph.selectedPerson ? detail.familiesByPersonId[graph.selectedPerson.id] : undefined,
      onFamilyPatch: detail.handleFamilyPatch,
      onFamilyDelete: detail.handleFamilyDelete,
      savingFamilyId: graph.savingFamilyId,
      familyMediaLinksById: detail.familyMediaLinksById,
      mediaObjects: detail.evidenceMediaObjects,
      mediaManagementEnabled: import.meta.env.VITE_EVIDENCE_MANAGEMENT_UI !== "false",
      onFamilyMediaLinkCreate: detail.handleFamilyMediaLinkCreate,
      onFamilyMediaLinkDelete: detail.handleFamilyMediaLinkDelete,
      familyLifeEventsById: detail.familyLifeEventsById,
      onFamilyLifeEventCreate: detail.handleFamilyLifeEventCreate,
      onFamilyLifeEventPatch: detail.handleFamilyLifeEventPatch,
      onFamilyLifeEventDelete: detail.handleFamilyLifeEventDelete
    }),
    [detail, graph, onDeleteRelationship]
  );
};
