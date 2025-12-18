import type { TocEntry } from '@/types/app';

interface TocModalProps {
  open: boolean;
  entries: TocEntry[];
  loading: boolean;
  generating: boolean;
  saving: boolean;
  manifestLength: number;
  onClose: () => void;
  onGenerate: () => void;
  onSave: () => void;
  onAddEntry: () => void;
  onRemoveEntry: (index: number) => void;
  onUpdateEntry: (index: number, next: TocEntry) => void;
}

export default function TocModal({
  open,
  entries,
  loading,
  generating,
  saving,
  manifestLength,
  onClose,
  onGenerate,
  onSave,
  onAddEntry,
  onRemoveEntry,
  onUpdateEntry
}: TocModalProps) {
  if (!open) {
    return null;
  }

  const busy = loading || generating || saving;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal-header">
          <h2 className="modal-title">Edit Table of Contents</h2>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <section className="modal-body">
          {loading && <p className="modal-status">Loading table of contents…</p>}
          {!loading && entries.length === 0 && (
            <p className="modal-status">No table of contents entries yet.</p>
          )}
          <div className="modal-toolbar">
            <button type="button" className="button" onClick={onAddEntry} disabled={busy}>
              Add Entry
            </button>
            <button type="button" className="button" onClick={onGenerate} disabled={busy}>
              {generating ? 'Generating…' : 'Generate from OCR'}
            </button>
          </div>
          <div className="toc-list">
            {entries.map((entry, index) => (
              <div key={`${entry.title}-${entry.page}-${index}`} className="toc-row">
                <label className="toc-field">
                  Title
                  <input
                    type="text"
                    className="input"
                    value={entry.title}
                    placeholder="Section title"
                    onChange={(event) =>
                      onUpdateEntry(index, { ...entry, title: event.target.value })
                    }
                    disabled={busy}
                  />
                </label>
                <label className="toc-field toc-page">
                  Page
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, manifestLength)}
                    className="input"
                    value={entry.page + 1}
                    onChange={(event) => {
                      const raw = Number.parseInt(event.target.value, 10);
                      const normalized = Number.isInteger(raw) ? raw - 1 : 0;
                      const clamped = Math.max(0, Math.min(normalized, manifestLength - 1));
                      onUpdateEntry(index, { ...entry, page: clamped });
                    }}
                    disabled={busy}
                  />
                </label>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => onRemoveEntry(index)}
                  disabled={busy}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>
        <footer className="modal-footer">
          <button type="button" className="button button-secondary" onClick={onSave} disabled={busy}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="button button-primary" onClick={onClose} disabled={busy}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
