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
  const [copied, setCopied] = useState(false);
  const generatedMarker = text?.source === 'ai' || regenerated;

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraftText(text?.text ?? '');
  }, [open, text?.text]);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timeout = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

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
          <button type="button" className="button button-ghost" onClick={onClose} aria-label="Close">
            X
          </button>
        </header>
        <section className="modal-body modal-body-text">
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
            </>
          ) : null}
        </section>
        <footer className="modal-footer modal-footer-right">
          <button
            type="button"
            className={`button button-secondary ${copied ? 'button-active' : ''}`}
            onClick={() => {
              onCopyText(draftText);
              setCopied(true);
            }}
            disabled={loading || saving || !canCopy}
          >
            {copied ? 'Copied' : 'Copy Text'}
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
        </footer>
      </div>
    </div>
  );
}
