import type { TocEntry } from '@/types/app';

interface TocNavModalProps {
  open: boolean;
  entries: TocEntry[];
  loading: boolean;
  onClose: () => void;
  onGoToPage: (pageIndex: number) => void;
}

export default function TocNavModal({
  open,
  entries,
  loading,
  onClose,
  onGoToPage
}: TocNavModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal-header">
          <h2 className="modal-title">Table of Contents</h2>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <section className="modal-body">
          {loading && <p className="modal-status">Loading table of contents…</p>}
          {!loading && entries.length === 0 && (
            <p className="modal-status">No table of contents entries yet.</p>
          )}
          <ul className="toc-nav-list">
            {entries.map((entry, index) => (
              <li key={`${entry.title}-${entry.page}-${index}`} className="toc-nav-item">
                <button
                  type="button"
                  className="toc-nav-button"
                  onClick={() => onGoToPage(entry.page)}
                >
                  <span className="toc-nav-title">{entry.title}</span>
                  <span className="toc-nav-page">Page {entry.page + 1}</span>
                </button>
              </li>
            ))}
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
