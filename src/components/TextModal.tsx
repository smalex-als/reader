import { useEffect, useMemo, useState } from 'react';
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
  const hasNarration = Boolean(text?.narrationText?.trim());
  const [view, setView] = useState<'narration' | 'original'>(hasNarration ? 'narration' : 'original');

  useEffect(() => {
    if (!open) {
      return;
    }
    setView(hasNarration ? 'narration' : 'original');
  }, [hasNarration, open]);

  const displayedText = useMemo(() => {
    if (!text) {
      return '';
    }
    if (view === 'narration') {
      return text.narrationText || '';
    }
    return text.text || '';
  }, [text, view]);

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
          {!loading && text ? (
            <>
              <div className="modal-toolbar">
                <div className="segmented" role="tablist" aria-label="Text view">
                  <button
                    type="button"
                    className={`segmented-item ${view === 'original' ? 'segmented-item-active' : ''}`}
                    onClick={() => setView('original')}
                    disabled={loading}
                    role="tab"
                    aria-selected={view === 'original'}
                  >
                    Extracted
                  </button>
                  <button
                    type="button"
                    className={`segmented-item ${view === 'narration' ? 'segmented-item-active' : ''}`}
                    onClick={() => setView('narration')}
                    disabled={loading || !hasNarration}
                    role="tab"
                    aria-selected={view === 'narration'}
                  >
                    Narration
                  </button>
                </div>
              </div>
              {!hasNarration && view === 'narration' ? (
                <p className="modal-status">No narration-adapted text available.</p>
              ) : (
                <pre className="modal-content">{displayedText}</pre>
              )}
            </>
          ) : null}
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
