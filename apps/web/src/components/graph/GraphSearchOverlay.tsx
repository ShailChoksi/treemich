type Props = {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onSearchSubmit: (event: React.FormEvent) => void;
  onClearSearch: () => void;
  people: Array<{ id: string; name: string }>;
  searchFeedback: string | null;
};

export const GraphSearchOverlay = ({
  searchTerm,
  onSearchTermChange,
  onSearchSubmit,
  onClearSearch,
  people,
  searchFeedback
}: Props) => {
  return (
    <div className="graph-search-overlay">
      <form className="graph-search-form" onSubmit={onSearchSubmit}>
        <input
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder="Search person..."
          list="graph-search-options"
          aria-label="Search person"
        />
        <datalist id="graph-search-options">
          {people.map((person) => (
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
        {searchTerm ? (
          <button
            type="button"
            className="graph-search-clear-button"
            aria-label="Clear search"
            onClick={onClearSearch}
          >
            x
          </button>
        ) : null}
      </form>
      <p className="graph-search-helper">
        Search by name or try: "sisters of Mike", "cousins of Sue", "uncle of Tom older than 40"
      </p>
      {searchFeedback ? (
        <p className="graph-search-feedback" aria-live="polite">
          {searchFeedback}
        </p>
      ) : null}
    </div>
  );
};
