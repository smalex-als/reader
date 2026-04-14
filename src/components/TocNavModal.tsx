import { useEffect, useRef } from 'react';
import type { TocEntry } from '@/types/app';
import { getDetailedTocLevel } from '@/lib/toc';

interface TocNavModalProps {
  open: boolean;
  entries: TocEntry[];
  variant: 'main' | 'detailed';
  loading: boolean;
  currentPage: number;
  onClose: () => void;
  onVariantChange: (variant: 'main' | 'detailed') => void;
  onGoToPage: (pageIndex: number) => void;
}

export default function TocNavModal({
  open,
  entries,
  variant,
  loading,
  currentPage,
  onClose,
  onVariantChange,
  onGoToPage
}: TocNavModalProps) {
  const activeEntryRef = useRef<HTMLButtonElement | null>(null);
  const modalBodyRef = useRef<HTMLElement | null>(null);

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
    if (!value) {
      return 'No text';
    }
    return new Intl.NumberFormat(undefined, { notation: value >= 1000 ? 'compact' : 'standard' }).format(value) + ' words';
  };

  const formatListeningTime = (seconds?: number) => {
    if (!seconds) {
      return 'no audio estimate';
    }
    const minutes = Math.round(seconds / 60);
    if (minutes < 1) {
      return '<1 min';
    }
    return `~${minutes} min`;
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-toc">
        <header className="modal-header">
          <h2 className="modal-title">Table of Contents</h2>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Close
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
              onClick={() => onVariantChange('main')}
            >
              Main TOC
            </button>
            <button
              type="button"
              className={variant === 'detailed' ? 'button button-primary' : 'button button-secondary'}
              onClick={() => onVariantChange('detailed')}
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
                    onClick={() => onGoToPage(entry.page)}
                    aria-current={isActive ? 'page' : undefined}
                    ref={isActive ? activeEntryRef : null}
                  >
                    <span className="toc-nav-copy">
                      <span className="toc-nav-title">{entry.title}</span>
                      <span className="toc-nav-meta">
                        {formatWordCount(entry.stats?.wordCount)} · {formatListeningTime(entry.stats?.listeningSeconds)}
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
          <button type="button" className="button button-primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
