import ReaderIcon, { type ReaderIconName } from '@/components/ReaderIcon';
import { useReaderContextToolbar } from '@/hooks/useReaderContextToolbar';
import type { ViewMode } from '@/lib/appConstants';

const VIEW_MODES: Array<{ mode: ViewMode; label: string; icon: ReaderIconName }> = [
  { mode: 'pages', label: 'Pages', icon: 'pages' },
  { mode: 'scroll', label: 'Scroll', icon: 'scroll' },
  { mode: 'text', label: 'Text', icon: 'text' },
  { mode: 'audio', label: 'Audio', icon: 'audio' }
];

export default function ReaderContextToolbar() {
  const toolbar = useReaderContextToolbar();
  const activeMode = VIEW_MODES.find((item) => item.mode === toolbar.viewMode) ?? VIEW_MODES[0];
  const pageLabel = `${toolbar.displayPage} / ${toolbar.navigationCount}`;

  return (
    <section className="reader-context" aria-label="Reading controls">
      <header className="reader-context-heading">
        <div className="reader-context-title">
          <span className="reader-context-kicker">{toolbar.bookId ?? 'Reader'}</span>
          <span className="reader-context-chapter">
            {toolbar.chapterLabel ?? (toolbar.bookId ? activeMode.label : 'No book selected')}
          </span>
        </div>
        <span className="reader-context-progress-label">{pageLabel}</span>
      </header>

      <div className="reader-context-toolbar" role="toolbar" aria-label="Reader toolbar">
        <div className="reader-context-modes" aria-label="Reading mode">
          {VIEW_MODES.map((item) => (
            <button
              key={item.mode}
              type="button"
              className="reader-context-button"
              onClick={() => toolbar.setViewMode(item.mode)}
              disabled={
                toolbar.controlsDisabled ||
                (toolbar.isTextBook && (item.mode === 'pages' || item.mode === 'scroll'))
              }
              aria-pressed={toolbar.viewMode === item.mode}
            >
              <ReaderIcon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="reader-context-pager" aria-label="Page navigation">
          <button
            type="button"
            className="reader-context-button reader-context-icon-button"
            onClick={toolbar.requestPreviousPage}
            disabled={toolbar.controlsDisabled || toolbar.displayPage <= 1}
            aria-label="Previous page"
          >
            <ReaderIcon name="chevron-left" />
          </button>
          <form
            className="reader-context-page-form"
            onSubmit={(event) => {
              event.preventDefault();
              toolbar.submitPage();
            }}
          >
            <input
              type="number"
              min={1}
              max={Math.max(1, toolbar.navigationCount)}
              value={toolbar.pageDraft}
              placeholder={String(toolbar.displayPage)}
              disabled={toolbar.controlsDisabled}
              onChange={(event) => toolbar.setPageDraft(event.currentTarget.value)}
              aria-label="Go to page"
            />
            <span>/ {toolbar.navigationCount}</span>
          </form>
          <button
            type="button"
            className="reader-context-button reader-context-icon-button"
            onClick={toolbar.requestNextPage}
            disabled={toolbar.controlsDisabled || toolbar.displayPage >= toolbar.navigationCount}
            aria-label="Next page"
          >
            <ReaderIcon name="chevron-right" />
          </button>
        </div>

        <div className="reader-context-actions">
          <button type="button" className="reader-context-button" onClick={toolbar.openSearch} disabled={!toolbar.bookId}>
            <ReaderIcon name="search" />
            <span>Search</span>
          </button>
          <button type="button" className="reader-context-button" onClick={toolbar.openToc} disabled={toolbar.controlsDisabled}>
            <ReaderIcon name="toc" />
            <span>TOC</span>
          </button>
          <button
            type="button"
            className="reader-context-button"
            onClick={toolbar.handleToggleBookmark}
            disabled={toolbar.controlsDisabled}
            aria-pressed={toolbar.isBookmarked}
          >
            <ReaderIcon name="bookmark" />
            <span>{toolbar.isBookmarked ? 'Saved' : 'Save'}</span>
          </button>
          <button
            type="button"
            className="reader-context-button"
            onClick={() => toolbar.setPanel('listen')}
            disabled={toolbar.controlsDisabled}
            aria-expanded={toolbar.activePanel === 'listen'}
          >
            <ReaderIcon name="audio" />
            <span>Listen</span>
          </button>
          <button
            type="button"
            className="reader-context-button reader-context-icon-button"
            onClick={() => toolbar.setPanel('more')}
            aria-label="More reading tools"
            aria-expanded={toolbar.activePanel === 'more'}
          >
            <ReaderIcon name="more" />
          </button>
        </div>

        <span className="reader-context-mobile-mode">{activeMode.label}</span>
      </div>

      <div className="reader-context-progress" aria-hidden="true">
        <span style={{ width: `${toolbar.progress}%` }} />
      </div>

      {toolbar.activePanel === 'mode' ? (
        <div className="reader-context-panel reader-context-mode-panel">
          {VIEW_MODES.map((item) => (
            <button
              key={item.mode}
              type="button"
              className="reader-context-panel-button"
              onClick={() => toolbar.setViewMode(item.mode)}
              disabled={
                toolbar.controlsDisabled ||
                (toolbar.isTextBook && (item.mode === 'pages' || item.mode === 'scroll'))
              }
              aria-pressed={toolbar.viewMode === item.mode}
            >
              <ReaderIcon name={item.icon} />
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {toolbar.activePanel === 'listen' ? (
        <div className="reader-context-panel reader-context-listen-panel">
          <span className="reader-context-panel-title">
            <ReaderIcon name="audio" />
            Read visible content
          </span>
          <label className="reader-context-voice">
            <span>Voice</span>
            <select
              value={toolbar.streamVoice}
              onChange={(event) => toolbar.setStreamVoice(event.currentTarget.value)}
              disabled={toolbar.controlsDisabled}
            >
              {toolbar.streamVoiceOptions.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="reader-context-panel-button reader-context-primary-button"
            onClick={toolbar.toggleStream}
            disabled={toolbar.controlsDisabled}
          >
            <ReaderIcon name={toolbar.streamActive ? 'stop' : 'play'} />
            {toolbar.streamActive ? 'Stop' : 'Play'}
          </button>
        </div>
      ) : null}

      {toolbar.activePanel === 'more' ? (
        <div className="reader-context-panel reader-context-more-panel">
          <button type="button" className="reader-context-panel-button" onClick={toolbar.handleShowBookmarks} disabled={!toolbar.bookId}>
            <ReaderIcon name="bookmarks" />
            Bookmarks
          </button>
          <button type="button" className="reader-context-panel-button" onClick={toolbar.openListeningDashboard}>
            <ReaderIcon name="dashboard" />
            Dashboard
          </button>
          <span className="reader-context-mobile-divider" />
          <button type="button" className="reader-context-panel-button reader-context-mobile-global" onClick={toolbar.openBookSelect}>
            <ReaderIcon name="book" />
            {toolbar.bookId ? 'Change book' : 'Select book'}
          </button>
          <button type="button" className="reader-context-panel-button reader-context-mobile-global" onClick={toolbar.openAudioLibrary}>
            <ReaderIcon name="headphones" />
            MP3 Library
          </button>
          <button type="button" className="reader-context-panel-button reader-context-mobile-global" onClick={toolbar.openUnits}>
            <ReaderIcon name="units" />
            Units
          </button>
          <button type="button" className="reader-context-panel-button reader-context-mobile-global" onClick={toolbar.openSettings}>
            <ReaderIcon name="settings" />
            Settings
          </button>
        </div>
      ) : null}

      <nav className="reader-context-mobile-nav" aria-label="Mobile reading controls">
        <button type="button" onClick={() => toolbar.setPanel('mode')} aria-expanded={toolbar.activePanel === 'mode'}>
          <ReaderIcon name={activeMode.icon} />
          <span>{activeMode.label}</span>
        </button>
        <button type="button" onClick={toolbar.openSearch} disabled={!toolbar.bookId}>
          <ReaderIcon name="search" />
          <span>Search</span>
        </button>
        <button type="button" onClick={toolbar.openToc} disabled={toolbar.controlsDisabled}>
          <ReaderIcon name="toc" />
          <span>TOC</span>
        </button>
        <button type="button" onClick={() => toolbar.setPanel('listen')} disabled={toolbar.controlsDisabled} aria-expanded={toolbar.activePanel === 'listen'}>
          <ReaderIcon name="audio" />
          <span>Listen</span>
        </button>
        <button type="button" onClick={() => toolbar.setPanel('more')} aria-expanded={toolbar.activePanel === 'more'}>
          <ReaderIcon name="more" />
          <span>More</span>
        </button>
      </nav>
    </section>
  );
}
