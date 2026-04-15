import { useEffect, useState } from "react";
import type { ImmichPerson } from "../../lib/api";

type SearchFallbackResult = {
  personId: string;
  personName: string;
  feedback?: string | null;
};

type UseGraphSearchOptions = {
  people: ImmichPerson[];
  focusPersonRequest: string | null;
  setSelectedPersonId: (personId: string | null) => void;
  setFocusPersonId: (personId: string | null) => void;
  setPinnedPersonId: (personId: string | null) => void;
  setHoveredPersonId: (personId: string | null) => void;
  onSearchFallback?: (query: string) => Promise<SearchFallbackResult | null>;
};

export const findPersonBySearchTerm = (people: ImmichPerson[], searchTerm: string) => {
  const normalized = searchTerm.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return people.find((person) => person.name.toLowerCase().includes(normalized)) ?? null;
};

export const resolveFocusPersonRequest = (people: ImmichPerson[], focusPersonRequest: string | null) => {
  if (!focusPersonRequest) {
    return null;
  }
  return people.find((person) => person.id === focusPersonRequest) ?? null;
};

export const useGraphSearch = ({
  people,
  focusPersonRequest,
  setSelectedPersonId,
  setFocusPersonId,
  setPinnedPersonId,
  setHoveredPersonId,
  onSearchFallback
}: UseGraphSearchOptions) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);

  useEffect(() => {
    const focusPerson = resolveFocusPersonRequest(people, focusPersonRequest);
    if (!focusPerson) {
      return;
    }
    setSelectedPersonId(focusPerson.id);
    setFocusPersonId(focusPerson.id);
    setPinnedPersonId(focusPerson.id);
    setHoveredPersonId(focusPerson.id);
    setSearchFeedback(`Focused ${focusPerson.name}`);
  }, [
    focusPersonRequest,
    people,
    setFocusPersonId,
    setHoveredPersonId,
    setPinnedPersonId,
    setSelectedPersonId
  ]);

  useEffect(() => {
    if (!searchFeedback) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setSearchFeedback(null);
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [searchFeedback]);

  const handleSearchSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const match = findPersonBySearchTerm(people, searchTerm);
    if (!searchTerm.trim()) {
      setSearchFeedback("Type a person name.");
      return;
    }
    if (match) {
      setSelectedPersonId(match.id);
      setFocusPersonId(match.id);
      setPinnedPersonId(match.id);
      setHoveredPersonId(match.id);
      setSearchFeedback(`Moved ${match.name} into view`);
      return;
    }

    if (!onSearchFallback) {
      setSearchFeedback(`No person found for "${searchTerm}"`);
      return;
    }

    try {
      const fallbackResult = await onSearchFallback(searchTerm);
      if (!fallbackResult) {
        setSearchFeedback(`No person found for "${searchTerm}"`);
        return;
      }

      setSelectedPersonId(fallbackResult.personId);
      setFocusPersonId(fallbackResult.personId);
      setPinnedPersonId(fallbackResult.personId);
      setHoveredPersonId(fallbackResult.personId);
      setSearchFeedback(fallbackResult.feedback ?? `Focused ${fallbackResult.personName}`);
    } catch (error) {
      setSearchFeedback(error instanceof Error ? error.message : "Search failed");
    }
  };

  return {
    searchTerm,
    setSearchTerm,
    searchFeedback,
    setSearchFeedback,
    handleSearchSubmit
  };
};
