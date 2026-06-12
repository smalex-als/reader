import CloseIcon from '@/components/CloseIcon';
import { useTocManager } from '@/hooks/useTocManager';
import { getDetailedTocLevel } from '@/lib/toc';
import {
  appActions,
  selectBookChapterCount,
  selectBookManifest,
  selectBookType,
  selectModalOpen,
  selectReaderSession,
  selectTocWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export default function TocModal() {
  const dispatch = useAppDispatch();
  const {
    handleAddTocEntry,
    handleGenerateToc,
    handleUpdateTocEntry,
    handleGenerateChapter,
    handleRemoveTocEntry,
    handleSaveToc
  } = useTocManager();
  const open = useAppSelector(selectModalOpen('tocManage'));
  const { currentPage } = useAppSelector(selectReaderSession);
  const bookType = useAppSelector(selectBookType);
  const chapterCount = useAppSelector(selectBookChapterCount);
  const manifest = useAppSelector(selectBookManifest);
  const {
    variant,
    entries: tocEntries,
    detailedEntries,
    loading,
    generating,
    saving,
    chapterGeneratingIndex
  } = useAppSelector(selectTocWorkflow);
  const entries = variant === 'detailed' ? detailedEntries : tocEntries;
  const manifestLength = bookType === 'text' ? chapterCount : manifest.length;
  const allowGenerate = bookType !== 'text';
  const handleClose = () => {
    dispatch(appActions.closeModal('tocManage'));
  };

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
            onClick={handleClose}
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
              onClick={() => dispatch(appActions.setTocVariant('main'))}
              disabled={busy}
            >
              Main TOC
            </button>
            <button
              type="button"
              className={variant === 'detailed' ? 'button button-primary' : 'button button-secondary'}
              onClick={() => dispatch(appActions.setTocVariant('detailed'))}
              disabled={busy}
            >
              Detailed TOC
            </button>
          </div>
          <div className="modal-toolbar">
            <button
              type="button"
              className="button"
              onClick={() => handleAddTocEntry(currentPage, variant)}
              disabled={busy}
            >
              Add Entry
            </button>
            <button
              type="button"
              className="button"
              onClick={() => void handleGenerateToc(variant)}
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
                      handleUpdateTocEntry(index, { ...entry, title: event.target.value }, variant)
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
                        handleUpdateTocEntry(index, { ...entry, level }, variant);
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
                      handleUpdateTocEntry(index, { ...entry, page: clamped }, variant);
                    }}
                    disabled={busy}
                  />
                </label>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void handleGenerateChapter(index)}
                  disabled={busy || chapterBusy || !allowGenerate}
                >
                  {chapterGeneratingIndex === index ? 'Generating…' : 'Generate Text'}
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => handleRemoveTocEntry(index, variant)}
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
            onClick={() => void handleSaveToc(variant)}
            disabled={busy}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="button button-primary" onClick={handleClose} disabled={busy}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
