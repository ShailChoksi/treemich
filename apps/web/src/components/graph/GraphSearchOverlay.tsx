import { memo, useEffect, useId, useMemo, useState } from "react";

type Props = {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onSearchSubmit: (event: React.FormEvent) => void;
  onClearSearch: () => void;
  onCenterView: () => void;
  people: Array<{ id: string; name: string }>;
  searchFeedback: string | null;
  treeValidationIssueCount: number | null;
  treeValidationEngineDisabled: boolean;
  searchIncludeAlternateNames: boolean;
  onSearchIncludeAlternateNamesChange: (next: boolean) => void;
};

const SEARCH_TERM_DEBOUNCE_MS = 120;
const SEARCH_OPTION_LIMIT = 80;

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
  searchIncludeAlternateNames,
  onSearchIncludeAlternateNamesChange
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

  const sortedPeople = useMemo(
    () => [...people].sort((left, right) => left.name.localeCompare(right.name)),
    [people]
  );
  const datalistOptions = useMemo(() => {
    const query = draftSearchTerm.trim().toLowerCase();
    if (!query) {
      return sortedPeople.slice(0, SEARCH_OPTION_LIMIT);
    }
    const startsWithMatches = sortedPeople.filter((person) => person.name.toLowerCase().startsWith(query));
    if (startsWithMatches.length >= SEARCH_OPTION_LIMIT) {
      return startsWithMatches.slice(0, SEARCH_OPTION_LIMIT);
    }
    const containsMatches = sortedPeople.filter(
      (person) => !person.name.toLowerCase().startsWith(query) && person.name.toLowerCase().includes(query)
    );
    return [...startsWithMatches, ...containsMatches].slice(0, SEARCH_OPTION_LIMIT);
  }, [draftSearchTerm, sortedPeople]);

  const handleSubmit = (event: React.FormEvent) => {
    if (draftSearchTerm !== searchTerm) {
      onSearchTermChange(draftSearchTerm);
    }
    onSearchSubmit(event);
  };

  return (
    <div className="graph-search-overlay">
      <form className="graph-search-form" onSubmit={handleSubmit}>
        <input
          value={draftSearchTerm}
          onChange={(event) => setDraftSearchTerm(event.target.value)}
          placeholder="Search person..."
          list={listId}
          aria-label="Search person"
        />
        <datalist id={listId}>
          {datalistOptions.map((person) => (
            <option key={person.id} value={person.name} />
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
      <label className="graph-search-alt-names">
        <input
          type="checkbox"
          checked={searchIncludeAlternateNames}
          onChange={(e) => onSearchIncludeAlternateNamesChange(e.target.checked)}
        />
        Match alternate Treemich names in people search
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
      {searchFeedback ? (
        <p className="graph-search-feedback" aria-live="polite">
          {searchFeedback}
        </p>
      ) : null}
    </div>
  );
};

export const GraphSearchOverlay = memo(GraphSearchOverlayComponent);
