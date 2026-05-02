/**
 * @file Searchable Treemich person picker for GEDCOM import match rows (server search + thumbnails).
 */

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Person } from "../../lib/api";
import { personThumbnailUrl, searchPeople } from "../../lib/api";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_CHARS = 2;
const PAGE_SIZE = 10;

const initialsForPerson = (person: Person) => {
  const given = person.profile?.givenName?.trim() ?? "";
  const sur = person.profile?.surname?.trim() ?? "";
  if (given || sur) {
    return `${given.charAt(0) || ""}${sur.charAt(0) || ""}`.toUpperCase() || "?";
  }
  const name = person.name?.trim() ?? "";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
  }
  return name.charAt(0).toUpperCase() || "?";
};

const subtitleParts = (person: Person) => {
  const bits: string[] = [];
  if (person.birthDate) {
    bits.push(`Born ${person.birthDate}`);
  }
  const given = person.profile?.givenName?.trim();
  const sur = person.profile?.surname?.trim();
  if (given || sur) {
    bits.push([given, sur].filter(Boolean).join(" "));
  }
  return bits.join(" · ");
};

export type GedcomPersonMatchComboboxProps = {
  value: string;
  onChange: (personId: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  people: Person[];
};

export const GedcomPersonMatchCombobox = memo(
  ({ value, onChange, disabled = false, ariaLabel, people }: GedcomPersonMatchComboboxProps) => {
    const listboxId = useId();
    const inputId = useId();
    const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
    const selected = value.trim() ? (peopleById.get(value.trim()) ?? null) : null;

    const [query, setQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [results, setResults] = useState<Person[]>([]);
    const [nextOffset, setNextOffset] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestIdRef = useRef(0);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      const t = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
      return () => window.clearTimeout(t);
    }, [query]);

    const canSearch = debouncedQuery.length >= MIN_QUERY_CHARS;

    const runSearch = useCallback(
      async (offset: number, append: boolean) => {
        if (!canSearch) {
          return;
        }
        const requestId = ++requestIdRef.current;
        if (offset === 0) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }
        setError(null);
        try {
          const page = await searchPeople({ query: debouncedQuery, limit: PAGE_SIZE, offset });
          if (requestId !== requestIdRef.current) {
            return;
          }
          setResults((current) => (append ? [...current, ...page.people] : page.people));
          setNextOffset(page.nextOffset);
        } catch (err: unknown) {
          if (requestId !== requestIdRef.current) {
            return;
          }
          setError(err instanceof Error ? err.message : "Search failed");
          if (!append) {
            setResults([]);
            setNextOffset(null);
          }
        } finally {
          if (requestId === requestIdRef.current) {
            setLoading(false);
            setLoadingMore(false);
          }
        }
      },
      [canSearch, debouncedQuery]
    );

    useEffect(() => {
      if (!canSearch) {
        setResults([]);
        setNextOffset(null);
        setHighlightedIndex(-1);
        setOpen(false);
        setError(null);
        setLoading(false);
        setLoadingMore(false);
        requestIdRef.current += 1;
        return;
      }
      void runSearch(0, false);
      setOpen(true);
      setHighlightedIndex(-1);
    }, [canSearch, debouncedQuery, runSearch]);

    const showList = open && canSearch;

    const handleSelect = useCallback(
      (person: Person) => {
        setOpen(false);
        setHighlightedIndex(-1);
        setQuery("");
        setDebouncedQuery("");
        onChange(person.id);
      },
      [onChange]
    );

    const onKeyDown = useCallback(
      (event: KeyboardEvent<HTMLInputElement>) => {
        if (!showList && event.key !== "Escape") {
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          setHighlightedIndex(-1);
          return;
        }
        if (!showList || results.length === 0) {
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setHighlightedIndex((i) => (i + 1) % results.length);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          setHighlightedIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
        } else if (event.key === "Enter") {
          event.preventDefault();
          const idx = highlightedIndex >= 0 ? highlightedIndex : 0;
          const person = results[idx];
          if (person) {
            handleSelect(person);
          }
        }
      },
      [handleSelect, highlightedIndex, results, showList]
    );

    const onListScroll = useCallback(
      (event: React.UIEvent<HTMLUListElement>) => {
        const el = event.currentTarget;
        if (nextOffset == null || loadingMore || loading || error) {
          return;
        }
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
          void runSearch(nextOffset, true);
        }
      },
      [error, loading, loadingMore, nextOffset, runSearch]
    );

    useEffect(() => {
      const onDocMouseDown = (event: MouseEvent) => {
        const root = containerRef.current;
        if (!root || !(event.target instanceof Node) || root.contains(event.target)) {
          return;
        }
        setOpen(false);
        setHighlightedIndex(-1);
      };
      document.addEventListener("mousedown", onDocMouseDown);
      return () => document.removeEventListener("mousedown", onDocMouseDown);
    }, []);

    const startChange = () => {
      onChange("");
      setQuery("");
      setDebouncedQuery("");
      setOpen(false);
    };

    return (
      <div className="gedcom-match-combobox" ref={containerRef}>
        {selected ? (
          <div className="gedcom-match-selected card stack">
            <div className="gedcom-match-selected-row">
              <span className="gedcom-match-avatar" aria-hidden="true">
                {selected.thumbnail ? (
                  <img className="gedcom-match-avatar-img" src={personThumbnailUrl(selected.id)} alt="" />
                ) : (
                  <span className="gedcom-match-avatar-initials">{initialsForPerson(selected)}</span>
                )}
              </span>
              <div className="gedcom-match-selected-text stack">
                <strong>{selected.name}</strong>
                <span className="hint">{subtitleParts(selected) || " "}</span>
              </div>
            </div>
            <div className="gedcom-match-selected-actions">
              <button type="button" className="secondary-button" disabled={disabled} onClick={startChange}>
                Change
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={disabled}
                onClick={() => onChange("")}
              >
                Clear
              </button>
            </div>
          </div>
        ) : value.trim() && !selected ? (
          <div className="gedcom-match-selected card stack">
            <p className="hint">Matched person: {value.trim()}</p>
            <div className="gedcom-match-selected-actions">
              <button type="button" className="secondary-button" disabled={disabled} onClick={startChange}>
                Change
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={disabled}
                onClick={() => onChange("")}
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="field-label" htmlFor={inputId}>
              Match to Treemich person
            </label>
            <div className="gedcom-match-combobox-field">
              <input
                id={inputId}
                type="search"
                role="combobox"
                aria-expanded={showList}
                aria-controls={listboxId}
                aria-label={ariaLabel}
                className="gedcom-match-combobox-input"
                placeholder={`Type at least ${MIN_QUERY_CHARS} characters…`}
                value={query}
                disabled={disabled}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => {
                  if (canSearch) {
                    setOpen(true);
                  }
                }}
                onKeyDown={onKeyDown}
              />
              {loading ? <span className="gedcom-match-combobox-status">Searching…</span> : null}
            </div>
            {error ? (
              <p className="hint hint--danger" role="alert">
                {error}
              </p>
            ) : null}
            {showList && !error ? (
              <ul
                id={listboxId}
                role="listbox"
                className="gedcom-match-combobox-results card"
                onScroll={onListScroll}
              >
                {results.length === 0 && !loading ? (
                  <li className="hint gedcom-match-combobox-empty" role="presentation">
                    No people found.
                  </li>
                ) : null}
                {results.map((person, index) => {
                  const thumb = person.thumbnail ? personThumbnailUrl(person.id) : null;
                  const active = index === highlightedIndex;
                  return (
                    <li key={person.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`gedcom-match-combobox-row ${active ? "gedcom-match-combobox-row--active" : ""}`}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        onClick={() => handleSelect(person)}
                      >
                        <span className="gedcom-match-avatar" aria-hidden="true">
                          {thumb ? (
                            <img src={thumb} alt="" className="gedcom-match-avatar-img" />
                          ) : (
                            <span className="gedcom-match-avatar-initials">{initialsForPerson(person)}</span>
                          )}
                        </span>
                        <span className="gedcom-match-combobox-row-text">
                          <span className="gedcom-match-combobox-row-name">{person.name}</span>
                          <span className="hint gedcom-match-combobox-row-meta">
                            {subtitleParts(person)}
                            {person.hasRelationship ? " · In tree" : " · Not in tree"}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
                {loadingMore ? (
                  <li className="hint gedcom-match-combobox-loading-more" role="presentation">
                    Loading more…
                  </li>
                ) : null}
              </ul>
            ) : null}
          </>
        )}
      </div>
    );
  }
);

GedcomPersonMatchCombobox.displayName = "GedcomPersonMatchCombobox";
