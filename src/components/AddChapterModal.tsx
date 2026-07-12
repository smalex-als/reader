import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import CloseIcon from '@/components/CloseIcon';
import ModalShell from '@/components/ModalShell';
import type { CreateChapterSource } from '@/api/bookSession';

type AddChapterModalProps = {
  busy: boolean;
  open: boolean;
  onClose: () => void;
  onSubmit: (details: {
    chapterTitle: string;
    source: CreateChapterSource;
    sourceUrl: string;
  }) => Promise<void>;
};

export default function AddChapterModal({
  busy,
  open,
  onClose,
  onSubmit
}: AddChapterModalProps) {
  const titleId = useId();
  const initialFocusRef = useRef<HTMLSelectElement>(null);
  const [chapterTitle, setChapterTitle] = useState('');
  const [source, setSource] = useState<CreateChapterSource>('blank');
  const [sourceUrl, setSourceUrl] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }
    setChapterTitle('');
    setSource('blank');
    setSourceUrl('');
  }, [open]);

  if (!open) {
    return null;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (source === 'youtube' && !sourceUrl.trim()) {
      return;
    }
    await onSubmit({ chapterTitle, source, sourceUrl });
  };

  return (
    <ModalShell
      ariaLabelledBy={titleId}
      className="add-chapter-modal"
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      initialFocusRef={initialFocusRef}
      onClose={onClose}
    >
      <form onSubmit={(event) => void handleSubmit(event)}>
        <header className="modal-header">
          <h2 id={titleId} className="modal-title">Add Chapter</h2>
          <button
            type="button"
            className="button button-ghost modal-icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close add chapter"
          >
            <CloseIcon />
          </button>
        </header>
        <section className="modal-body add-chapter-modal-body">
          <label className="text-viewer-setting add-chapter-modal-field">
            <span className="text-viewer-setting-label">Source</span>
            <select
              ref={initialFocusRef}
              className="text-viewer-select"
              value={source}
              onChange={(event) => setSource(event.target.value as CreateChapterSource)}
              disabled={busy}
            >
              <option value="blank">Blank chapter</option>
              <option value="youtube">YouTube URL</option>
            </select>
          </label>
          <label className="text-viewer-setting add-chapter-modal-field">
            <span className="text-viewer-setting-label">Chapter title</span>
            <input
              className="text-viewer-input"
              value={chapterTitle}
              onChange={(event) => setChapterTitle(event.target.value)}
              placeholder="Optional"
              disabled={busy}
            />
          </label>
          {source === 'youtube' ? (
            <label className="text-viewer-setting add-chapter-modal-field">
              <span className="text-viewer-setting-label">YouTube URL</span>
              <input
                type="url"
                className="text-viewer-input"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                required
                disabled={busy}
              />
              <span className="text-viewer-placeholder-help">
                The URL becomes the initial chapter text. MP3 download continues in the background.
              </span>
            </label>
          ) : null}
        </section>
        <footer className="modal-footer modal-footer-right">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className="button"
            disabled={busy || (source === 'youtube' && !sourceUrl.trim())}
          >
            {busy ? 'Creating…' : 'Add Chapter'}
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}
