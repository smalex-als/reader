import CloseIcon from '@/components/CloseIcon';
import type { TocEntry } from '@/types/app';
import { getDetailedTocLevel } from '@/lib/toc';

interface TocModalProps {
  open: boolean;
  entries: TocEntry[];
  variant: 'main' | 'detailed';
  loading: boolean;
  generating: boolean;
  saving: boolean;
  manifestLength: number;
  chapterGeneratingIndex: number | null;
  allowGenerate: boolean;
  onClose: () => void;
  onVariantChange: (variant: 'main' | 'detailed') => void;
  onGenerate: (variant: 'main' | 'detailed') => void;
  onSave: (variant: 'main' | 'detailed') => void;
  onAddEntry: () => void;
  onRemoveEntry: (index: number) => void;
  onUpdateEntry: (index: number, next: TocEntry) => void;
  onGenerateChapter: (index: number) => void;
}

export default function TocModal({
  open,
  entries,
  variant,
  loading,
  generating,
  saving,
  manifestLength,
  chapterGeneratingIndex,
  allowGenerate,
  onClose,
  onVariantChange,
  onGenerate,
  onSave,
  onAddEntry,
  onRemoveEntry,
  onUpdateEntry,
  onGenerateChapter
}: TocModalProps) {
  if (!open) {
    return null;
  }

  const busy = loading || generating || saving;
  const chapterBusy = chapterGeneratingIndex !== null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-toc">
        <header className="modal-header">
          <h2 className="modal-title">Edit Table of Contents</h2>
          <button
            type="button"
            className="button button-ghost modal-icon-button"
            onClick={onClose}
            aria-label="Close table of contents editor"
            title="Close table of contents editor"
          >
            <CloseIcon />
          </button>
        </header>
        <section className="modal-body">
          {loading && <p className="modal-status">Loading table of contents…</p>}
          {!loading && entries.length === 0 && (
            <p className="modal-status">No table of contents entries yet.</p>
          )}
          <div className="modal-toolbar">
            <button
              type="button"
              className={variant === 'main' ? 'button button-primary' : 'button button-secondary'}
              onClick={() => onVariantChange('main')}
              disabled={busy}
            >
              Main TOC
            </button>
            <button
              type="button"
              className={variant === 'detailed' ? 'button button-primary' : 'button button-secondary'}
              onClick={() => onVariantChange('detailed')}
              disabled={busy}
            >
              Detailed TOC
            </button>
          </div>
          <div className="modal-toolbar">
            <button type="button" className="button" onClick={onAddEntry} disabled={busy}>
              Add Entry
            </button>
            <button
              type="button"
              className="button"
              onClick={() => onGenerate(variant)}
              disabled={busy || !allowGenerate}
            >
              {generating
                ? 'Generating…'
                : variant === 'detailed'
                  ? 'Generate Detailed TOC'
                  : 'Generate from OCR'}
            </button>
          </div>
          <div className="toc-list">
            {entries.map((entry, index) => (
              <div
                key={index}
                className={`toc-row ${
                  variant === 'detailed' ? 'toc-row-detailed ' : ''
                }${
                  variant === 'detailed' ? `toc-row-level-${getDetailedTocLevel(entries, index)}` : ''
                }`}
              >
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
                {variant === 'detailed' ? (
                  <label className="toc-field toc-level">
                    Level
                    <select
                      className="input"
                      value={entry.level ?? 0}
                      onChange={(event) => {
                        const raw = Number.parseInt(event.target.value, 10);
                        const level = Number.isInteger(raw) ? Math.max(0, Math.min(raw, 2)) : 0;
                        onUpdateEntry(index, { ...entry, level });
                      }}
                      disabled={busy}
                    >
                      <option value={0}>Level 0</option>
                      <option value={1}>Level 1</option>
                      <option value={2}>Level 2</option>
                    </select>
                  </label>
                ) : null}
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
                  className="button button-secondary"
                  onClick={() => onGenerateChapter(index)}
                  disabled={busy || chapterBusy || !allowGenerate}
                >
                  {chapterGeneratingIndex === index ? 'Generating…' : 'Generate Text'}
                </button>
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
          <button
            type="button"
            className="button button-secondary"
            onClick={() => onSave(variant)}
            disabled={busy}
          >
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
