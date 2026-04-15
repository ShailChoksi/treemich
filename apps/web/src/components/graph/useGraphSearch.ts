import { useCallback, useEffect, useState } from "react";
import type { ImmichPerson } from "../../lib/api";

type SearchFallbackMatch = {
  personId: string;
  personName: string;
};

type SearchFallbackResult = {
  matches: SearchFallbackMatch[];
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
  const [highlightedPersonIds, setHighlightedPersonIds] = useState<Set<string>>(new Set());

  const clearHighlights = useCallback(() => {
    setHighlightedPersonIds(new Set());
  }, []);

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
    clearHighlights();
  }, [
    focusPersonRequest,
    people,
    setFocusPersonId,
    setHoveredPersonId,
    setPinnedPersonId,
    setSelectedPersonId,
    clearHighlights
  ]);

  useEffect(() => {
    if (!searchFeedback) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setSearchFeedback(null);
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, [searchFeedback]);

  const handleSearchSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    clearHighlights();
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
      if (!fallbackResult || fallbackResult.matches.length === 0) {
        setSearchFeedback(`No person found for "${searchTerm}"`);
        return;
      }

      const firstMatch = fallbackResult.matches[0];
      setSelectedPersonId(firstMatch.personId);
      setFocusPersonId(firstMatch.personId);
      setPinnedPersonId(firstMatch.personId);
      setHoveredPersonId(firstMatch.personId);

      const allIds = new Set(fallbackResult.matches.map((m) => m.personId));
      setHighlightedPersonIds(allIds);

      if (fallbackResult.feedback) {
        setSearchFeedback(fallbackResult.feedback);
      } else {
        const names = fallbackResult.matches.map((m) => m.personName).join(", ");
        setSearchFeedback(
          `Found ${fallbackResult.matches.length} result${fallbackResult.matches.length === 1 ? "" : "s"}: ${names}`
        );
      }
    } catch (error) {
      setSearchFeedback(error instanceof Error ? error.message : "Search failed");
    }
  };

  return {
    searchTerm,
    setSearchTerm,
    searchFeedback,
    setSearchFeedback,
    highlightedPersonIds,
    clearHighlights,
    handleSearchSubmit
  };
};
