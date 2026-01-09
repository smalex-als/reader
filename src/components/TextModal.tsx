import { useEffect, useMemo, useState } from 'react';
import type { PageText } from '@/types/app';

interface TextModalProps {
  open: boolean;
  text: PageText | null;
  loading: boolean;
  saving: boolean;
  onClose: () => void;
  title: string;
  onRegenerate: () => void;
  regenerated: boolean;
  onSave: (nextText: string) => void;
  onCopyText: (textValue: string) => void;
}

export default function TextModal({
  open,
  text,
  loading,
  saving,
  onClose,
  title,
  onRegenerate,
  regenerated,
  onSave,
  onCopyText
}: TextModalProps) {
  if (!open) {
    return null;
  }

  const [draftText, setDraftText] = useState('');
  const generatedMarker = text?.source === 'ai' || regenerated;

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraftText(text?.text ?? '');
  }, [open, text?.text]);

  const displayedText = useMemo(() => {
    if (!text) {
      return '';
    }
    return text.text || '';
  }, [text]);
  const isDirty = draftText !== displayedText;
  const canCopy = Boolean(draftText.trim());

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-wide">
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
              <textarea
                className="modal-textarea"
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                disabled={saving}
              />
              {isDirty ? <p className="modal-status">Unsaved changes.</p> : null}
            </>
          ) : null}
        </section>
        <footer className="modal-footer">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => onCopyText(draftText)}
            disabled={loading || saving || !canCopy}
          >
            Copy Text
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={onRegenerate}
            disabled={loading || saving}
          >
            Regenerate
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => onSave(draftText)}
            disabled={loading || saving || !isDirty}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={onClose}
            disabled={loading || saving}
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
