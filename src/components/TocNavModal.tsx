import { useEffect, useMemo, useRef } from 'react';
import CloseIcon from '@/components/CloseIcon';
import { formatListeningTime } from '@/lib/listeningTime';
import { getDetailedTocLevel } from '@/lib/toc';
import {
  appActions,
  selectModalOpen,
  selectReaderSession,
  selectTocWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

interface TocNavModalProps {
  onGoToPage: (pageIndex: number) => void;
}

export default function TocNavModal({ onGoToPage }: TocNavModalProps) {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectModalOpen('tocNav'));
  const { currentPage } = useAppSelector(selectReaderSession);
  const {
    variant,
    entries: tocEntries,
    detailedEntries,
    loading
  } = useAppSelector(selectTocWorkflow);
  const activeEntryRef = useRef<HTMLButtonElement | null>(null);
  const modalBodyRef = useRef<HTMLElement | null>(null);
  const entries = useMemo(() => {
    const source = variant === 'detailed' ? detailedEntries : tocEntries;
    return [...source]
      .filter((entry) => Number.isInteger(entry.page))
      .sort((a, b) => a.page - b.page);
  }, [detailedEntries, tocEntries, variant]);
  const handleClose = () => {
    dispatch(appActions.closeModal('tocNav'));
  };
  const handleGoToPage = (pageIndex: number) => {
    dispatch(appActions.closeModal('tocNav'));
    onGoToPage(pageIndex);
  };

  useEffect(() => {
    if (!open || loading) {
      return;
    }
    const activeEntry = activeEntryRef.current;
    if (!activeEntry) {
      return;
    }
    if (variant === 'detailed') {
      const container = modalBodyRef.current;
      if (!container) {
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const entryRect = activeEntry.getBoundingClientRect();
      const targetTop =
        container.scrollTop +
        (entryRect.top - containerRect.top) -
        container.clientHeight / 2 +
        entryRect.height / 2;
      container.scrollTo({
        top: Math.max(0, targetTop),
        behavior: 'auto'
      });
      return;
    }
    activeEntry.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [open, loading, currentPage, variant, entries]);

  if (!open) {
    return null;
  }

  const formatWordCount = (value?: number) => {
    if (typeof value !== 'number') {
      return 'Text stats unavailable';
    }
    if (value <= 0) {
      return 'No text';
    }
    return new Intl.NumberFormat(undefined, { notation: value >= 1000 ? 'compact' : 'standard' }).format(value) + ' words';
  };

  const formatTocListeningTime = (value?: number) => {
    if (typeof value !== 'number') {
      return 'audio estimate unavailable';
    }
    return formatListeningTime(value);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-toc">
        <header className="modal-header">
          <h2 className="modal-title">Table of Contents</h2>
          <button
            type="button"
            className="button button-ghost modal-icon-button"
            onClick={handleClose}
            aria-label="Close table of contents"
            title="Close table of contents"
          >
            <CloseIcon />
          </button>
        </header>
        <section ref={modalBodyRef} className="modal-body">
          {loading && <p className="modal-status">Loading table of contents…</p>}
          {!loading && entries.length === 0 && (
            <p className="modal-status">No table of contents entries yet.</p>
          )}
          <div className="modal-toolbar">
            <button
              type="button"
              className={variant === 'main' ? 'button button-primary' : 'button button-secondary'}
              onClick={() => dispatch(appActions.setTocVariant('main'))}
            >
              Main TOC
            </button>
            <button
              type="button"
              className={variant === 'detailed' ? 'button button-primary' : 'button button-secondary'}
              onClick={() => dispatch(appActions.setTocVariant('detailed'))}
            >
              Detailed TOC
            </button>
          </div>
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
                    type="button"
                    className={`toc-nav-button ${isActive ? 'toc-nav-button-active' : ''}`}
                    onClick={() => handleGoToPage(entry.page)}
                    aria-current={isActive ? 'page' : undefined}
                    ref={isActive ? activeEntryRef : null}
                  >
                    <span className="toc-nav-copy">
                      <span className="toc-nav-title">{entry.title}</span>
                      <span className="toc-nav-meta">
                        {formatWordCount(entry.stats?.wordCount)} · {formatTocListeningTime(entry.stats?.listeningSeconds)}
                      </span>
                    </span>
                    <span className="toc-nav-page">Page {entry.page + 1}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        <footer className="modal-footer">
          <button type="button" className="button button-primary" onClick={handleClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
