import type { PageText } from '@/types/app';

interface TextModalProps {
  open: boolean;
  text: PageText | null;
  loading: boolean;
  onClose: () => void;
  title: string;
  onRegenerate: () => void;
  regenerated: boolean;
}

export default function TextModal({
  open,
  text,
  loading,
  onClose,
  title,
  onRegenerate,
  regenerated
}: TextModalProps) {
  if (!open) {
    return null;
  }

  const generatedMarker = text?.source === 'ai' || regenerated;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal-header">
          <h2 className="modal-title">
            {title}
            {generatedMarker ? <span className="modal-marker">• Generated</span> : null}
          </h2>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <section className="modal-body">
          {loading && <p className="modal-status">Loading page text…</p>}
          {!loading && !text && <p className="modal-status">No text available.</p>}
          {!loading && text ? <pre className="modal-content">{text.text}</pre> : null}
        </section>
        <footer className="modal-footer">
          <button
            type="button"
            className="button button-secondary"
            onClick={onRegenerate}
            disabled={loading}
          >
            Regenerate
          </button>
          <button type="button" className="button button-primary" onClick={onClose} disabled={loading}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
