/**
 * @file Natural-language people search overlay and result navigation on the graph.
 */

import { memo, useEffect, useId, useMemo, useState } from "react";
import type { Person } from "../../lib/api";
import { collectImmichSearchAliases, getPersonDisplayLabel } from "../../lib/personDisplay";

type Props = {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onSearchSubmit: (event: React.FormEvent) => void;
  onClearSearch: () => void;
  onCenterView: () => void;
  people: Person[];
  searchFeedback: string | null;
  treeValidationIssueCount: number | null;
  treeValidationEngineDisabled: boolean;
  providerFilter: "all" | "linked" | "unlinked";
  onProviderFilterChange: (next: "all" | "linked" | "unlinked") => void;
  onNewPerson?: () => void;
};

const SEARCH_TERM_DEBOUNCE_MS = 120;
const SEARCH_OPTION_LIMIT = 80;

type SearchOption = {
  key: string;
  personId: string;
  label: string;
};

const buildSearchOptions = (people: Person[]): SearchOption[] => {
  const out: SearchOption[] = [];
  for (const person of people) {
    const primary = getPersonDisplayLabel(person).trim() || person.name.trim();
    if (primary) {
      out.push({ key: `${person.id}:primary`, personId: person.id, label: primary });
    }
    const seen = new Set(primary.toLowerCase());
    for (const alias of collectImmichSearchAliases(person)) {
      const normalized = alias.toLowerCase();
      if (normalized === primary.toLowerCase()) {
        continue;
      }
      if (seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      out.push({ key: `${person.id}:alias:${normalized}`, personId: person.id, label: alias });
    }
  }
  return out.sort(
    (left, right) => left.label.localeCompare(right.label) || left.key.localeCompare(right.key)
  );
};

const GraphSearchOverlayComponent = ({
  searchTerm,
  onSearchTermChange,
  onSearchSubmit,
  onClearSearch,
  onCenterView,
  people,
  searchFeedback,
  treeValidationIssueCount,
  treeValidationEngineDisabled,
  providerFilter,
  onProviderFilterChange,
  onNewPerson
}: Props) => {
  const [draftSearchTerm, setDraftSearchTerm] = useState(searchTerm);
  const listId = useId();

  useEffect(() => {
    setDraftSearchTerm(searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    if (draftSearchTerm === searchTerm) {
      return;
    }
    const timeout = window.setTimeout(() => {
      onSearchTermChange(draftSearchTerm);
    }, SEARCH_TERM_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [draftSearchTerm, onSearchTermChange, searchTerm]);

  const sortedOptions = useMemo(() => buildSearchOptions(people), [people]);

  const datalistOptions = useMemo(() => {
    const query = draftSearchTerm.trim().toLowerCase();
    if (!query) {
      return sortedOptions.slice(0, SEARCH_OPTION_LIMIT);
    }
    const startsWithMatches = sortedOptions.filter((option) => option.label.toLowerCase().startsWith(query));
    if (startsWithMatches.length >= SEARCH_OPTION_LIMIT) {
      return startsWithMatches.slice(0, SEARCH_OPTION_LIMIT);
    }
    const containsMatches = sortedOptions.filter(
      (option) => !option.label.toLowerCase().startsWith(query) && option.label.toLowerCase().includes(query)
    );
    return [...startsWithMatches, ...containsMatches].slice(0, SEARCH_OPTION_LIMIT);
  }, [draftSearchTerm, sortedOptions]);

  const handleSubmit = (event: React.FormEvent) => {
    if (draftSearchTerm !== searchTerm) {
      onSearchTermChange(draftSearchTerm);
    }
    onSearchSubmit(event);
  };

  return (
    <div className="graph-search-overlay">
      <div className="graph-search-relationship-tour-anchor" data-onboarding-target="relationship-search">
        <form className="graph-search-form" onSubmit={handleSubmit}>
          <input
            value={draftSearchTerm}
            onChange={(event) => setDraftSearchTerm(event.target.value)}
            placeholder="Search person..."
            list={listId}
            aria-label="Search person"
          />
          <datalist id={listId}>
            {datalistOptions.map((option) => (
              <option key={option.key} value={option.label} />
            ))}
          </datalist>
          <button type="submit" className="graph-search-icon-button" aria-label="Search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M10.5 4a6.5 6.5 0 1 0 4.03 11.6l4.43 4.44 1.41-1.42-4.43-4.43A6.5 6.5 0 0 0 10.5 4Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z"
                fill="currentColor"
              />
            </svg>
          </button>
          {draftSearchTerm ? (
            <button
              type="button"
              className="graph-search-clear-button"
              aria-label="Clear search"
              onClick={() => {
                setDraftSearchTerm("");
                onClearSearch();
              }}
            >
              x
            </button>
          ) : null}
        </form>
        <p className="graph-search-helper">
          Search by name or try: "mother of Jessica", "sisters of Mike", "mother-in-law of Sue"
        </p>
      </div>
      <label className="graph-search-provider-filter">
        <span>People</span>
        <select
          value={providerFilter}
          onChange={(e) => onProviderFilterChange(e.target.value as typeof providerFilter)}
        >
          <option value="all">All</option>
          <option value="linked">Linked to Immich</option>
          <option value="unlinked">Not linked to Immich</option>
        </select>
      </label>
      {treeValidationEngineDisabled ? (
        <p className="graph-tree-issues-hint">Full-tree validation is disabled (server setting).</p>
      ) : treeValidationIssueCount != null && treeValidationIssueCount > 0 ? (
        <p className="graph-tree-issues" role="status">
          <span className="graph-tree-issues-badge" aria-label="Tree data issues count">
            {treeValidationIssueCount}
          </span>{" "}
          data {treeValidationIssueCount === 1 ? "issue" : "issues"} in this tree (see each person’s life
          events and relationships).
        </p>
      ) : null}
      <button
        type="button"
        className="graph-center-view-button secondary-button"
        onClick={onCenterView}
        aria-label="Center graph view"
      >
        Center view (F)
      </button>
      {onNewPerson ? (
        <button
          type="button"
          className="secondary-button graph-new-person-button"
          data-onboarding-target="new-person"
          onClick={onNewPerson}
        >
          + New person
        </button>
      ) : null}
      {searchFeedback ? (
        <p className="graph-search-feedback" aria-live="polite">
          {searchFeedback}
        </p>
      ) : null}
    </div>
  );
};

export const GraphSearchOverlay = memo(GraphSearchOverlayComponent);
