import { useEffect, useRef, type MouseEvent } from 'react';
import ReaderIcon, { type ReaderIconName } from '@/components/ReaderIcon';
import {
  useReaderContextToolbar,
  type ReaderContextPanel
} from '@/hooks/useReaderContextToolbar';
import type { ViewMode } from '@/lib/appConstants';

const VIEW_MODES: Array<{
  mode: ViewMode;
  label: string;
  icon: ReaderIconName;
  shortcut?: string;
}> = [
  { mode: 'pages', label: 'Pages', icon: 'pages', shortcut: '1' },
  { mode: 'scroll', label: 'Scroll', icon: 'scroll', shortcut: '2' },
  { mode: 'text', label: 'Text', icon: 'text', shortcut: '3' },
  { mode: 'audio', label: 'Audio', icon: 'audio' }
];

const PANEL_FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'select:not([disabled])',
  'input:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export default function ReaderContextToolbar() {
  const toolbar = useReaderContextToolbar();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const activeMode = VIEW_MODES.find((item) => item.mode === toolbar.viewMode) ?? VIEW_MODES[0];
  const positionLabel = toolbar.isChapterNavigation
    ? toolbar.chapterNavigation.total > 0
      ? `Chapter ${toolbar.chapterNavigation.position} / ${toolbar.chapterNavigation.total}`
      : 'No chapters'
    : `${toolbar.displayPage} / ${toolbar.navigationCount}`;

  const restorePanelTrigger = () => {
    panelTriggerRef.current?.focus({ preventScroll: true });
  };

  const closePanelAndRestoreFocus = () => {
    const trigger = panelTriggerRef.current;
    toolbar.closePanel();
    window.requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (!toolbar.activePanel) {
      return;
    }
    const focusFrame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      const focusTarget = panel?.querySelector<HTMLElement>(PANEL_FOCUSABLE_SELECTOR) ?? panel;
      focusTarget?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [toolbar.activePanel]);

  useEffect(() => {
    if (!toolbar.activePanel) {
      return;
    }
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      closePanelAndRestoreFocus();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [toolbar.activePanel]);

  const togglePanel = (
    panel: Exclude<ReaderContextPanel, null>,
    event: MouseEvent<HTMLButtonElement>
  ) => {
    if (toolbar.activePanel !== panel) {
      panelTriggerRef.current = event.currentTarget;
    }
    toolbar.setPanel(panel);
  };

  return (
    <section className="reader-context" aria-label="Reading controls">
      <header className="reader-context-heading">
        <div className="reader-context-title">
          <span className="reader-context-kicker">{toolbar.bookId ?? 'Reader'}</span>
          <span className="reader-context-chapter">
            {toolbar.chapterLabel ?? (toolbar.bookId ? activeMode.label : 'No book selected')}
          </span>
        </div>
        <span className="reader-context-progress-label">{positionLabel}</span>
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
              aria-label={`${item.label} reading mode`}
              aria-keyshortcuts={item.shortcut}
              title={`${item.label} reading mode${item.shortcut ? ` (${item.shortcut})` : ''}`}
            >
              <ReaderIcon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {toolbar.isChapterNavigation ? (
          <div className="reader-context-chapter-pager" aria-label="Chapter navigation">
            <button
              type="button"
              className="reader-context-button reader-context-chapter-button"
              onClick={toolbar.requestPreviousPage}
              disabled={toolbar.controlsDisabled || !toolbar.chapterNavigation.hasPrevious}
              aria-label={toolbar.chapterNavigation.previousLabel
                ? `Previous chapter: ${toolbar.chapterNavigation.previousLabel}`
                : 'Previous chapter'}
              aria-keyshortcuts="K PageUp"
              title="Previous chapter (K / PageUp)"
            >
              <ReaderIcon name="chevron-left" />
              <span className="reader-context-chapter-button-copy">
                <span>Previous chapter</span>
                {toolbar.chapterNavigation.previousLabel ? (
                  <strong>{toolbar.chapterNavigation.previousLabel}</strong>
                ) : null}
              </span>
            </button>
            <button
              type="button"
              className="reader-context-button reader-context-chapter-button reader-context-chapter-button-next"
              onClick={toolbar.requestNextPage}
              disabled={toolbar.controlsDisabled || !toolbar.chapterNavigation.hasNext}
              aria-label={toolbar.chapterNavigation.nextLabel
                ? `Next chapter: ${toolbar.chapterNavigation.nextLabel}`
                : 'Next chapter'}
              aria-keyshortcuts="J PageDown"
              title="Next chapter (J / PageDown)"
            >
              <span className="reader-context-chapter-button-copy">
                <span>Next chapter</span>
                {toolbar.chapterNavigation.nextLabel ? (
                  <strong>{toolbar.chapterNavigation.nextLabel}</strong>
                ) : null}
              </span>
              <ReaderIcon name="chevron-right" />
            </button>
          </div>
        ) : (
          <div className="reader-context-pager" aria-label="Page navigation">
            <button
              type="button"
              className="reader-context-button reader-context-icon-button"
              onClick={toolbar.requestPreviousPage}
              disabled={toolbar.controlsDisabled || toolbar.displayPage <= 1}
              aria-label="Previous page"
              aria-keyshortcuts="K PageUp"
              title="Previous page (K / PageUp)"
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
                aria-keyshortcuts="G"
                title="Go to page (G)"
              />
              <span>/ {toolbar.navigationCount}</span>
            </form>
            <button
              type="button"
              className="reader-context-button reader-context-icon-button"
              onClick={toolbar.requestNextPage}
              disabled={toolbar.controlsDisabled || toolbar.displayPage >= toolbar.navigationCount}
              aria-label="Next page"
              aria-keyshortcuts="J PageDown"
              title="Next page (J / PageDown)"
            >
              <ReaderIcon name="chevron-right" />
            </button>
          </div>
        )}

        <div className="reader-context-actions">
          <button
            type="button"
            className="reader-context-button"
            onClick={toolbar.openSearch}
            disabled={!toolbar.bookId}
            aria-label="Search this book"
            aria-keyshortcuts="/"
            title="Search this book (/)"
          >
            <ReaderIcon name="search" />
            <span>Search</span>
          </button>
          <button
            type="button"
            className="reader-context-button reader-context-keep-label"
            onClick={toolbar.openToc}
            disabled={toolbar.controlsDisabled}
            aria-label="Table of contents"
            aria-keyshortcuts="C"
            title="Table of contents (C)"
          >
            <ReaderIcon name="toc" />
            <span>TOC</span>
          </button>
          <button
            type="button"
            className="reader-context-button"
            onClick={toolbar.handleToggleBookmark}
            disabled={toolbar.controlsDisabled}
            aria-pressed={toolbar.isBookmarked}
            aria-label={toolbar.isBookmarked ? 'Remove bookmark' : 'Save bookmark'}
            title={toolbar.isBookmarked ? 'Remove bookmark' : 'Save bookmark'}
          >
            <ReaderIcon name={toolbar.isBookmarked ? 'bookmark-saved' : 'bookmark'} />
            <span>{toolbar.isBookmarked ? 'Saved' : 'Save'}</span>
          </button>
          <button
            type="button"
            className="reader-context-button reader-context-keep-label reader-context-listen-trigger"
            onClick={(event) => togglePanel('listen', event)}
            disabled={toolbar.controlsDisabled}
            aria-expanded={toolbar.activePanel === 'listen'}
            aria-controls="reader-listen-panel"
            aria-label="Listen to visible content"
            aria-keyshortcuts="S"
            title="Listen controls (S to play or stop)"
          >
            <ReaderIcon name="listen" />
            <span>Listen</span>
          </button>
          <button
            type="button"
            className="reader-context-button reader-context-icon-button"
            onClick={(event) => togglePanel('more', event)}
            aria-label="More reading tools"
            aria-expanded={toolbar.activePanel === 'more'}
            aria-controls="reader-more-panel"
            title="More reading tools"
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
        <div
          ref={panelRef}
          id="reader-mode-panel"
          className="reader-context-panel reader-context-mode-panel"
          role="group"
          aria-label="Reading mode"
          tabIndex={-1}
        >
          {VIEW_MODES.map((item) => (
            <button
              key={item.mode}
              type="button"
              className="reader-context-panel-button"
              onClick={() => {
                restorePanelTrigger();
                toolbar.setViewMode(item.mode);
              }}
              disabled={
                toolbar.controlsDisabled ||
                (toolbar.isTextBook && (item.mode === 'pages' || item.mode === 'scroll'))
              }
              aria-pressed={toolbar.viewMode === item.mode}
              aria-label={`${item.label} reading mode`}
              aria-keyshortcuts={item.shortcut}
            >
              <ReaderIcon name={item.icon} />
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {toolbar.activePanel === 'listen' ? (
        <div
          ref={panelRef}
          id="reader-listen-panel"
          className="reader-context-panel reader-context-listen-panel"
          role="group"
          aria-label="Listen controls"
          tabIndex={-1}
        >
          <span className="reader-context-panel-title">
            <ReaderIcon name="listen" />
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
            aria-keyshortcuts="S"
          >
            <ReaderIcon name={toolbar.streamActive ? 'stop' : 'play'} />
            {toolbar.streamActive ? 'Stop' : 'Play'}
          </button>
        </div>
      ) : null}

      {toolbar.activePanel === 'more' ? (
        <div
          ref={panelRef}
          id="reader-more-panel"
          className="reader-context-panel reader-context-more-panel"
          role="group"
          aria-label="More reading tools"
          tabIndex={-1}
        >
          {toolbar.pageInfoAvailable ? (
            <div className="reader-context-page-info">
              <div className="reader-context-page-info-copy">
                <span className="reader-context-page-info-title">
                  <ReaderIcon name="pages" />
                  Page info
                </span>
                <strong title={toolbar.pageSource ?? undefined}>{toolbar.pageFilename}</strong>
                <span>
                  Page {toolbar.displayPage} of {toolbar.navigationCount}
                  {' · '}
                  {toolbar.pageDimensions ?? 'Dimensions unavailable in this view'}
                </span>
              </div>
              <div className="reader-context-page-info-actions">
                <button
                  type="button"
                  className="reader-context-panel-button"
                  onClick={() => void toolbar.copyPageFilename()}
                >
                  Copy filename
                </button>
                <button
                  type="button"
                  className="reader-context-panel-button"
                  onClick={() => void toolbar.copyPageLink()}
                >
                  Copy link
                </button>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            className="reader-context-panel-button"
            onClick={() => {
              restorePanelTrigger();
              toolbar.handleShowBookmarks();
            }}
            disabled={!toolbar.bookId}
          >
            <ReaderIcon name="bookmarks" />
            Bookmarks
          </button>
          <button
            type="button"
            className="reader-context-panel-button"
            onClick={() => {
              restorePanelTrigger();
              toolbar.openListeningDashboard();
            }}
          >
            <ReaderIcon name="dashboard" />
            Dashboard
          </button>
          <span className="reader-context-mobile-divider" />
          <button
            type="button"
            className="reader-context-panel-button reader-context-mobile-global"
            onClick={() => {
              restorePanelTrigger();
              toolbar.openBookSelect();
            }}
          >
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
          <button
            type="button"
            className="reader-context-panel-button reader-context-mobile-global"
            onClick={() => {
              restorePanelTrigger();
              toolbar.openSettings();
            }}
          >
            <ReaderIcon name="settings" />
            Settings
          </button>
        </div>
      ) : null}

      <nav className="reader-context-mobile-nav" aria-label="Mobile reading controls">
        <button
          type="button"
          onClick={(event) => togglePanel('mode', event)}
          aria-expanded={toolbar.activePanel === 'mode'}
          aria-controls="reader-mode-panel"
        >
          <ReaderIcon name={activeMode.icon} />
          <span>{activeMode.label}</span>
        </button>
        <button
          type="button"
          onClick={toolbar.openSearch}
          disabled={!toolbar.bookId}
          aria-keyshortcuts="/"
          title="Search this book (/)"
        >
          <ReaderIcon name="search" />
          <span>Search</span>
        </button>
        <button
          type="button"
          onClick={toolbar.openToc}
          disabled={toolbar.controlsDisabled}
          aria-keyshortcuts="C"
          title="Table of contents (C)"
        >
          <ReaderIcon name="toc" />
          <span>TOC</span>
        </button>
        <button
          type="button"
          onClick={(event) => togglePanel('listen', event)}
          disabled={toolbar.controlsDisabled}
          aria-expanded={toolbar.activePanel === 'listen'}
          aria-controls="reader-listen-panel"
          aria-keyshortcuts="S"
          title="Listen controls (S to play or stop)"
        >
          <ReaderIcon name="listen" />
          <span>Listen</span>
        </button>
        <button
          type="button"
          onClick={(event) => togglePanel('more', event)}
          aria-expanded={toolbar.activePanel === 'more'}
          aria-controls="reader-more-panel"
        >
          <ReaderIcon name="more" />
          <span>More</span>
        </button>
      </nav>
    </section>
  );
}
