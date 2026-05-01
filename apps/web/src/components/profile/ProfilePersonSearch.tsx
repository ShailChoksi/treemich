/**
 * @file Paginated server search combobox for the Profile workspace.
 */

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Person, RelationshipRecord } from "../../lib/api";
import { personThumbnailUrl, searchPeople } from "../../lib/api";
import { directRelationshipHint } from "./profileSearchHints";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_CHARS = 2;
const PAGE_SIZE = 10;

type Props = {
  selectedPersonId: string | null;
  relationships: RelationshipRecord[];
  onSelect: (person: Person) => void;
  /** Shown when the current query returned no rows (Create person with prefilled names). */
  onCreateFromQuery?: (query: string) => void;
};

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
  const nick = person.profile?.nicknames?.trim();
  if (nick) {
    bits.push(`“${nick}”`);
  }
  const given = person.profile?.givenName?.trim();
  const sur = person.profile?.surname?.trim();
  if (given || sur) {
    bits.push([given, sur].filter(Boolean).join(" "));
  }
  return bits.join(" · ");
};

export const ProfilePersonSearch = memo(
  ({ selectedPersonId, relationships, onSelect, onCreateFromQuery }: Props) => {
    const listboxId = useId();
    const inputId = useId();
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
        onSelect(person);
      },
      [onSelect]
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

    const hintById = useMemo(() => {
      const map = new Map<string, string | null>();
      for (const person of results) {
        map.set(person.id, directRelationshipHint(relationships, selectedPersonId, person));
      }
      return map;
    }, [relationships, results, selectedPersonId]);

    return (
      <div className="profile-person-search" ref={containerRef}>
        <label className="profile-person-search-label" htmlFor={inputId}>
          Find a profile
        </label>
        <div className="profile-person-search-field">
          <input
            id={inputId}
            type="search"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listboxId}
            aria-autocomplete="list"
            className="profile-person-search-input"
            placeholder={`Type at least ${MIN_QUERY_CHARS} characters…`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => {
              if (canSearch) {
                setOpen(true);
              }
            }}
            onKeyDown={onKeyDown}
          />
          {loading ? <span className="profile-person-search-status">Searching…</span> : null}
        </div>
        {error ? (
          <div className="profile-person-search-error card stack" role="alert">
            <p className="hint">{error}</p>
            <button type="button" className="secondary-button" onClick={() => void runSearch(0, false)}>
              Retry search
            </button>
          </div>
        ) : null}
        {showList && !error ? (
          <ul
            id={listboxId}
            role="listbox"
            className="profile-person-search-results card"
            onScroll={onListScroll}
          >
            {results.length === 0 && !loading ? (
              <li className="profile-person-search-empty" role="presentation">
                <div className="stack profile-person-search-empty-inner">
                  <span className="hint">No people found.</span>
                  {onCreateFromQuery ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => onCreateFromQuery(debouncedQuery)}
                    >
                      Create person from search
                    </button>
                  ) : null}
                </div>
              </li>
            ) : null}
            {results.map((person, index) => {
              const hint = hintById.get(person.id) ?? null;
              const thumb = person.thumbnail ? personThumbnailUrl(person.id) : null;
              const active = index === highlightedIndex;
              const isCurrent = person.id === selectedPersonId;
              return (
                <li key={person.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`profile-person-search-row ${active ? "profile-person-search-row--active" : ""}`}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => handleSelect(person)}
                  >
                    <span className="profile-person-search-avatar" aria-hidden="true">
                      {thumb ? (
                        <img src={thumb} alt="" className="profile-person-search-avatar-img" />
                      ) : (
                        <span className="profile-person-search-avatar-initials">
                          {initialsForPerson(person)}
                        </span>
                      )}
                    </span>
                    <span className="profile-person-search-row-text">
                      <span className="profile-person-search-row-name">
                        {person.name}
                        {isCurrent ? (
                          <span className="profile-person-search-current-badge">Current profile</span>
                        ) : null}
                      </span>
                      <span className="profile-person-search-row-meta">
                        {subtitleParts(person)}
                        {person.hasRelationship ? " · In tree" : " · Not in tree"}
                        {hint ? ` · ${hint} of selected` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {loadingMore ? (
              <li className="profile-person-search-loading-more hint" role="presentation">
                Loading more…
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    );
  }
);

ProfilePersonSearch.displayName = "ProfilePersonSearch";
