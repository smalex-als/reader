import { useEffect, useRef, useState } from 'react';
import CloseIcon from '@/components/CloseIcon';
import { useBookSearch } from '@/hooks/useBookSearch';
import {
  appActions,
  selectBookSessionWorkflow,
  selectModalOpen,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export default function SearchModal() {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectModalOpen('search'));
  const { bookId: currentBook, currentPage, viewMode } = useAppSelector(selectReaderSession);
  const { bookType } = useAppSelector(selectBookSessionWorkflow);
  const {
    searchQuery: query,
    setSearchQuery,
    searchResults: results,
    searchLoading: loading,
    runSearch
  } = useBookSearch();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draftQuery, setDraftQuery] = useState(query);
  const handleClose = () => {
    dispatch(appActions.closeModal('search'));
  };
  const handleSelectResult = (page: number) => {
    dispatch(appActions.closeModal('search'));
    dispatch(
      appActions.setReaderViewMode(
        bookType === 'text' ? 'text' : viewMode === 'scroll' ? 'scroll' : 'pages'
      )
    );
    dispatch(appActions.requestPageNavigation(page));
  };

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
          <button
            type="button"
            className="button button-ghost modal-icon-button"
            onClick={handleClose}
            aria-label="Close search"
            title="Close search"
          >
            <CloseIcon />
          </button>
        </header>
        <section className="modal-body">
          <form
            className="search-form"
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch(draftQuery);
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
                setSearchQuery(nextValue);
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
                        <div className="search-result-title-row">
                          <span className="search-result-title">{result.title || 'Untitled section'}</span>
                          {result.subtitle ? (
                            <span className="search-result-subtitle">/ {result.subtitle}</span>
                          ) : null}
                        </div>
                        {isActive ? <span className="bookmark-badge">Current</span> : null}
                      </div>
                      <p className="search-result-snippet">{result.snippet}</p>
                      <span className="search-result-location">
                        {result.kind === 'chapter' && result.chapterNumber
                          ? `Chapter ${result.chapterNumber}`
                          : `Page ${result.page + 1}`}
                      </span>
                    </div>
                    <div className="search-result-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => handleSelectResult(result.page)}
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
