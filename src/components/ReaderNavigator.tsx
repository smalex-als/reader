import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import CloseIcon from '@/components/CloseIcon';
import BookSearchFeedback from '@/components/BookSearchFeedback';
import ModalShell from '@/components/ModalShell';
import ReaderIcon, { type ReaderIconName } from '@/components/ReaderIcon';
import { useBookSearch } from '@/hooks/useBookSearch';
import { useRemoveBookmark } from '@/hooks/useBookmarks';
import { formatListeningTime } from '@/lib/listeningTime';
import { getDetailedTocLevel } from '@/lib/toc';
import {
  appActions,
  selectBookmarkWorkflow,
  selectBookType,
  selectModalOpen,
  selectReaderSession,
  selectTocWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

type NavigatorTab = 'contents' | 'search' | 'bookmarks';

const NAVIGATOR_TABS: Array<{
  id: NavigatorTab;
  label: string;
  icon: ReaderIconName;
  modal: 'tocNav' | 'search' | 'bookmarks';
}> = [
  { id: 'contents', label: 'Contents', icon: 'toc', modal: 'tocNav' },
  { id: 'search', label: 'Search', icon: 'search', modal: 'search' },
  { id: 'bookmarks', label: 'Bookmarks', icon: 'bookmarks', modal: 'bookmarks' }
];

const NAVIGATOR_MODALS = NAVIGATOR_TABS.map((tab) => tab.modal);

function formatWordCount(value?: number) {
  if (typeof value !== 'number') {
    return 'Text stats unavailable';
  }
  if (value <= 0) {
    return 'No text';
  }
  return `${new Intl.NumberFormat(undefined, {
    notation: value >= 1000 ? 'compact' : 'standard'
  }).format(value)} words`;
}

function formatTocListeningTime(value?: number) {
  return typeof value === 'number'
    ? formatListeningTime(value)
    : 'audio estimate unavailable';
}

export default function ReaderNavigator() {
  const dispatch = useAppDispatch();
  const removeBookmark = useRemoveBookmark();
  const searchOpen = useAppSelector(selectModalOpen('search'));
  const tocOpen = useAppSelector(selectModalOpen('tocNav'));
  const bookmarksOpen = useAppSelector(selectModalOpen('bookmarks'));
  const { bookId: currentBook, currentPage, viewMode } = useAppSelector(selectReaderSession);
  const bookType = useAppSelector(selectBookType);
  const { items: bookmarks, loading: bookmarksLoading } = useAppSelector(selectBookmarkWorkflow);
  const {
    variant,
    entries: tocEntries,
    detailedEntries,
    loading: tocLoading
  } = useAppSelector(selectTocWorkflow);
  const {
    searchQuery: query,
    setSearchQuery,
    searchResults: results,
    searchLoading,
    searchStatus,
    submittedQuery,
    runSearch
  } = useBookSearch();
  const [draftQuery, setDraftQuery] = useState(query);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const activeEntryRef = useRef<HTMLButtonElement | null>(null);
  const tabRefs = useRef<Record<NavigatorTab, HTMLButtonElement | null>>({
    contents: null,
    search: null,
    bookmarks: null
  });
  const open = searchOpen || tocOpen || bookmarksOpen;
  const activeTab: NavigatorTab = searchOpen
    ? 'search'
    : bookmarksOpen
      ? 'bookmarks'
      : 'contents';
  const entries = useMemo(() => {
    const source = variant === 'detailed' ? detailedEntries : tocEntries;
    return [...source]
      .filter((entry) => Number.isInteger(entry.page))
      .sort((left, right) => left.page - right.page);
  }, [detailedEntries, tocEntries, variant]);
  const sortedBookmarks = useMemo(
    () => [...bookmarks].sort((left, right) => left.page - right.page),
    [bookmarks]
  );

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  useEffect(() => {
    if (!open || activeTab !== 'search') {
      return;
    }
    const focusFrame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus({ preventScroll: true });
      searchInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [activeTab, open]);

  useEffect(() => {
    if (!open || activeTab !== 'contents' || tocLoading) {
      return;
    }
    const scrollFrame = window.requestAnimationFrame(() => {
      activeEntryRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(scrollFrame);
  }, [activeTab, currentPage, entries, open, tocLoading]);

  const closeNavigator = () => {
    NAVIGATOR_MODALS.forEach((modal) => dispatch(appActions.closeModal(modal)));
  };

  const selectTab = (tab: NavigatorTab) => {
    const selected = NAVIGATOR_TABS.find((item) => item.id === tab);
    if (!selected) {
      return;
    }
    NAVIGATOR_MODALS.forEach((modal) => dispatch(appActions.closeModal(modal)));
    dispatch(appActions.openModal(selected.modal));
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: NavigatorTab) => {
    const currentIndex = NAVIGATOR_TABS.findIndex((item) => item.id === tab);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % NAVIGATOR_TABS.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + NAVIGATOR_TABS.length) % NAVIGATOR_TABS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = NAVIGATOR_TABS.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextTab = NAVIGATOR_TABS[nextIndex].id;
    selectTab(nextTab);
    window.requestAnimationFrame(() => tabRefs.current[nextTab]?.focus({ preventScroll: true }));
  };

  const navigateToPage = (page: number, searchResult = false) => {
    if (searchResult) {
      dispatch(
        appActions.setReaderViewMode(
          bookType === 'text' ? 'text' : viewMode === 'scroll' ? 'scroll' : 'pages'
        )
      );
    }
    dispatch(appActions.requestPageNavigation(page));
  };

  if (!open) {
    return null;
  }

  const hasSearchResults = results.length > 0;

  return (
    <ModalShell
      ariaLabel="Reader navigator"
      onClose={closeNavigator}
      className="reader-navigator"
      backdropClassName="reader-navigator-backdrop"
      initialFocusRef={searchInputRef}
    >
      <header className="reader-navigator-header">
        <div className="reader-navigator-heading">
          <span className="reader-navigator-kicker">Reader navigator</span>
          <h2 className="reader-navigator-title">{currentBook ?? 'No book selected'}</h2>
        </div>
        <button
          type="button"
          className="button button-ghost modal-icon-button"
          onClick={closeNavigator}
          aria-label="Close reader navigator"
          title="Close reader navigator"
        >
          <CloseIcon />
        </button>
      </header>

      <nav className="reader-navigator-tabs" role="tablist" aria-label="Reader navigator sections">
        {NAVIGATOR_TABS.map((tab) => (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[tab.id] = element;
            }}
            id={`reader-navigator-tab-${tab.id}`}
            type="button"
            className="reader-navigator-tab"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`reader-navigator-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => selectTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
          >
            <ReaderIcon name={tab.icon} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {activeTab === 'contents' ? (
        <section
          id="reader-navigator-panel-contents"
          className="reader-navigator-body"
          role="tabpanel"
          aria-labelledby="reader-navigator-tab-contents"
        >
          <div className="reader-navigator-section-toolbar" aria-label="Table of contents detail">
            <button
              type="button"
              className={variant === 'main' ? 'button button-primary' : 'button button-secondary'}
              onClick={() => dispatch(appActions.setTocVariant('main'))}
              aria-pressed={variant === 'main'}
            >
              Main
            </button>
            <button
              type="button"
              className={variant === 'detailed' ? 'button button-primary' : 'button button-secondary'}
              onClick={() => dispatch(appActions.setTocVariant('detailed'))}
              aria-pressed={variant === 'detailed'}
            >
              Detailed
            </button>
          </div>
          {tocLoading ? <p className="modal-status">Loading table of contents…</p> : null}
          {!tocLoading && entries.length === 0 ? (
            <p className="modal-status">No table of contents entries yet.</p>
          ) : null}
          {!tocLoading && entries.length > 0 ? (
            <ul className="toc-nav-list">
              {entries.map((entry, index) => {
                const nextEntry = entries[index + 1] ?? null;
                const isActive =
                  currentPage >= entry.page && (!nextEntry || currentPage < nextEntry.page);
                return (
                  <li
                    key={`${entry.title}-${entry.page}-${index}`}
                    className={`toc-nav-item ${
                      variant === 'detailed'
                        ? `toc-nav-item-level-${getDetailedTocLevel(entries, index)}`
                        : ''
                    }`}
                  >
                    <button
                      ref={isActive ? activeEntryRef : null}
                      type="button"
                      className={`toc-nav-button ${isActive ? 'toc-nav-button-active' : ''}`}
                      onClick={() => navigateToPage(entry.page)}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="toc-nav-copy">
                        <span className="toc-nav-title">{entry.title}</span>
                        <span className="toc-nav-meta">
                          {formatWordCount(entry.stats?.wordCount)} ·{' '}
                          {formatTocListeningTime(entry.stats?.listeningSeconds)}
                        </span>
                      </span>
                      <span className="toc-nav-page">Page {entry.page + 1}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'search' ? (
        <section
          id="reader-navigator-panel-search"
          className="reader-navigator-body"
          role="tabpanel"
          aria-labelledby="reader-navigator-tab-search"
        >
          <form
            className="search-form reader-navigator-search-form"
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch(draftQuery);
            }}
          >
            <input
              ref={searchInputRef}
              type="search"
              className="input search-input"
              placeholder="Search this book"
              aria-label="Search this book"
              value={draftQuery}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                setDraftQuery(nextValue);
                setSearchQuery(nextValue);
              }}
            />
            <button
              type="submit"
              className="button"
              disabled={!currentBook || searchLoading || !draftQuery.trim()}
            >
              {searchLoading ? 'Searching…' : 'Search'}
            </button>
          </form>
          <BookSearchFeedback
            status={searchStatus}
            query={query}
            submittedQuery={submittedQuery}
            resultCount={results.length}
            onRetry={() => void runSearch(submittedQuery)}
          />
          {hasSearchResults ? (
            <ul className="search-result-list">
              {results.map((result) => {
                const isActive = result.page === currentPage;
                return (
                  <li
                    key={result.id}
                    className={`search-result-item ${isActive ? 'search-result-item-active' : ''}`}
                  >
                    <div className="search-result-meta">
                      <div className="search-result-header">
                        <div className="search-result-title-row">
                          <span className="search-result-title">
                            {result.title || 'Untitled section'}
                          </span>
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
                        onClick={() => navigateToPage(result.page, true)}
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
      ) : null}

      {activeTab === 'bookmarks' ? (
        <section
          id="reader-navigator-panel-bookmarks"
          className="reader-navigator-body"
          role="tabpanel"
          aria-labelledby="reader-navigator-tab-bookmarks"
        >
          {bookmarksLoading ? <p className="modal-status">Loading bookmarks…</p> : null}
          {!bookmarksLoading && sortedBookmarks.length === 0 ? (
            <p className="modal-status">No bookmarks saved for this book.</p>
          ) : null}
          {!bookmarksLoading && sortedBookmarks.length > 0 ? (
            <ul className="bookmark-list">
              {sortedBookmarks.map((bookmark) => {
                const isActive = bookmark.page === currentPage;
                return (
                  <li
                    key={`${bookmark.image}-${bookmark.page}`}
                    className={`bookmark-item ${isActive ? 'bookmark-item-active' : ''}`}
                  >
                    <div className="bookmark-meta">
                      <div className="bookmark-meta-row">
                        <span className="bookmark-title">{bookmark.label}</span>
                        <span className="bookmark-subtitle">Page {bookmark.page + 1}</span>
                        {isActive ? <span className="bookmark-badge">Current</span> : null}
                      </div>
                      <span className="bookmark-path">{bookmark.image}</span>
                    </div>
                    <div className="bookmark-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => navigateToPage(bookmark.page)}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => void removeBookmark(bookmark.page)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      ) : null}
    </ModalShell>
  );
}
