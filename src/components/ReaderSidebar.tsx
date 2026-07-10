import { useEffect, useState } from 'react';
import {
  appActions,
  selectBookmarkWorkflow,
  selectBookChapterCount,
  selectBookManifest,
  selectBookType,
  selectNavigationState,
  selectReaderSession,
  selectVoiceWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import { useStreamRuntimeSelector } from '@/state/streamRuntimeStore';
import { useShowBookmarks, useToggleBookmark } from '@/hooks/useBookmarks';

type ViewMode = 'pages' | 'scroll' | 'text' | 'audio';

const SIDEBAR_COLLAPSED_KEY = 'scanned-reader:sidebarCollapsed';
const SIDEBAR_USER_COLLAPSED_KEY = 'scanned-reader:sidebarCollapsedUserSet';
const SIDEBAR_AUTO_COLLAPSE_QUERY = '(max-width: 900px)';

function readInitialCollapsed() {
  if (typeof window === 'undefined') {
    return false;
  }
  if (window.localStorage.getItem(SIDEBAR_USER_COLLAPSED_KEY) !== 'true') {
    return window.matchMedia(SIDEBAR_AUTO_COLLAPSE_QUERY).matches;
  }
  const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
  if (stored === 'true' || stored === 'false') {
    return stored === 'true';
  }
  return window.matchMedia(SIDEBAR_AUTO_COLLAPSE_QUERY).matches;
}

function SidebarIcon({ name }: { name: 'book' | 'pages' | 'scroll' | 'text' | 'audio' | 'toc' | 'search' | 'bookmark' | 'play' | 'dashboard' | 'settings' | 'units' | 'collapse' }) {
  const paths: Record<typeof name, string[]> = {
    book: ['M5 4h10a4 4 0 0 1 4 4v12H8a3 3 0 0 0-3 3V4Z', 'M5 4v19'],
    pages: ['M7 4h10v16H7z', 'M10 8h4M10 12h4M10 16h3'],
    scroll: ['M7 4h10v6a3 3 0 0 1-3 3H7V4Z', 'M7 13h10v7H7z'],
    text: ['M5 6h14M8 6v12M16 6v12M5 18h14'],
    audio: ['M5 15h4l5 4V5L9 9H5v6Z', 'M17 9a4 4 0 0 1 0 6'],
    toc: ['M8 6h11M8 12h11M8 18h11', 'M4 6h.01M4 12h.01M4 18h.01'],
    search: ['M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z', 'M15.5 15.5 20 20'],
    bookmark: ['M7 4h10v16l-5-3-5 3V4Z'],
    play: ['M8 5v14l11-7-11-7Z'],
    dashboard: ['M5 19V9M12 19V5M19 19v-7'],
    settings: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M19 12h2M3 12h2M12 3v2M12 19v2M17 7l1.4-1.4M5.6 18.4 7 17M17 17l1.4 1.4M5.6 5.6 7 7'],
    units: ['M5 5h6v6H5z', 'M13 5h6v6h-6z', 'M5 13h6v6H5z', 'M13 13h6v6h-6z'],
    collapse: ['M15 6 9 12l6 6']
  };

  return (
    <svg className="reader-sidebar-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

export default function ReaderSidebar() {
  const dispatch = useAppDispatch();
  const showBookmarks = useShowBookmarks();
  const toggleBookmark = useToggleBookmark();
  const { bookId: currentBook, currentPage, viewMode } = useAppSelector(selectReaderSession);
  const { mainView } = useAppSelector(selectNavigationState);
  const bookType = useAppSelector(selectBookType);
  const chapterCount = useAppSelector(selectBookChapterCount);
  const manifest = useAppSelector(selectBookManifest);
  const { items: bookmarks } = useAppSelector(selectBookmarkWorkflow);
  const streamStatus = useStreamRuntimeSelector((state) => state.status);
  const { streamVoice, streamVoiceOptions } = useAppSelector(selectVoiceWorkflow);
  const [collapsed, setCollapsed] = useState(readInitialCollapsed);
  const [pageDraft, setPageDraft] = useState('');
  const isTextBook = bookType === 'text';
  const manifestLength = isTextBook ? chapterCount : manifest.length;
  const disablePagesMode = isTextBook;
  const disableScrollMode = isTextBook;
  const audioLibraryOpen = mainView === 'audio-library';
  const unitsLibraryOpen = mainView === 'units';
  const isBookmarked = bookmarks.some((entry) => entry.page === currentPage);
  const bookmarksCount = bookmarks.length;
  const controlsDisabled = manifestLength === 0 || !currentBook;
  const streamActive =
    streamStatus === 'streaming' ||
    streamStatus === 'connecting' ||
    streamStatus === 'paused';
  const showReaderControls = mainView === 'reader';

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    setPageDraft('');
  }, [currentPage, manifestLength]);

  const pageLabel = manifestLength === 0 ? '0 / 0' : `${currentPage + 1} / ${manifestLength}`;

  const submitPage = () => {
    const desired = Number.parseInt(pageDraft, 10);
    if (!Number.isInteger(desired)) {
      return;
    }
    dispatch(appActions.requestPageNavigation(desired - 1));
    setPageDraft('');
  };
  const handleViewModeChange = (mode: ViewMode) => {
    if (isTextBook && (mode === 'pages' || mode === 'scroll')) {
      return;
    }
    dispatch(appActions.setMainView('reader'));
    dispatch(appActions.setReaderViewMode(mode));
  };
  const toggleCollapsed = () => {
    window.localStorage.setItem(SIDEBAR_USER_COLLAPSED_KEY, 'true');
    setCollapsed((value) => !value);
  };
  const handleOpenBookModal = () => {
    dispatch(appActions.closeModal('settings'));
    dispatch(appActions.openModal('bookSelect'));
  };
  const handleOpenAudioLibrary = () => {
    dispatch(appActions.closeModal('settings'));
    dispatch(appActions.setMainView('audio-library'));
  };
  const handleOpenUnits = () => {
    dispatch(appActions.closeModal('settings'));
    dispatch(appActions.setSelectedUnitSetId(null));
    dispatch(appActions.setSelectedUnitTopicId(null));
    dispatch(appActions.setMainView('units'));
  };
  const handleOpenToc = () => {
    dispatch(appActions.closeModal('settings'));
    dispatch(appActions.openModal('tocNav'));
  };
  const handleOpenSearch = () => {
    dispatch(appActions.openModal('search'));
  };
  const handleOpenListeningDashboard = () => {
    dispatch(appActions.closeModal('settings'));
    dispatch(appActions.openModal('listeningDashboard'));
  };

  return (
    <aside className={`reader-sidebar ${collapsed ? 'reader-sidebar-collapsed' : ''}`} aria-label="Reader navigation">
      <div className="reader-sidebar-header">
        <button
          type="button"
          className="reader-sidebar-toggle"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          data-tooltip={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <SidebarIcon name="collapse" />
        </button>
        {!collapsed ? (
          <div className="reader-sidebar-title">
            <span className="reader-sidebar-kicker">Reader</span>
            <span className="reader-sidebar-book" title={currentBook ?? 'No book selected'}>
              {currentBook ?? 'No book selected'}
            </span>
          </div>
        ) : null}
      </div>

      <div className="reader-sidebar-section">
        <button type="button" className="reader-sidebar-action" onClick={handleOpenBookModal} title="Select book" data-tooltip={currentBook ? 'Change Book' : 'Select Book'}>
          <SidebarIcon name="book" />
          <span className="reader-sidebar-label">{currentBook ? 'Change Book' : 'Select Book'}</span>
        </button>
        <button
          type="button"
          className={`reader-sidebar-action ${audioLibraryOpen ? 'reader-sidebar-action-active' : ''}`}
          onClick={handleOpenAudioLibrary}
          title="MP3 Library"
          data-tooltip="MP3 Library"
        >
          <SidebarIcon name="audio" />
          <span className="reader-sidebar-label">MP3 Library</span>
        </button>
        <button
          type="button"
          className={`reader-sidebar-action ${unitsLibraryOpen ? 'reader-sidebar-action-active' : ''}`}
          onClick={handleOpenUnits}
          title="Units"
          data-tooltip="Units"
        >
          <SidebarIcon name="units" />
          <span className="reader-sidebar-label">Units</span>
        </button>
      </div>

      {showReaderControls ? (
        <div className="reader-sidebar-section">
          {!collapsed ? <span className="reader-sidebar-section-title">Mode</span> : null}
          {[
            { mode: 'pages' as const, label: 'Pages', icon: 'pages' as const, disabled: disablePagesMode },
            { mode: 'scroll' as const, label: 'Scroll', icon: 'scroll' as const, disabled: disableScrollMode },
            { mode: 'text' as const, label: 'Text', icon: 'text' as const, disabled: false },
            { mode: 'audio' as const, label: 'Audio', icon: 'audio' as const, disabled: false }
          ].map((item) => (
            <button
              key={item.mode}
              type="button"
              className={`reader-sidebar-action ${viewMode === item.mode ? 'reader-sidebar-action-active' : ''}`}
              onClick={() => handleViewModeChange(item.mode)}
              disabled={controlsDisabled || item.disabled}
              title={item.label}
              data-tooltip={item.label}
            >
              <SidebarIcon name={item.icon} />
              <span className="reader-sidebar-label">{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {showReaderControls ? (
        <div className="reader-sidebar-section reader-sidebar-navigation">
          {!collapsed ? <span className="reader-sidebar-section-title">Page</span> : null}
          <div className="reader-sidebar-pager">
            <button
              type="button"
              className="reader-sidebar-small-button"
              onClick={() => dispatch(appActions.requestPreviousPageNavigation())}
              disabled={controlsDisabled}
              aria-label="Previous page"
              data-tooltip="Previous page"
            >
              &lt;
            </button>
            <span className="reader-sidebar-page-count">{pageLabel}</span>
            <button
              type="button"
              className="reader-sidebar-small-button"
              onClick={() => dispatch(appActions.requestNextPageNavigation())}
              disabled={controlsDisabled}
              aria-label="Next page"
              data-tooltip="Next page"
            >
              &gt;
            </button>
          </div>
          {!collapsed ? (
            <label className="reader-sidebar-goto">
              <span>Go to</span>
              <input
                type="number"
                min={1}
                max={Math.max(1, manifestLength)}
                value={pageDraft}
                placeholder={manifestLength === 0 ? '-' : String(currentPage + 1)}
                disabled={controlsDisabled}
                onChange={(event) => setPageDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    submitPage();
                  }
                }}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {showReaderControls ? (
        <div className="reader-sidebar-section">
          <button type="button" className="reader-sidebar-action" onClick={handleOpenToc} disabled={controlsDisabled} title="Table of contents" data-tooltip="Table of contents">
            <SidebarIcon name="toc" />
            <span className="reader-sidebar-label">TOC</span>
          </button>
          <button type="button" className="reader-sidebar-action" onClick={handleOpenSearch} disabled={!currentBook} title="Search" data-tooltip="Search">
            <SidebarIcon name="search" />
            <span className="reader-sidebar-label">Search</span>
          </button>
          <button
            type="button"
            className={`reader-sidebar-action ${isBookmarked ? 'reader-sidebar-action-active' : ''}`}
            onClick={toggleBookmark}
            disabled={controlsDisabled}
            title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
            data-tooltip={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
          >
            <SidebarIcon name="bookmark" />
            <span className="reader-sidebar-label">{isBookmarked ? 'Bookmarked' : 'Bookmark'}</span>
          </button>
          <button type="button" className="reader-sidebar-action" onClick={showBookmarks} disabled={!currentBook} title="Bookmarks" data-tooltip="Bookmarks">
            <SidebarIcon name="bookmark" />
            <span className="reader-sidebar-label">Bookmarks</span>
            {!collapsed ? <span className="reader-sidebar-count">{bookmarksCount}</span> : null}
          </button>
        </div>
      ) : null}

      <div className="reader-sidebar-section">
        {!collapsed ? <span className="reader-sidebar-section-title">Audio</span> : null}
        {!collapsed ? (
          <label className="reader-sidebar-select">
            <span>Voice</span>
            <select
              value={streamVoice}
              disabled={controlsDisabled}
              onChange={(event) => dispatch(appActions.requestStreamVoiceChange(event.currentTarget.value))}
            >
              {streamVoiceOptions.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {showReaderControls ? (
          <button
            type="button"
            className={`reader-sidebar-action ${streamActive ? 'reader-sidebar-action-active' : ''}`}
            onClick={() =>
              dispatch(streamActive ? appActions.requestStopStream() : appActions.requestPlayVisibleStream())
            }
            disabled={controlsDisabled}
            title={streamActive ? 'Stop stream' : 'Play stream'}
            data-tooltip={streamActive ? 'Stop stream' : 'Play stream'}
          >
            <SidebarIcon name="play" />
            <span className="reader-sidebar-label">{streamActive ? 'Stop Stream' : 'Play Stream'}</span>
          </button>
        ) : null}
        <button type="button" className="reader-sidebar-action" onClick={handleOpenListeningDashboard} title="Listening dashboard" data-tooltip="Listening dashboard">
          <SidebarIcon name="dashboard" />
          <span className="reader-sidebar-label">Dashboard</span>
        </button>
      </div>

      <div className="reader-sidebar-footer">
        <button
          type="button"
          className="reader-sidebar-action"
          onClick={() => dispatch(appActions.openModal('settings'))}
          title="Settings"
          data-tooltip="Settings"
        >
          <SidebarIcon name="settings" />
          <span className="reader-sidebar-label">Settings</span>
        </button>
      </div>
    </aside>
  );
}
