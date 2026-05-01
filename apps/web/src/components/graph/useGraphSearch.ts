/**
 * @file Graph-related React hook: useGraphSearch.
 */

import { useCallback, useEffect, useState } from "react";
import type { Person } from "../../lib/api";
import { getPersonDisplayLabel } from "../../lib/personDisplay";

type SearchFallbackMatch = {
  personId: string;
  personName: string;
};

type SearchFallbackResult = {
  matches: SearchFallbackMatch[];
  feedback?: string | null;
};

type UseGraphSearchOptions = {
  people: Person[];
  focusPersonRequest: string | null;
  clearFocusPersonRequest: () => void;
  setSelectedPersonId: (personId: string | null) => void;
  setFocusPersonId: (personId: string | null) => void;
  setPinnedPersonId: (personId: string | null) => void;
  setHoveredPersonId: (personId: string | null) => void;
  initialSearchTerm?: string;
  initialHighlightedPersonIds?: string[];
  onSearchFallback?: (query: string) => Promise<SearchFallbackResult | null>;
  /** Called after search submit moves keyboard/graph focus to a person (re-allows camera auto-center). */
  onSearchFocusCommitted?: () => void;
};

export const findPersonBySearchTerm = (people: Person[], searchTerm: string) => {
  const normalized = searchTerm.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return (
    people.find((person) => {
      const label = getPersonDisplayLabel(person);
      return label.toLowerCase().includes(normalized) || person.name.toLowerCase().includes(normalized);
    }) ?? null
  );
};

export const resolveFocusPersonRequest = (people: Person[], focusPersonRequest: string | null) => {
  if (!focusPersonRequest) {
    return null;
  }
  return people.find((person) => person.id === focusPersonRequest) ?? null;
};

export const useGraphSearch = ({
  people,
  focusPersonRequest,
  clearFocusPersonRequest,
  setSelectedPersonId,
  setFocusPersonId,
  setPinnedPersonId,
  setHoveredPersonId,
  initialSearchTerm = "",
  initialHighlightedPersonIds = [],
  onSearchFallback,
  onSearchFocusCommitted
}: UseGraphSearchOptions) => {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);
  const [highlightedPersonIds, setHighlightedPersonIds] = useState<Set<string>>(
    () => new Set(initialHighlightedPersonIds)
  );

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
    clearFocusPersonRequest();
  }, [
    focusPersonRequest,
    people,
    setFocusPersonId,
    setHoveredPersonId,
    setPinnedPersonId,
    setSelectedPersonId,
    clearHighlights,
    clearFocusPersonRequest
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

  const handleSearchSubmit = useCallback(
    async (event: React.FormEvent) => {
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
        onSearchFocusCommitted?.();
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

        const firstMatch = fallbackResult.matches[0]!;
        setSelectedPersonId(firstMatch.personId);
        setFocusPersonId(firstMatch.personId);
        setPinnedPersonId(firstMatch.personId);
        setHoveredPersonId(firstMatch.personId);
        onSearchFocusCommitted?.();

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
    },
    [
      clearHighlights,
      onSearchFallback,
      onSearchFocusCommitted,
      people,
      searchTerm,
      setFocusPersonId,
      setHoveredPersonId,
      setPinnedPersonId,
      setSelectedPersonId
    ]
  );

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
