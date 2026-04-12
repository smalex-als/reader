import { useEffect, useRef, useState } from 'react';
import type { SearchResult } from '@/types/app';

interface SearchModalProps {
  open: boolean;
  currentBook: string | null;
  currentPage: number;
  loading: boolean;
  query: string;
  results: SearchResult[];
  onClose: () => void;
  onSearch: (query: string) => void;
  onQueryChange: (query: string) => void;
  onSelect: (result: SearchResult) => void;
}

export default function SearchModal({
  open,
  currentBook,
  currentPage,
  loading,
  query,
  results,
  onClose,
  onSearch,
  onQueryChange,
  onSelect
}: SearchModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draftQuery, setDraftQuery] = useState(query);

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) {
    return null;
  }

  const hasResults = results.length > 0;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-wide search-modal">
        <header className="modal-header">
          <h2 className="modal-title">
            Search
            {currentBook ? <span className="modal-marker">• {currentBook}</span> : null}
          </h2>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <section className="modal-body">
          <form
            className="search-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSearch(draftQuery);
            }}
          >
            <input
              ref={inputRef}
              type="search"
              className="input search-input"
              placeholder="Search this book"
              value={draftQuery}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                setDraftQuery(nextValue);
                onQueryChange(nextValue);
              }}
            />
            <button type="submit" className="button" disabled={!currentBook || loading || !draftQuery.trim()}>
              {loading ? 'Searching…' : 'Search'}
            </button>
          </form>

          {!loading && !hasResults && query.trim() ? (
            <p className="modal-status">No matches found for “{query.trim()}”.</p>
          ) : null}
          {!loading && !query.trim() ? (
            <p className="modal-status">Enter a term or phrase to search this book.</p>
          ) : null}

          {hasResults ? (
            <ul className="search-result-list">
              {results.map((result) => {
                const isActive = result.page === currentPage;
                return (
                  <li key={result.id} className={`search-result-item ${isActive ? 'search-result-item-active' : ''}`}>
                    <div className="search-result-meta">
                      <div className="search-result-header">
                        <span className="search-result-title">{result.title || 'Untitled section'}</span>
                        <span className="search-result-location">
                          {result.kind === 'chapter' && result.chapterNumber
                            ? `Chapter ${result.chapterNumber}`
                            : `Page ${result.page + 1}`}
                        </span>
                        {isActive ? <span className="bookmark-badge">Current</span> : null}
                      </div>
                      <p className="search-result-snippet">{result.snippet}</p>
                      <span className="search-result-path">{result.textPath}</span>
                    </div>
                    <div className="search-result-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => onSelect(result)}
                      >
                        Open
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      </div>
    </div>
  );
}
